import { useSemester } from "../helpers/useSemester";
import { useSyncedSetting } from "../helpers/useSyncedSetting";
import { makeSemesterRecap, type SemesterRecap as Recap } from "../helpers/semesterRecap";
import { SemesterRecap } from "../components/SemesterRecap";
import { useLearningMilestones } from "../helpers/useLearningMilestones";
import { BarChart3, BookCheck, LibraryBig, Search } from "lucide-react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Aura, auraHost } from "../components/Aura";
import { Button } from "../components/Button";
import type { LessonTopic } from "../components/MissedLesson";
import type { QuizMode, QuizSnapshot } from "../components/QuizSession";
import type { QuestionDTO } from "../endpoints/state_GET.schema";
import { dateKey } from "../helpers/dateKey";
import { haptic } from "../helpers/haptics";
import { MIN_ROUND, matchPairs } from "../helpers/matchPairs";
import { readCache, writeCache, isNetworkError } from "../helpers/offlineCache";
import { readPractice, savePractice, type SavedPractice } from "../helpers/practiceMemory";
import { applyPrefs, readPrefs } from "../helpers/prefs";
import { COURSES, EXAM_PACE, itemId, momentGreeting, makeGreeting, studyEngine, type CourseCode, type Filter, type RoundItem, type SessionCard, type StudyMode } from "../helpers/studyEngine";
import { reviewCard, type Flashcard, type Hypothetical } from "../helpers/studyMaterials";
import { examMoment, lastPass, recapChanges, streakHistory, unitStatuses, type UnitStatus, missedLessonBatch, mixRound, nextReviewDay, readyCards, reviewGreeting } from "../helpers/studySession";
import { toast } from "../helpers/toast";
import { reviewEvidence } from "../helpers/topicReview";
import { afterOverlayClose } from "../helpers/useBackClose";
import { useLawstinAi } from "../helpers/useLawstinAi";
import { useLawstinData } from "../helpers/useLawstinData";
import { useLawstinSettings } from "../helpers/useLawstinSettings";
import { useLogStudy } from "../helpers/useLogStudy";
import { useStudyMaterials } from "../helpers/useStudyMaterials";
import { useNotes } from "../helpers/useNotes";
import { useSyllabus } from "../helpers/useSyllabus";
import { type WrittenEntry, useWritten } from "../helpers/useWritten";
import { useCourseTasks } from "../helpers/useCourseTasks";
import styles from "./_index.module.css";
const loadCourses = () => import("../components/Courses");
const Courses = lazy(() => loadCourses().then(module => ({ default: module.Courses })));
// Screens opened from the Study tab load on demand and are warmed in the background after first paint.
const loadQuiz = () => import("../components/QuizSession");
const QuizSession = lazy(() => loadQuiz().then((m) => ({ default: m.QuizSession })));
const SettingsPage = lazy(() => import("../components/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const MissedLesson = lazy(() => import("../components/MissedLesson").then((m) => ({ default: m.MissedLesson })));
const WrittenPractice = lazy(() => import("../components/WrittenPractice").then((m) => ({ default: m.WrittenPractice })));
const MatchGame = lazy(() => import("../components/MatchGame").then((m) => ({ default: m.MatchGame })));

import { BottomSheet } from "../components/BottomSheet";
import { ExamPicker } from "../components/ExamPicker";
import { CourseSheet, CourseRulebook } from "../components/CourseSheet";
import { KeyboardShortcuts } from "../components/KeyboardShortcuts";
import { SessionRecap } from "../components/SessionRecap";
import { ToolHost } from "../components/ToolHost";
import { HowItWorks } from "../components/HowItWorks";
import { TopicTools } from "../components/TopicTools";
import { SearchTab } from "./SearchTab";
import { ProgressView } from "./ProgressTab";
import { LoadingCard, type MissedTopic } from "./StudyParts";
import { StudyView } from "./StudyTab";
import { useDayPlan } from "./useDayPlan";

type Tab = "study" | "courses" | "search" | "progress";
/** Builds a session's items. `exclude` holds what the running session already has (questions are also removed from the engine). */
type Source = (eng: ReturnType<typeof studyEngine>, exclude: Set<string>) => RoundItem[];
const NONE = new Set<string>();
const TABS = ["study", "courses", "search", "progress"] as const;
const tabFromHash = (): Tab => {
  const hash = window.location.hash;
  const t = hash.split("/")[1];
  if (t === "activity") {
    history.replaceState(null, "", "#/progress");
    return "progress";
  }
  return TABS.includes(t as Tab) ? (t as Tab) : "study";
};
const NAME = "Austin";

const readRecent = (): string[] => {
  try { const a = JSON.parse(localStorage.getItem("lawstin-greetings") ?? "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
};
const saveRecent = (g: string) => {
  try { localStorage.setItem("lawstin-greetings", JSON.stringify([g, ...readRecent().filter((x) => x !== g)].slice(0, 40))); } catch { /* storage unavailable */ }
};

export default function LawstinApp({ userId, email }: { userId: string; email: string | null }) {
  const semester = useSemester();
  const { query, answer, queueAnswer, mark } = useLawstinData();
  const { harder, explain } = useLawstinAi();
  const settings = useLawstinSettings();
  const state = query.data;
  // One study-progress store for the whole app: sessions here and the Courses tab share it.
  const store = useStudyMaterials(userId);
  const relatedFetching = useIsFetching({ predicate: (q) => ["lawstin-written", "lawstin-syllabus"].includes(String(q.queryKey[0])) });
  const queryClient = useQueryClient();
  const written = useWritten();
  const syllabus = useSyllabus();
  const ilNotes = useNotes("il").notes, asyNotes = useNotes("asy").notes, prNotes = useNotes("pr").notes;
  const notes = useMemo(() => ([["il", ilNotes], ["asy", asyNotes], ["pr", prNotes]] as const).flatMap(([course, rows]) =>
    Object.entries(rows).filter(([, r]) => r.text.trim()).map(([unit, r]) => ({ id: `${course}:${unit}`, course, title: unit, body: r.text, topic: unit }))), [ilNotes, asyNotes, prNotes]);
  const log = useLogStudy();
  // The day key follows the clock so a session left open past midnight counts toward the new day.
  const [day, setDay] = useState(() => dateKey.today());
  useEffect(() => {
    const tick = () => setDay(dateKey.today());
    const timer = window.setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const e = useMemo(() => studyEngine(state, day, { weakExtra: written.weak, reviews: store.record.reviews }), [state, day, written.weak, store.record.reviews, semester.value]);
  const flashcards = useMemo(() => store.materials.filter((m): m is Flashcard => m.kind === "flashcard"), [store.materials]);
  const hypos = useMemo(() => store.materials.filter((m): m is Hypothetical => m.kind === "hypothetical"), [store.materials]);
  const [prefs, setPrefs] = useState(readPrefs);
  const planReady = semester.loaded && !!state && !store.loading && (!settings.query.isPending || !navigator.onLine);
  const daily = useDayPlan({ e, record: store.record, flashcards, entries: written.list, lastEssay: written.lastEssay,
    fallbackGoal: settings.query.data?.settings.dailyGoal, enabled: prefs.plan, ready: planReady, userId });
  const { plan, cardsFor } = daily;
  const planOn = plan.active;
  const goal = plan.goal;
  const learning = useLearningMilestones(unitStatuses(e, syllabus), planReady, userId);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [coursesVisited, setCoursesVisited] = useState(() => tabFromHash() === "courses");
  const [filter, setFilter] = useState<Filter>(() => (readPractice(userId)?.key.split(":")[1] as Filter | undefined) ?? "all");
  const [session, setSessionState] = useState<{ items: RoundItem[]; mode: QuizMode; key: number; source: Source; resumeKey?: string; resume?: QuizSnapshot; seconds?: number; filter?: Filter } | null>(null);
  // A practice session survives closing the app or refreshing, until the end of the study day.
  const [lastPractice, setLastPractice] = useState<SavedPractice | null>(() => readPractice(userId));
  const checkpoint = (saved: SavedPractice | null) => { setLastPractice(saved); savePractice(userId, saved); };
  const sessionWork = useRef({ opened: 0, before: [] as UnitStatus[], answers: new Map<string, boolean>() });
  const setSession = (value: typeof session) => {
    if (value) {
      const saved = readCache<{ day: string; key?: string; before: UnitStatus[] }>(`session-units:${userId}`);
      const before = value.resume && saved?.day === day && saved.key === value.resumeKey ? saved.before : unitStatuses(e, syllabus);
      const answers = new Map<string, boolean>();
      value.resume?.items.forEach((it, i) => { const result = value.resume?.results[i]; if (typeof result === "boolean") answers.set(itemId(it), result); });
      sessionWork.current = { opened: Date.now(), before, answers };
      writeCache(`session-units:${userId}`, { day, key: value.resumeKey, before });
    }
    setSessionState(value);
  };
  const [recap, setRecap] = useState<{ answered: number; right: number; changes: ReturnType<typeof recapChanges>; nextReview: string | null; session: NonNullable<typeof session>; snap?: QuizSnapshot } | null>(null);
  const [courseSheet, setCourseSheet] = useState<CourseCode | null>(null);
  const [rulebook, setRulebook] = useState<{ course: CourseCode; topic?: string; match?: string; warmup?: boolean; recall?: boolean } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { tasks } = useCourseTasks();
  const [streakOpen, setStreakOpen] = useState(false);
  const [examSize, setExamSize] = useState(10);
  const moment = examMoment(day);
  const recapStore = useSyncedSetting<Recap|null>(`recap:v1:${semester.value.name}`,null);
  const [recapOpen,setRecapOpen]=useState(false);
  const currentRecap=useMemo(()=>state?makeSemesterRecap(semester.value.name,state,unitStatuses(e,syllabus),written.list,day):null,[state,e,syllabus,written.list,day,semester.value.name]);
  useEffect(()=>{if(moment.kind==="done" && planReady && relatedReady && semester.loaded && recapStore.loaded && !recapStore.error && !recapStore.value && currentRecap)recapStore.save(currentRecap);},[moment.kind,planReady,relatedFetching,semester.loaded,recapStore.loaded,recapStore.value,currentRecap]);
  const passKey = `last-pass:${userId}`;
  const [pass, setPass] = useState<{ day: string; items: RoundItem[]; done: string[]; config?: string } | null>(() => readCache<{ day: string; items: RoundItem[]; done: string[]; config?: string }>(passKey) ?? null);
  const passConfig=JSON.stringify(semester.value);
  const passReady=pass?.day===day && pass.config===passConfig;
  useEffect(() => {
    if (!planReady || moment.kind !== "eve" || !moment.course || passReady) return;
    if (navigator.onLine && ["lawstin-written", "lawstin-syllabus"].some((key) => queryClient.getQueryState([key])?.fetchStatus === "fetching")) return;
    const items=lastPass(e,moment.course,[...flashcards,...e.ruleCards(moment.course)],store.record,syllabus);
    const value = { day, config:passConfig, items, done:pass?.day===day?pass.done.filter(id=>items.some(it=>itemId(it)===id)):[] };
    setPass(value); writeCache(passKey, value);
  }, [planReady, day, pass, state, store.record, syllabus, relatedFetching,passConfig,passReady]);
  const relatedReady = !navigator.onLine || ["lawstin-written", "lawstin-syllabus"].every((key) => { const q = queryClient.getQueryState([key]); return !!q?.dataUpdatedAt || q?.status === "error"; });
  const viewReady = planReady && relatedReady && (moment.kind !== "eve" || passReady);
  const passNumbers = { goal: passReady ? pass!.items.length : 0, answered: passReady ? pass!.done.length : 0, resuming: lastPractice?.key === `missed:${moment.course}` };
  const passMirror=useSyncedSetting<{course:CourseCode;ids:string[];done:string[]}|null>(`lastpass:v1:${day}`,null);
  const passSnapshot=moment.kind==="eve" && moment.course && passReady ? {course:moment.course,ids:pass!.items.map(itemId),done:pass!.done} : null;
  const passSerialized=JSON.stringify(passSnapshot);
  useEffect(()=>{if(passSnapshot && passMirror.loaded && !passMirror.error && JSON.stringify(passMirror.value)!==passSerialized)passMirror.save(passSnapshot);},[passSerialized,passMirror.loaded,passMirror.error,passMirror.value]);

  const creditPass = (id: string) => {
    if (moment.kind !== "eve" || session?.resumeKey !== `missed:${moment.course}`) return;
    setPass((prev) => {
      if (!prev || prev.day !== day || prev.done.includes(id)) return prev;
      const next = { ...prev, done: [...prev.done, id] }; writeCache(passKey, next); return next;
    });
  };
  const [topicSheet, setTopicSheet] = useState<{ course: CourseCode; topic: string } | null>(null);
  const [examSheet, setExamSheet] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  // Settings is a full page at #/settings so the system back gesture and button close it.
  const [settingsOpen, setSettingsOpen] = useState(() => window.location.hash === "#/settings");
  useEffect(() => {
    const sync = () => {
      const on = window.location.hash === "#/settings";
      if (!on) { settingsFromApp.current = false; setPrefs(readPrefs()); }
      setSettingsOpen(on);
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  // Opened from the avatar: closing steps back so Back afterwards doesn't reopen Settings.
  const settingsFromApp = useRef(false);
  const openSettings = () => { haptic(); settingsFromApp.current = true; window.location.hash = "/settings"; };
  const closeSettings = () => {
    if (settingsFromApp.current) { settingsFromApp.current = false; history.back(); }
    else window.location.hash = `/${tab}`;
  };
  const [writing, setWriting] = useState<{ course?: CourseCode; full?: boolean; hypo?: Hypothetical; view?: WrittenEntry } | null>(null);
  const [matching, setMatching] = useState(false);
  const canMatch = useMemo(() => matchPairs(state?.questions ?? []).length >= MIN_ROUND, [state?.questions]);
  const [lessonMore, setLessonMore] = useState<MissedTopic[]>([]);
  const [lessonKey, setLessonKey] = useState(0);
  const [lesson, setLesson] = useState<LessonTopic[] | null>(null);
  // A study tool opened from the lesson: the lesson stays where it was, hidden, until Back returns to it.
  const [lessonAway, setLessonAway] = useState(false);
  const openLessonTool = (hash: string) => {
    haptic();
    setLessonAway(true);
    afterOverlayClose(() => { window.location.hash = hash; });
  };
  const endLesson = () => { setLesson(null); setLessonMore([]); setLessonAway(false); };
  // Back (the tool's button or the system gesture) steps back to the tab the lesson was opened on.
  const lessonReturn = useMemo(() => ({ back: () => afterOverlayClose(() => history.back()), end: endLesson }), []);
  useEffect(() => {
    if (!lessonAway) return;
    const sync = () => { if (!window.location.hash.startsWith("#/courses")) setLessonAway(false); };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [lessonAway]);
  const openLesson = (list: MissedTopic[]) => {
    haptic();
    const batch = missedLessonBatch(list);
    setLessonMore(batch.remaining);
    setLessonKey((k) => k + 1);
    setLesson(batch.topics.map((t) => {
      // Check with a question the lesson hasn't just explained: unseen first, then any other in the topic.
      const shown = new Set(t.items.slice(0, 3).map((it) => it.q.id));
      const others = e.questions.filter((q) => q.course === t.course && q.topic === t.topic && !shown.has(q.id));
      const check = others.find((q) => !e.prog(q.id)?.seen) ?? others[0] ?? t.items[0].q;
      return { course: t.course, topic: t.topic, rules: e.topicRules(t.course, t.topic), items: t.items, check,
        evidence: reviewEvidence(state?.progress.filter((p) => e.questions.some((q) => q.id === p.questionId && q.course === t.course && q.topic === t.topic)) ?? []) };
    }));
  };
  const [celebrate, setCelebrate] = useState(false);
  // Chosen once per open, after data loads, so the heading never swaps lines in front of you.
  const [greeting, setGreeting] = useState<string | null>(null);
  const greeted = useRef(false);
  const paneRefs = useRef<Record<Tab, HTMLDivElement | null>>({ study: null, courses: null, search: null, progress: null });
  const hiddenAt = useRef(0);
  const prevToday = useRef<number | null>(null);
  const [compact, setCompact] = useState<Record<Tab, boolean>>({ study: false, courses: false, search: false, progress: false });
  const onPaneScroll = (k: Tab, el: HTMLDivElement) => {
    const on = el.scrollTop > 52;
    setCompact((c) => (c[k] === on ? c : { ...c, [k]: on }));
  };

  useEffect(() => { applyPrefs(); }, []);
  useEffect(() => { const t = setTimeout(() => { void loadQuiz(); void loadCourses(); }, 1500); return () => clearTimeout(t); }, []);
  useEffect(() => { if (tab === "courses") setCoursesVisited(true); }, [tab]);
  useEffect(() => {
    // Only tab routes switch tabs; #/settings and #/q/<id> open on top of the current one.
    const sync = () => {
      const hash = window.location.hash;
      const t = hash.split("/")[1];
      if (t === "activity") {
        history.replaceState(null, "", "#/progress");
        setTab("progress");
        return;
      }
      if (TABS.includes(t as Tab)) setTab(t as Tab);
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = (next: Tab) => {
    haptic();
    if (tab === next) paneRefs.current[next]?.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    else { window.location.hash = `/${next}`; setTab(next); }
  };

  useEffect(() => {
    const isInputField = (el: EventTarget | null) => {
      if (!el || !(el instanceof HTMLElement)) return false;
      return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
    };

    const focusSearch = () => requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-pane="search"] input')?.focus({ preventScroll: true }));
    const handleKey = (e: KeyboardEvent) => {
      // Shortcuts belong to the tabs: an open quiz, exam, tool or sheet keeps its own keys.
      if (document.querySelector('[role="dialog"]')) return;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        if (e.key === "1") { e.preventDefault(); navigate("study"); return; }
        if (e.key === "2") { e.preventDefault(); navigate("courses"); return; }
        if (e.key === "3") { e.preventDefault(); navigate("search"); focusSearch(); return; }
        if (e.key === "4") { e.preventDefault(); navigate("progress"); return; }
        if (e.key.toLowerCase() === "k") { e.preventDefault(); navigate("search"); focusSearch(); return; }
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/" && !isInputField(e.target)) {
        e.preventDefault();
        navigate("search");
        focusSearch();
        return;
      }
      if (e.key === "?" && !isInputField(e.target)) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [tab]);

  useEffect(() => {
    const pick = (s?: typeof state) => {
      if (greeted.current) return;
      greeted.current = true;
      const kind = moment.kind === "eve" || moment.kind === "morning" ? moment.kind : streakHistory(s?.days ?? [], day).broken ? "welcome" : null;
      const g = kind ? momentGreeting(kind, NAME, readRecent()) : moment.kind === "done" ? "Well done, counselor" : makeGreeting(s, NAME, readRecent(), daily.numbers(filter).goal, daily.numbers(filter).review, filter, daily.numbers(filter).answered, { solidYesterday: learning.solidYesterday, bestStreak: studyEngine(s).streak() > streakHistory((s?.days ?? []).filter(d => d.date < day), dateKey.addDays(day, -1)).best });
      setGreeting(g); saveRecent(g);
    };
    if (planReady) { pick(state); return; }
    // Offline or slow: greet without progress-based lines rather than leave the heading empty.
    const t = setTimeout(() => pick(undefined), 2500);
    return () => clearTimeout(t);
  }, [state, greeting, planReady]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) { hiddenAt.current = Date.now(); return; }
      if (hiddenAt.current && Date.now() - hiddenAt.current > 20 * 60 * 1000) {
        greeted.current = false;
        setGreeting(null);
        query.refetch();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [query]);

  // Daily goal: celebrate once when today's count crosses the goal.
  // The Home Screen badge counts ready question and card reviews across active courses.
  const dueCount = !planReady ? null : moment.kind === "eve" ? Math.max(0, passNumbers.goal - passNumbers.answered) : moment.kind === "normal" ? daily.numbers("all").review : 0;
  useEffect(() => {
    if (dueCount === null) return;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    (dueCount ? nav.setAppBadge?.(dueCount) : nav.clearAppBadge?.())?.catch(() => {});
  }, [dueCount]);

  const sessionNumbers = session?.resumeKey === `missed:${moment.course}` && moment.kind === "eve" ? passNumbers : daily.numbers(session?.filter ?? "all");
  const todayAnswered = moment.kind === "eve" && (!session || session.resumeKey === `missed:${moment.course}`) ? passNumbers.answered : daily.numbers("all").answered;
  const celebrationGoal = moment.kind === "eve" && (!session || session.resumeKey === `missed:${moment.course}`) ? passNumbers.goal : daily.numbers("all").goal;
  const [quizNode, setQuizNode] = useState<Element | null>(null);
  useEffect(() => {
    if (!session) { setQuizNode(null); return; }
    const find = () => setQuizNode(document.querySelector('[role="dialog"][aria-label="Practice"]'));
    find(); const observer = new MutationObserver(find); observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [session?.key]);
  useEffect(() => {
    if (!state) return;
    const prev = prevToday.current;
    prevToday.current = todayAnswered;
    if ((moment.kind !== "eve" || session?.resumeKey === `missed:${moment.course}`) && moment.kind !== "morning" && moment.kind !== "done" && celebrationGoal > 0 && prev !== null && prev < celebrationGoal && todayAnswered >= celebrationGoal && readCache(`goal-celebrated:${userId}`) !== day) {
      writeCache(`goal-celebrated:${userId}`, day);
      setCelebrate(true);
      haptic();

    }
  }, [todayAnswered, state, celebrationGoal, day]);
  useEffect(() => {
    if (!celebrate) return;
    const timer = setTimeout(() => setCelebrate(false), 2400);
    return () => clearTimeout(timer);
  }, [celebrate]);

  // Sources take an engine so a running session can ask for more while skipping what it already holds.
  const latest = useRef(state);
  latest.current = state;
  const engineFor = (exclude: Set<string> = NONE) => {
    const s = latest.current;
    return studyEngine(s && exclude.size ? { ...s, questions: s.questions.filter((q) => !exclude.has(q.id)) } : s, undefined, { weakExtra: written.weak, reviews: store.record.reviews });
  };
  // The everyday session: questions with recall cards mixed in, read from the latest card progress.
  const cardState = useRef({ flashcards, record: store.record });
  cardState.current = { flashcards, record: store.record };
  const remaining = useRef(daily.remaining);
  remaining.current = daily.remaining;
  const mixed = (f: Filter, mode: StudyMode = "mixed"): Source => (eng, exclude) => {
    const { flashcards: fc, record } = cardState.current;
    // Rule cards use the full bank even when the question source excludes this session's items.
    const cards = readyCards(fc, studyEngine(latest.current).ruleCards(f), record, latest.current, f, eng.today, mode).list.filter((c) => !exclude.has(c.id));
    return mixRound(eng.buildRound(f, mode, remaining.current), cards, record);
  };
  const onCard = (card: SessionCard, correct: boolean) => {
    const credited = daily.credit(card.course);
    store.update((prev) => ({ ...prev, cards: { ...prev.cards, [card.id]: reviewCard(prev.cards[card.id], correct) } }));
    credited();
    log("card", card.id, correct);
  };
  const onExplain = async (card: SessionCard, answer: string) => {
    try {
      const r = await explain.mutateAsync({ course: card.course, topic: card.topic, prompt: card.rule ? `State the rule: ${card.front}` : card.front,
        reference: [card.back, card.reason, card.authority].filter(Boolean).join("\n"), answer });
      return r.explain;
    } catch { return null; }
  };
  const start = (source: Source, mode: QuizMode = "practice", resumeKey?: string, seconds?: number, sessionFilter: Filter = filter) => {
    const last = lastPractice;
    if (mode === "practice" && resumeKey && last?.key === resumeKey && dateKey.today(new Date(last.at)) === dateKey.today()) {
      const restored = last.snap.items.map((it) => it.q ? { ...it, q: it.q.id.startsWith("ai-") ? it.q : latest.current?.questions.find((q) => q.id === it.q.id) } : it);
      if (restored.some((it) => !it.q && !it.card)) checkpoint(null);
      else {
        haptic();
        setExamSheet(false); setTopicSheet(null); setCourseSheet(null);
        const snap = { ...last.snap, items: restored as RoundItem[] };
        setSession({ items: snap.items, mode, key: Date.now(), source, resumeKey, resume: snap, filter: sessionFilter });
        return;
      }
    }
    const items = source(engineFor(), NONE);
    if (!items.length) { toast("All caught up"); return; }
    haptic();
    setExamSheet(false); setTopicSheet(null); setCourseSheet(null);
    setSession({ items, mode, key: Date.now(), source, resumeKey, seconds, filter: sessionFilter });
  };
  const resumeStudy = () => {
    const key = lastPractice?.key.endsWith(`:${filter}`) ? lastPractice.key : `round:${filter}`;
    const kind = key.split(":")[0];
    const source: Source = kind === "starred" ? (eng) => eng.listRound(eng.queues(filter).starred)
      : mixed(filter, kind === "due" || kind === "new" ? kind : "mixed");
    start(source, "practice", key);
  };

  const startLastPass = () => {
    const course = moment.course;
    if (!course || !pass || pass.day !== day) return;
    const source: Source = (_eng, exclude) => pass.items.filter((it) => !exclude.has(itemId(it)) && !pass.done.includes(itemId(it)));
    start(source, "practice", `missed:${course}`, undefined, course);
  };
  const finished = useRef(false);
  const closeSession = (snap?: QuizSnapshot) => {
    if (!session) return;
    const ended = finished.current; finished.current = false;
    if (session.mode === "practice" && session.resumeKey) checkpoint(snap ? { key: session.resumeKey, snap, at: Date.now() } : null);
    const work = sessionWork.current;
    if (session.mode === "practice" && !ended && work.answers.size >= 3 && Date.now() - work.opened >= 2000) {
      const dates = [...work.answers.keys()].flatMap((id) => {
        const p = e.prog(id); const c = store.record.cards[id];
        return p?.due ? [p.due] : c?.due ? [c.due] : [];
      }).sort();
      setRecap({ answered: work.answers.size, right: [...work.answers.values()].filter(Boolean).length, changes: recapChanges(work.before, unitStatuses(e, syllabus)), nextReview: dates[0] ?? null, session, snap });
    }
    setSession(null);
  };
  const courseGo = (go: () => void) => { setCourseSheet(null); afterOverlayClose(go); };
  const openTool = (name: string, course: CourseCode) => courseGo(() => { window.location.hash = `/tool/${name}/${course}`; });

  // A question notification opens #/q/<id>: answer that question first, then keep going with the usual queue.
  const [deepLink, setDeepLink] = useState(() => window.location.hash.startsWith("#/q/") ? decodeURIComponent(window.location.hash.slice(4)) : null);
  useEffect(() => {
    const read = () => { if (window.location.hash.startsWith("#/q/")) setDeepLink(decodeURIComponent(window.location.hash.slice(4))); };
    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type !== "open" || typeof ev.data.url !== "string") return;
      const hash = new URL(ev.data.url).hash;
      if (hash) window.location.hash = hash;
    };
    window.addEventListener("hashchange", read);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => { window.removeEventListener("hashchange", read); navigator.serviceWorker?.removeEventListener("message", onMessage); };
  }, []);
  useEffect(() => {
    if (!deepLink || !state) return;
    setDeepLink(null);
    history.replaceState(null, "", "#/study");
    setTab("study");
    const q = state.questions.find((x) => x.id === deepLink);
    if (!q) return;
    // Later calls receive an engine without questions already in the session, so this one is only added once.
    start((eng) => [...(eng.questions.some((x) => x.id === q.id) ? [{ q, review: !!eng.prog(q.id)?.seen }] : []), ...eng.buildRound("all").filter((it) => it.q.id !== q.id)]);
  }, [deepLink, state]);

  const offlineNoted = useRef(false);
  const onAnswer = async (q: QuestionDTO, choice: string) => {
    if (q.id.startsWith("ai-")) return choice === q.answer;
    const credited = daily.credit(q.course);
    const input = { questionId: q.id, choice: choice as "A" | "B" | "C" | "D", localDate: dateKey.today() };
    const queue = () => {
      queueAnswer(input, choice === q.answer);
      credited();
      if (!offlineNoted.current) { offlineNoted.current = true; toast("Offline. Answers will sync when you’re back online."); }
      return choice === q.answer;
    };
    if (!navigator.onLine) return queue();
    try {
      const res = await answer.mutateAsync(input);
      credited();
      offlineNoted.current = false;
      return res.correct;
    } catch (err) {
      if (isNetworkError(err)) return queue();
      toast.error("Couldn’t save that answer");
      throw err;
    }
  };

  const onHarder = async (q: QuestionDTO) => {
    try {
      const res = await harder.mutateAsync({ question: q });
      return res.question;
    } catch (err) {
      toast.error((err as Error).message || "Couldn’t write a harder version");
      return null;
    }
  };

  // A query waiting for a connection is paused rather than fetching or failed.
  const loading = !state && query.isFetching;
  const failed = !state && (query.isError || query.fetchStatus === "paused");

  return (
    <div className={styles.app}>
      <main className={styles.panes} data-app-panes>
        {TABS.map((k) => (
          <div key={k} data-pane={k} ref={(el) => { paneRefs.current[k] = el; }} className={`${styles.pane} ${tab === k ? styles.paneOn : ""}`} aria-hidden={tab !== k}
            onScroll={(ev) => onPaneScroll(k, ev.currentTarget)}>
            <div className={`${styles.navbar} ${compact[k] ? styles.navbarOn : ""}`} aria-hidden="true">
              <span>{k === "study" ? "Study" : k === "progress" ? "Progress" : k === "courses" ? "Courses" : "Search"}</span>
            </div>
            <div className={`${styles.shell} ${k === "study" ? auraHost : ""}`}>
              {k === "study" && <Aura className={styles.studyAura} colors={["var(--uh-red)", "var(--course-il)", "var(--course-asy)"]} />}
              <header className={styles.head}>
                <div className={styles.headRow}>
                  <span className={styles.eyebrow}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
                  <button className={styles.avatar} onClick={openSettings} aria-label="Settings">{NAME[0]}</button>
                </div>
                <h1 key={k === "study" ? greeting ?? "" : k} className={k === "study" ? styles.greet : styles.title} style={k === "study" && !greeting ? { visibility: "hidden" } : undefined}>{k === "study" ? reviewGreeting(greeting, daily.numbers(filter).review) ?? "\u00a0" : k === "progress" ? "Progress" : k === "courses" ? "Courses" : "Search"}</h1>
              </header>

              {loading && k !== "courses" && <LoadingCard />}
              {failed && k !== "courses" && (
                <div className={`${styles.card} ${styles.empty}`}>
                  <h2>{navigator.onLine ? "Couldn’t load your questions" : "You’re offline"}</h2>
                  <Button variant="secondary" onClick={() => query.refetch()}>Try again</Button>
                </div>
              )}

              {state && k === "study" && !viewReady && <LoadingCard />}
              {state && viewReady && k === "study" && (
                <StudyView semesterName={semester.value.name} onRecap={()=>setRecapOpen(true)} e={e} syllabus={syllabus} moment={moment} passNumbers={passNumbers} essaysWritten={written.list.filter((w) => w.day >= "2026-08-01" && w.day <= day).length} onStreak={() => setStreakOpen(true)} onLastPass={startLastPass} onRulebook={(course, warmup, recall) => setRulebook({ course, warmup, recall })} onTopic={(course, topic) => setTopicSheet({ course, topic })} onTool={openTool} state={state} numbers={daily.numbers(filter)} cards={cardsFor(filter)} plan={plan.courses} courseNumbers={(c) => daily.numbers(c)} filter={filter} setFilter={setFilter} celebrate={celebrate}
                  resuming={!!lastPractice?.key.endsWith(`:${filter}`)}
                  onHow={() => { haptic(); setHowOpen(true); }}
                  nextReview={nextReviewDay(e, [...flashcards, ...e.ruleCards(filter)], store.record, filter)}
                  onMode={(mode) => start(mixed(filter, mode), "practice", mode === "ahead" ? undefined : `${mode}:${filter}`)}
                  onLesson={openLesson}
                  onStart={resumeStudy}
                  onCourse={setCourseSheet}
                  onEssay={(c) => { haptic(); setWriting({ course: c, full: moment.kind === "eve" }); }}
                  onStarred={() => start((eng) => eng.listRound(eng.queues(filter).starred), "practice", `starred:${filter}`)}
                  onExam={(size = 10) => { haptic(); setExamSize(size); setExamSheet(true); }}
                  onWrite={() => { haptic(); setWriting({}); }}
                  onMatch={canMatch ? () => { haptic(); setMatching(true); } : undefined}
                  onUpdate={(list, c) => start((eng) => {
                    const ids = new Set(eng.questions.map((q) => q.id));
                    const left = list.filter((q) => ids.has(q.id) && !eng.prog(q.id)?.seen);
                    return left.length ? eng.listRound(left) : eng.buildRound(c ?? "all");
                  })} />
              )}
              {state && k === "progress" && (
                <ProgressView
                  onRecap={()=>setRecapOpen(true)}
                  onHow={() => { haptic(); setHowOpen(true); }}
                  e={e}
                  state={state}
                  syllabus={syllabus}
                  materials={store.materials}
                  onTopic={(course, topic) => { haptic(); window.location.hash = `/tool/Topic/${course}/${encodeURIComponent(topic)}`; }}
                  onLesson={openLesson}
                  onStudy={(list, c) => start((eng) => {
                    const ids = new Set(eng.questions.map((q) => q.id));
                    const left = list.filter((q) => ids.has(q.id) && !eng.prog(q.id)?.seen);
                    return left.length ? eng.listRound(left) : eng.buildRound(c ?? "all");
                  })}
                />
              )}
              {k === "search" && (
                <SearchTab
                  questions={state?.questions ?? []}
                  materials={store.materials}
                  syllabus={syllabus}
                  tasks={tasks}
                  essays={written.list}
                  notes={notes}
                  onTopic={(course, topic) => { haptic(); setTopicSheet({ course, topic }); }}
                  onRule={(course, topic, match) => { haptic(); setRulebook({ course, topic, match, recall: false }); }}
                  onEssay={(essay) => { haptic(); setWriting({ view: essay, course: essay.course }); }}
                />
              )}
              {k === "courses" && coursesVisited && <Suspense fallback={<LoadingCard />}><Courses store={store} state={state} lesson={lessonAway ? lessonReturn : undefined} onWrite={(hypo) => setWriting(hypo ? { hypo } : {})} onQuiz={(course, topic) => start((eng) => topic ? eng.topicRound(course, topic) : eng.buildRound(course))} /></Suspense>}
            </div>
          </div>
        ))}
      </main>

      <nav className={styles.tabbar} aria-label="Sections">
        <button className={styles.wordmark} onClick={() => navigate("study")}>Lawstin</button>
        <div className={styles.tabs}>
          {([["study", "Study", BookCheck], ["courses", "Courses", LibraryBig], ["search", "Search", Search], ["progress", "Progress", BarChart3]] as const).map(([k, label, Icon]) => (
            <button key={k} className={`${styles.tab} ${tab === k ? styles.tabOn : ""}`} aria-current={tab === k ? "page" : undefined}
              onClick={() => navigate(k)}>
              <span className={styles.tabIcon}><Icon size={23} strokeWidth={tab === k ? 2.3 : 1.8} /></span>
              <span className={styles.tabLabel}>{label}</span>
            </button>
          ))}
        </div>
        <button className={`${styles.avatar} ${styles.barAvatar}`} onClick={openSettings} aria-label="Settings">{NAME[0]}</button>
      </nav>

      {topicSheet && (
        <BottomSheet onClose={() => setTopicSheet(null)} title={topicSheet.topic} eyebrow={COURSES[topicSheet.course].name}>
          <div className={styles.rules}>
            {e.topicRules(topicSheet.course, topicSheet.topic).map((r, k) => (
              <div key={k} className={styles.ruleItem}>
                <span className={styles.ruleSub}>{r.subtopic}</span>
                <p>{r.rule}</p>
                {r.authority && <small>{r.authority}</small>}
              </div>
            ))}
          </div>
          <TopicTools course={topicSheet.course} topic={topicSheet.topic} onGo={(hash) => { haptic(); afterOverlayClose(() => { window.location.hash = hash; }); setTopicSheet(null); }} />
          <Button className={`${styles.big} ${styles.cta}`} onClick={() => start((eng) => eng.topicRound(topicSheet.course, topicSheet.topic))}>Drill this topic</Button>
        </BottomSheet>
      )}

      {courseSheet && <CourseSheet course={courseSheet} e={e} syllabus={syllabus} numbers={daily.numbers(courseSheet)} onClose={() => setCourseSheet(null)}
        onTopic={(topic) => { const course = courseSheet; courseGo(() => setTopicSheet({ course, topic })); }}
        onStudy={(mode) => start(mixed(courseSheet, mode), "practice", `${mode}:${courseSheet}`, undefined, courseSheet)}
        onEssay={(full) => { const course = courseSheet; courseGo(() => setWriting({ course, full })); }}
        onExam={() => courseGo(() => { setExamSize(25); setExamSheet(true); })} onTool={(name) => openTool(name, courseSheet)} />}
      {streakOpen && <BottomSheet title="Your streak" onClose={() => setStreakOpen(false)}>
        <div className={styles.semesterStats}><div><b>{e.streak()}</b><span>Current streak</span></div><div><b>{streakHistory(state?.days ?? [], day).best}</b><span>Best streak</span></div></div>
        <div className={styles.streakDots} aria-label="Last 14 days">{streakHistory(state?.days ?? [], day).dots.map((d) => <span key={d.day} title={d.day} aria-label={`${d.day}: ${d.studied ? "Studied" : "Rest"}`} data-studied={d.studied} />)}</div>
      </BottomSheet>}
      {rulebook && <CourseRulebook {...rulebook} state={state} e={e} onClose={() => setRulebook(null)} />}
      <ToolHost preserveOverlay={!!session || !!lesson} />
      {recap && <SessionRecap {...recap} onClose={() => setRecap(null)} onContinue={() => {
        const saved = recap; setRecap(null);
        if (saved.snap) { setSession({ ...saved.session, resume: saved.snap, key: Date.now() }); }
        else start(mixed(saved.session.filter ?? filter), "practice", `round:${saved.session.filter ?? filter}`);
      }} />}
      {celebrate && createPortal(<div className={styles.quizCelebration} role="status"><span className={styles.goalBurst}>✓</span><b>Daily goal done</b></div>, quizNode ?? document.querySelector<HTMLElement>('[role="dialog"]') ?? document.body)}

      {examSheet && (
        <BottomSheet onClose={() => setExamSheet(false)} title="Practice exam">
          <ExamPicker e={e} initialSize={examSize} onStart={(f, n, timed) => start((eng) => eng.examRound(f, n), "exam", undefined, timed ? n * EXAM_PACE : undefined)}
            onEssay={(c) => { haptic(); setExamSheet(false); setWriting({ course: c, full: true }); }} />
        </BottomSheet>
      )}

      {recapOpen && (recapStore.value ?? currentRecap) && <SemesterRecap value={(recapStore.value ?? currentRecap)!} onClose={()=>setRecapOpen(false)}/>}
      {howOpen && (
        <BottomSheet onClose={() => setHowOpen(false)} title="How Lawstin works" className={styles.howSheet}>
          <HowItWorks semesterName={semester.value.name} numbers={daily.numbers("all")} e={e} statuses={unitStatuses(e, syllabus).map(u => u.status)} onOpen={kind => { setHowOpen(false); if (kind === "streak") setStreakOpen(true); else if (kind === "missed") openLesson(e.missedTopics()); else if (kind === "progress") { window.location.hash = "#/progress"; } else start(mixed("all", kind === "due" ? "due" : "new")); }} moment={moment} plan={plan.courses} planOn={planOn} goal={goal} />
        </BottomSheet>
      )}

      {settingsOpen && <Suspense fallback={null}><SettingsPage email={email} onClose={closeSettings} onHow={() => { closeSettings(); setHowOpen(true); }} onShortcuts={() => { closeSettings(); setShortcutsOpen(true); }} /></Suspense>}
      {shortcutsOpen && <KeyboardShortcuts onClose={() => setShortcutsOpen(false)} />}

      {matching && state && <Suspense fallback={null}><MatchGame questions={state.questions} course={filter} onClose={() => setMatching(false)}
        // Each pair counts as one answer toward the day; a miss costs one of them.
        onRound={(r) => { daily.credit(undefined, r.pairs)(); log("drill", `match:${Date.now()}`, r.misses === 0, r.pairs, Math.max(0, r.pairs - r.misses)); }} /></Suspense>}

      {writing && <Suspense fallback={null}><WrittenPractice onClose={() => setWriting(null)} course={writing.course} full={writing.full} hypo={writing.hypo} initialView={writing.view}
        hypos={hypos} weak={new Set(e.weakTopics().map((t) => `${t.course}|${t.topic}`))} written={written}
        // An essay counts as five answers (ten at exam length), scored in proportion to its grade.
        onGraded={(entry, len) => { const n = len === "full" ? 10 : 5; daily.credit(entry.course, n)(); log("written", entry.id, entry.grade.score >= 7, n, Math.round((entry.grade.score / 10) * n)); }}
        onTopic={(course, topic) => { setWriting(null); start((eng) => eng.topicRound(course, topic)); }} /></Suspense>}

      {lesson && <Suspense fallback={null}><MissedLesson key={lessonKey} topics={lesson} more={lessonMore.length} onMore={() => openLesson(lessonMore)} away={lessonAway} onAnswer={onAnswer} onClose={endLesson}
        onReviewed={(t) => {
          store.update((prev) => ({ ...prev, reviews: { ...prev.reviews, [`${t.course}|${t.topic}`]: { at: new Date().toISOString(), questions: t.evidence } } }));
          toast(`${t.topic} reviewed`);
        }}
        onDrill={(qs) => { endLesson(); start((eng) => { const ids = new Set(eng.questions.map((q) => q.id)); return eng.listRound(qs.filter((q) => ids.has(q.id))); }); }}
        tools={(course, topic) => <TopicTools course={course} topic={topic} topicCards onGo={openLessonTool} />} /></Suspense>}

      {session && (
        <Suspense fallback={null}><QuizSession
          key={session.key}
          items={session.items}
          mode={session.mode}
          day={session.mode === "practice" && moment.kind !== "morning" && moment.kind !== "done" ? sessionNumbers : undefined}
          getProgress={(id) => e.prog(id)}
          onAnswer={async (q, choice) => { const ok = await onAnswer(q, choice); sessionWork.current.answers.set(q.id, ok); creditPass(q.id); return ok; }}
          onCard={(card, ok) => { onCard(card, ok); sessionWork.current.answers.set(card.id, ok); creditPass(card.id); }}
          onExplain={onExplain}
          recallFirst={prefs.recall}
          seconds={session.seconds}
          after={session.mode === "practice" && planOn ? plan.courses.filter((c) => c.essay).map((c) => ({ label: `Write an ${COURSES[c.course].short} essay`, onGo: () => { setSession(null); setWriting({ course: c.course }); } })) : undefined}
          onHarder={session.mode === "practice" && !session.resumeKey?.startsWith("missed:") ? onHarder : undefined}
          onStar={(q, starred) => mark.mutate({ action: "star", questionId: q.id, starred })}
          onGuess={(q) => mark.mutate({ action: "guess", questionId: q.id, localDate: dateKey.today() })}
          onFlag={(q, note) => { mark.mutate({ action: "flag", questionId: q.id, note }); toast("Flagged for the next update"); }}
          onMore={(exclude) => session.resumeKey?.startsWith("missed:") ? [] : session.source(engineFor(exclude), exclude)}
          onAnother={() => { const items = session.source(engineFor(), NONE); if (!items.length) { setSession(null); toast("All caught up"); return; } setSession({ ...session, items, key: Date.now(), resume: undefined }); }}
          onRetry={(items) => setSession({ items, mode: "practice", key: Date.now(), source: () => [], filter: session.filter })}
          resume={session.resume}
          onCheckpoint={session.mode === "practice" ? (snap) => {
            if (session.resumeKey) checkpoint(snap ? { key: session.resumeKey, snap, at: Date.now() } : null);
            finished.current = !snap;
          } : undefined}
          onClose={closeSession}
        /></Suspense>
      )}
    </div>
  );
}
