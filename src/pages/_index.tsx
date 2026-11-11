import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Aura, auraHost } from "../components/Aura";
import { useModalFocus } from "../helpers/useModalFocus";
import { Layers3, Target, ChevronRight, BarChart3, BookCheck, CalendarDays, Star, X, Timer, Flame, PenLine, Check, Sparkles, LibraryBig, GraduationCap, RotateCcw, GitBranch, BookOpen, Columns3, ListChecks } from "lucide-react";
const loadCourses = () => import("../components/Courses");
const Courses = lazy(() => loadCourses().then(module => ({ default: module.Courses })));
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import type { QuizMode, QuizSnapshot } from "../components/QuizSession";
import type { LessonTopic } from "../components/MissedLesson";
// Screens opened from the Study tab load on demand and are warmed in the background after first paint.
const loadQuiz = () => import("../components/QuizSession");
const QuizSession = lazy(() => loadQuiz().then((m) => ({ default: m.QuizSession })));
const SettingsPage = lazy(() => import("../components/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const MissedLesson = lazy(() => import("../components/MissedLesson").then((m) => ({ default: m.MissedLesson })));
const WrittenPractice = lazy(() => import("../components/WrittenPractice").then((m) => ({ default: m.WrittenPractice })));
import { useWide } from "../helpers/useWide";
import { useLawstinData } from "../helpers/useLawstinData";
import { useLawstinAi } from "../helpers/useLawstinAi";
import { useLawstinSettings } from "../helpers/useLawstinSettings";
import { applyPrefs } from "../helpers/prefs";
import { toast } from "../helpers/toast";
import { dateKey } from "../helpers/dateKey";
import { haptic } from "../helpers/haptics";
import { afterOverlayClose, useBackClose } from "../helpers/useBackClose";
import { useSwipeDown } from "../helpers/useSwipeDown";
import { isNetworkError } from "../helpers/offlineCache";
import { dueSoon, useCourseTasks } from "../helpers/useCourseTasks";
import { MATERIAL_LABELS, SCHOOL_COURSES, reviewCard, type Flashcard, type Hypothetical, type MaterialKind, type StudyMaterial, type StudyRun } from "../helpers/studyMaterials";
import { useStudyLibrary } from "../helpers/useStudyLibrary";
import { useStudyMaterials } from "../helpers/useStudyMaterials";
import { useSyllabus } from "../helpers/useSyllabus";
import { useWritten } from "../helpers/useWritten";
import { useLogStudy } from "../helpers/useLogStudy";
import { finalsPlan, mixRound, nextReviewDay, readyCards, type PlanCourse } from "../helpers/studySession";
import { readPrefs } from "../helpers/prefs";
import { dueLabel } from "../components/TaskList";
import { readPractice, savePractice, type SavedPractice } from "../helpers/practiceMemory";
import { reviewEvidence } from "../helpers/topicReview";
import { COURSES, COURSE_KEYS, DAILY_GOAL, EXAMS, EXAM_PACE, FINALS, STATUS_LABEL, studyEngine, makeGreeting, type CoverageStatus, type Filter, type RoundItem, type CourseCode, type SessionCard, type StudyMode, type Syllabus } from "../helpers/studyEngine";
import type { QuestionDTO } from "../endpoints/state_GET.schema";
import styles from "./_index.module.css";

type Tab = "progress" | "study" | "activity" | "courses";
/** Builds a session's items. `exclude` holds what the running session already has (questions are also removed from the engine). */
type Source = (eng: ReturnType<typeof studyEngine>, exclude: Set<string>) => RoundItem[];
const NONE = new Set<string>();
const TABS = ["study", "courses", "progress", "activity"] as const;
const tabFromHash = (): Tab => {
  const t = window.location.hash.split("/")[1];
  return TABS.includes(t as Tab) ? t as Tab : "study";
};
const NAME = "Austin";

const readRecent = (): string[] => {
  try { const a = JSON.parse(localStorage.getItem("lawstin-greetings") ?? "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
};
const saveRecent = (g: string) => {
  try { localStorage.setItem("lawstin-greetings", JSON.stringify([g, ...readRecent().filter((x) => x !== g)].slice(0, 40))); } catch { /* storage unavailable */ }
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default function LawstinApp({ userId, email }: { userId: string; email: string | null }) {
  const { query, answer, queueAnswer, mark } = useLawstinData();
  const { harder, explain } = useLawstinAi();
  const settings = useLawstinSettings();
  const state = query.data;
  // One study-progress store for the whole app: sessions here and the Courses tab share it.
  const store = useStudyMaterials(userId);
  const written = useWritten();
  const syllabus = useSyllabus();
  const log = useLogStudy();
  const e = useMemo(() => studyEngine(state, undefined, { weakExtra: written.weak, reviews: store.record.reviews }), [state, written.weak, store.record.reviews]);
  const flashcards = useMemo(() => store.materials.filter((m): m is Flashcard => m.kind === "flashcard"), [store.materials]);
  const hypos = useMemo(() => store.materials.filter((m): m is Hypothetical => m.kind === "hypothetical"), [store.materials]);
  const cardsFor = (f: Filter) => readyCards(flashcards, e.ruleCards(f), store.record, state, f);
  const plan = useMemo(() => finalsPlan(e, {
    cards: Object.fromEntries(COURSE_KEYS.map((k) => { const c = readyCards(flashcards, e.ruleCards(k), store.record, state, k); return [k, { due: c.due.length, fresh: c.fresh.length }]; })) as Record<CourseCode, { due: number; fresh: number }>,
    lastEssay: written.lastEssay, fallbackGoal: settings.query.data?.settings.dailyGoal ?? DAILY_GOAL,
  }), [e, flashcards, store.record, state, written.lastEssay, settings.query.data]);
  const [prefs, setPrefs] = useState(readPrefs);
  const planOn = prefs.plan && plan.active;
  const goal = planOn ? plan.goal : settings.query.data?.settings.dailyGoal ?? DAILY_GOAL;
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [coursesVisited, setCoursesVisited] = useState(() => tabFromHash() === "courses");
  const [filter, setFilter] = useState<Filter>(() => (readPractice(userId)?.key.split(":")[1] as Filter | undefined) ?? "all");
  const [session, setSession] = useState<{ items: RoundItem[]; mode: QuizMode; key: number; source: Source; resumeKey?: string; resume?: QuizSnapshot; seconds?: number } | null>(null);
  // A practice session survives closing the app or refreshing, until the end of the study day.
  const [lastPractice, setLastPractice] = useState<SavedPractice | null>(() => readPractice(userId));
  const checkpoint = (saved: SavedPractice | null) => { setLastPractice(saved); savePractice(userId, saved); };
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
  const [writing, setWriting] = useState<{ course?: CourseCode; full?: boolean; hypo?: Hypothetical } | null>(null);
  const [lesson, setLesson] = useState<LessonTopic[] | null>(null);
  // A study tool opened from the lesson: the lesson stays where it was, hidden, until Back returns to it.
  const [lessonAway, setLessonAway] = useState(false);
  const openLessonTool = (hash: string) => {
    haptic();
    setLessonAway(true);
    afterOverlayClose(() => { window.location.hash = hash; });
  };
  const endLesson = () => { setLesson(null); setLessonAway(false); };
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
    setLesson(list.map((t) => {
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
  const paneRefs = useRef<Record<Tab, HTMLDivElement | null>>({ progress: null, study: null, activity: null, courses: null });
  const hiddenAt = useRef(0);
  const prevToday = useRef<number | null>(null);
  const [compact, setCompact] = useState<Record<Tab, boolean>>({ progress: false, study: false, activity: false, courses: false });
  const onPaneScroll = (k: Tab, el: HTMLDivElement) => {
    const on = el.scrollTop > 52;
    setCompact((c) => (c[k] === on ? c : { ...c, [k]: on }));
  };

  useEffect(() => { applyPrefs(); }, []);
  useEffect(() => { const t = setTimeout(() => { void loadQuiz(); void loadCourses(); }, 1500); return () => clearTimeout(t); }, []);
  useEffect(() => { if (tab === "courses") setCoursesVisited(true); }, [tab]);
  useEffect(() => {
    // Only tab routes switch tabs; #/settings and #/q/<id> open on top of the current one.
    const sync = () => { const t = window.location.hash.split("/")[1]; if (TABS.includes(t as Tab)) setTab(t as Tab); };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = (next: Tab) => {
    haptic();
    if (tab === next) paneRefs.current[next]?.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    else { window.location.hash = `/${next}`; setTab(next); }
  };

  useEffect(() => {
    const pick = (s?: typeof state) => {
      if (greeted.current) return;
      greeted.current = true;
      const g = makeGreeting(s, NAME, readRecent(), goal);
      setGreeting(g); saveRecent(g);
    };
    if (state) { pick(state); return; }
    // Offline or slow: greet without progress-based lines rather than leave the heading empty.
    const t = setTimeout(() => pick(undefined), 2500);
    return () => clearTimeout(t);
  }, [state, greeting]);

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
  // Home Screen icon badge: question reviews due today (cleared at zero). Needs notification permission on iOS.
  const dueCount = state ? e.queues("all").due.length : null;
  useEffect(() => {
    if (dueCount === null) return;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    (dueCount ? nav.setAppBadge?.(dueCount) : nav.clearAppBadge?.())?.catch(() => {});
  }, [dueCount]);

  const todayAnswered = e.todayCount?.answered ?? 0;
  useEffect(() => {
    if (!state) return;
    const prev = prevToday.current;
    prevToday.current = todayAnswered;
    if (prev !== null && prev < goal && todayAnswered >= goal) {
      setCelebrate(true);
      haptic();
      toast("Daily goal done");
      const t = setTimeout(() => setCelebrate(false), 2400);
      return () => clearTimeout(t);
    }
  }, [todayAnswered, state, goal]);

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
  const mixed = (f: Filter, mode: StudyMode = "mixed"): Source => (eng, exclude) => {
    const { flashcards: fc, record } = cardState.current;
    // Rule cards use the full bank even when the question source excludes this session's items.
    const cards = readyCards(fc, studyEngine(latest.current).ruleCards(f), record, latest.current, f, eng.today, mode).list.filter((c) => !exclude.has(c.id));
    return mixRound(eng.buildRound(f, mode), cards, record);
  };
  const onCard = (card: SessionCard, correct: boolean) => {
    store.update((prev) => ({ ...prev, cards: { ...prev.cards, [card.id]: reviewCard(prev.cards[card.id], correct) } }));
    log("card", card.id, correct);
  };
  const onExplain = async (card: SessionCard, answer: string) => {
    try {
      const r = await explain.mutateAsync({ course: card.course, topic: card.topic, prompt: card.rule ? `State the rule: ${card.front}` : card.front,
        reference: [card.back, card.reason, card.authority].filter(Boolean).join("\n"), answer });
      return r.explain;
    } catch { return null; }
  };
  const start = (source: Source, mode: QuizMode = "practice", resumeKey?: string, seconds?: number) => {
    const last = lastPractice;
    if (mode === "practice" && resumeKey && last?.key === resumeKey && dateKey.today(new Date(last.at)) === dateKey.today()) {
      const restored = last.snap.items.map((it) => it.q ? { ...it, q: it.q.id.startsWith("ai-") ? it.q : latest.current?.questions.find((q) => q.id === it.q.id) } : it);
      if (restored.some((it) => !it.q && !it.card)) checkpoint(null);
      else {
        haptic();
        setExamSheet(false); setTopicSheet(null);
        const snap = { ...last.snap, items: restored as RoundItem[] };
        setSession({ items: snap.items, mode, key: Date.now(), source, resumeKey, resume: snap });
        return;
      }
    }
    const items = source(engineFor(), NONE);
    if (!items.length) { toast("All caught up"); return; }
    haptic();
    setExamSheet(false); setTopicSheet(null);
    setSession({ items, mode, key: Date.now(), source, resumeKey, seconds });
  };
  const resumeStudy = () => {
    const key = lastPractice?.key.endsWith(`:${filter}`) ? lastPractice.key : `round:${filter}`;
    const kind = key.split(":")[0];
    const source: Source = kind === "missed" ? (eng) => eng.listRound(eng.queues(filter).missed)
      : kind === "starred" ? (eng) => eng.listRound(eng.queues(filter).starred)
      : mixed(filter, kind === "due" || kind === "new" ? kind : "mixed");
    start(source, "practice", key);
  };

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
    const input = { questionId: q.id, choice: choice as "A" | "B" | "C" | "D", localDate: dateKey.today() };
    const queue = () => {
      queueAnswer(input, choice === q.answer);
      if (!offlineNoted.current) { offlineNoted.current = true; toast("Offline. Answers will sync when you’re back online."); }
      return choice === q.answer;
    };
    if (!navigator.onLine) return queue();
    try {
      const res = await answer.mutateAsync(input);
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
              <span>{k === "study" ? "Study" : k === "progress" ? "Progress" : k === "courses" ? "Courses" : "Activity"}</span>
            </div>
            <div className={`${styles.shell} ${k === "study" ? auraHost : ""}`}>
              {k === "study" && <Aura className={styles.studyAura} colors={["var(--uh-red)", "var(--course-il)", "var(--course-asy)"]} />}
              <header className={styles.head}>
                <div className={styles.headRow}>
                  <span className={styles.eyebrow}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
                  <button className={styles.avatar} onClick={openSettings} aria-label="Settings">{NAME[0]}</button>
                </div>
                <h1 key={k === "study" ? greeting ?? "" : k} className={k === "study" ? styles.greet : styles.title} style={k === "study" && !greeting ? { visibility: "hidden" } : undefined}>{k === "study" ? greeting ?? "\u00a0" : k === "progress" ? "Progress" : k === "courses" ? "Courses" : "Activity"}</h1>
              </header>

              {loading && k !== "courses" && <LoadingCard />}
              {failed && k !== "courses" && (
                <div className={`${styles.card} ${styles.empty}`}>
                  <h2>{navigator.onLine ? "Couldn’t load your questions" : "You’re offline"}</h2>
                  <Button variant="secondary" onClick={() => query.refetch()}>Try again</Button>
                </div>
              )}

              {state && k === "study" && (
                <StudyView e={e} state={state} goal={goal} cards={cardsFor(filter)} plan={planOn ? plan.courses : []} filter={filter} setFilter={setFilter} celebrate={celebrate}
                  resuming={!!lastPractice?.key.endsWith(`:${filter}`)}
                  onHow={() => { haptic(); setHowOpen(true); }}
                  nextReview={nextReviewDay(e, [...flashcards, ...e.ruleCards(filter)], store.record, filter)}
                  onMode={(mode) => start(mixed(filter, mode), "practice", mode === "ahead" ? undefined : `${mode}:${filter}`)}
                  onLesson={openLesson}
                  onStart={resumeStudy}
                  onCourse={(c) => start(mixed(c), "practice", `round:${c}`)}
                  onEssay={(c) => { haptic(); setWriting({ course: c }); }}
                  onStarred={() => start((eng) => eng.listRound(eng.queues(filter).starred), "practice", `starred:${filter}`)}
                  onExam={() => { haptic(); setExamSheet(true); }}
                  onWrite={() => { haptic(); setWriting({}); }}
                  onUpdate={(list, c) => start((eng) => {
                    const ids = new Set(eng.questions.map((q) => q.id));
                    const left = list.filter((q) => ids.has(q.id) && !eng.prog(q.id)?.seen);
                    return left.length ? eng.listRound(left) : eng.buildRound(c ?? "all");
                  })} />
              )}
              {state && k === "progress" && <ProgressView onHow={() => { haptic(); setHowOpen(true); }} e={e} syllabus={syllabus} materials={store.materials} onTopic={(course, topic) => { haptic(); setTopicSheet({ course, topic }); }} />}
              {state && k === "activity" && (
                <ActivityView e={e} state={state} onLesson={openLesson}
                  onStudy={(list, c) => start((eng) => {
                    const ids = new Set(eng.questions.map((q) => q.id));
                    const left = list.filter((q) => ids.has(q.id) && !eng.prog(q.id)?.seen);
                    return left.length ? eng.listRound(left) : eng.buildRound(c ?? "all");
                  })} />
              )}
              {k === "courses" && coursesVisited && <Suspense fallback={<LoadingCard />}><Courses store={store} state={state} lesson={lessonAway ? lessonReturn : undefined} onWrite={(hypo) => setWriting(hypo ? { hypo } : {})} onQuiz={(course, topic) => start((eng) => topic ? eng.topicRound(course, topic) : eng.buildRound(course))} /></Suspense>}
            </div>
          </div>
        ))}
      </main>

      <nav className={styles.tabbar} aria-label="Sections">
        <button className={styles.wordmark} onClick={() => navigate("study")}>Lawstin</button>
        <div className={styles.tabs}>
          {([["study", "Study", BookCheck], ["courses", "Courses", LibraryBig], ["progress", "Progress", BarChart3], ["activity", "Activity", CalendarDays]] as const).map(([k, label, Icon]) => (
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

      {examSheet && (
        <BottomSheet onClose={() => setExamSheet(false)} title="Practice exam">
          <ExamPicker e={e} onStart={(f, n, timed) => start((eng) => eng.examRound(f, n), "exam", undefined, timed ? n * EXAM_PACE : undefined)}
            onEssay={(c) => { haptic(); setExamSheet(false); setWriting({ course: c, full: true }); }} />
        </BottomSheet>
      )}

      {howOpen && (
        <BottomSheet onClose={() => setHowOpen(false)} title="How Lawstin works" className={styles.howSheet}>
          <HowItWorks plan={plan.courses} planOn={planOn} goal={goal} />
        </BottomSheet>
      )}

      {settingsOpen && <Suspense fallback={null}><SettingsPage email={email} onClose={closeSettings} /></Suspense>}

      {writing && <Suspense fallback={null}><WrittenPractice onClose={() => setWriting(null)} course={writing.course} full={writing.full} hypo={writing.hypo}
        hypos={hypos} weak={new Set(e.weakTopics().map((t) => `${t.course}|${t.topic}`))} written={written}
        // An essay counts as five answers (ten at exam length), scored in proportion to its grade.
        onGraded={(entry, len) => { const n = len === "full" ? 10 : 5; log("written", entry.id, entry.grade.score >= 7, n, Math.round((entry.grade.score / 10) * n)); }}
        onTopic={(course, topic) => { setWriting(null); start((eng) => eng.topicRound(course, topic)); }} /></Suspense>}

      {lesson && <Suspense fallback={null}><MissedLesson topics={lesson} away={lessonAway} onAnswer={onAnswer} onClose={endLesson}
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
          day={session.mode === "practice" ? { answered: todayAnswered, goal } : undefined}
          getProgress={(id) => e.prog(id)}
          onAnswer={onAnswer}
          onCard={onCard}
          onExplain={onExplain}
          recallFirst={prefs.recall}
          seconds={session.seconds}
          after={session.mode === "practice" && planOn ? plan.courses.filter((c) => c.essay).map((c) => ({ label: `Write an ${COURSES[c.course].short} essay`, onGo: () => { setSession(null); setWriting({ course: c.course }); } })) : undefined}
          onHarder={session.mode === "practice" ? onHarder : undefined}
          onStar={(q, starred) => mark.mutate({ action: "star", questionId: q.id, starred })}
          onGuess={(q) => mark.mutate({ action: "guess", questionId: q.id, localDate: dateKey.today() })}
          onFlag={(q, note) => { mark.mutate({ action: "flag", questionId: q.id, note }); toast("Flagged for the next update"); }}
          onMore={(exclude) => session.source(engineFor(exclude), exclude)}
          onAnother={() => { const items = session.source(engineFor(), NONE); if (!items.length) { setSession(null); toast("All caught up"); return; } setSession({ ...session, items, key: Date.now(), resume: undefined }); }}
          onRetry={(items) => setSession({ items, mode: "practice", key: Date.now(), source: () => [] })}
          resume={session.resume}
          onCheckpoint={session.mode === "practice" && session.resumeKey ? (snap) => checkpoint(snap ? { key: session.resumeKey!, snap, at: Date.now() } : null) : undefined}
          onClose={(snap) => {
            if (session.mode === "practice" && session.resumeKey) checkpoint(snap ? { key: session.resumeKey, snap, at: Date.now() } : null);
            setSession(null);
          }}
        /></Suspense>
      )}
    </div>
  );
}

type Engine = ReturnType<typeof studyEngine>;
type MissedTopic = ReturnType<Engine["missedTopics"]>[number];

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5);

/** Topics with misses, worst first, each opening a short lesson; the top row mixes the weakest few. */
function MissedTopics({ topics, onLesson }: { topics: MissedTopic[]; onLesson: (topics: MissedTopic[]) => void }) {
  const [open, setOpen] = useState(false);
  const mix = topics.slice(0, 4);
  const count = mix.reduce((a, t) => a + Math.min(3, t.items.length), 0);
  const more = topics.length - 4;
  return (
    <section className={`${styles.sec} ${styles.fullRow}`}>
      <div className={styles.secH}>
        <h2>Missed topics</h2>
        {more > 0 && <button className={styles.feedToggle} aria-expanded={open} onClick={() => { haptic(); setOpen((v) => !v); }}>{open ? "Show less" : `${more} more`}</button>}
      </div>
      {topics.length > 1 && (
        <button className={`${styles.card} ${styles.lessonHero} ${auraHost}`} onClick={() => onLesson(mix)}>
          <Aura colors={[COURSES[mix[0].course].color, "var(--uh-red)", COURSES[mix[1].course].color]} />
          <span className={styles.lessonIcon}><GraduationCap size={22} /></span>
          <span className={styles.rowMain}><span className={styles.rowTitle}>Mixed lesson</span><span className={styles.rowSub}>{mix.length} topics · {count} questions</span></span>
          <ChevronRight size={18} className={styles.chev} />
        </button>
      )}
      <div className={`${styles.card} ${styles.list}`}>
        {(open ? topics : topics.slice(0, 4)).map((t) => {
          const c = COURSES[t.course], still = t.items.filter((it) => it.p.lastCorrect === false).length;
          return (
            <button key={`${t.course}|${t.topic}`} className={styles.row} onClick={() => onLesson([t])}>
              <span className={styles.dot} style={{ background: c.color }}>{c.short[0]}</span>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{t.topic}</span>
                <span className={styles.rowSub}>{still ? `${still} still missed` : `${t.items.length} to revisit`}{t.c + t.w ? ` · ${pct(t.c, t.c + t.w)}% correct` : ""}</span>
              </span>
              <ChevronRight size={18} className={styles.chev} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Finals that have not passed yet, soonest first. */
const upcomingFinals = () => {
  const today = dateKey.today();
  return COURSE_KEYS.map((k) => ({ k, date: FINALS[k], days: dayDiff(today, FINALS[k]) }))
    .filter((f) => f.days >= 0).sort((a, b) => a.days - b.days);
};

/** Days to each final, soonest first, with the day's target and how well that course's questions are going. */
function FinalsCard({ e, plan, onCourse }: { e: Engine; plan: PlanCourse[]; onCourse: (c: CourseCode) => void }) {
  const list = upcomingFinals();
  if (!list.length) return null;
  return (
    <section className={`${styles.sec} ${styles.finals}`}>
      <div className={styles.secH}><h2>Finals</h2></div>
      <div className={styles.finalTiles}>
        {list.map(({ k, date, days }) => {
          const c = COURSES[k], s = e.courseStats(k), today = plan.find((x) => x.course === k)?.target;
          return (
            <button key={k} className={`${styles.card} ${styles.finalTile}`} style={{ "--course-color": c.color } as React.CSSProperties} onClick={() => onCourse(k)}>
              <span className={styles.finalCourse}><i />{c.short}</span>
              <b>{days === 0 ? "Today" : days}</b>
              <span className={styles.finalWhen}>{days === 0 ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" }) : `${days === 1 ? "day" : "days"} · ${new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}</span>
              <span className={styles.meter}><i style={{ width: `${pct(s.seen, s.n)}%`, background: c.color }} /></span>
              <span className={styles.finalStats}>{today ? `${today} today` : `${pct(s.seen, s.n)}% seen`}{s.seen > 0 && <span className={styles.finalFull}> · {s.acc}% correct</span>}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

const KIND_ICON: Record<MaterialKind, typeof Layers3> = { flashcard: Layers3, flowchart: GitBranch, outline: BookOpen, comparison: Columns3, drill: ListChecks, hypothetical: PenLine };

/** The topic's study materials from Courses, with its flashcards as one row. Hidden when there are none. */
/** topicCards: the flashcard row opens a session of this topic's cards instead of the course's card list. */
function TopicTools({ course, topic, onGo, topicCards }: { course: CourseCode; topic: string; onGo: (hash: string) => void; topicCards?: boolean }) {
  const library = useStudyLibrary();
  const mats = (library.data?.materials ?? []).filter((m) => m.course === course && m.topic === topic);
  if (!mats.length) return null;
  const cards = mats.filter((m) => m.kind === "flashcard").length;
  const cardsHash = topicCards ? `/courses/review/${course}/${encodeURIComponent(topic)}` : `/courses/${course}/flashcard`;
  const row = (key: string, kind: MaterialKind, title: string, sub: string, hash: string) => {
    const Icon = KIND_ICON[kind];
    return (
      <button key={key} className={styles.row} onClick={() => onGo(hash)}>
        <span className={styles.dot} style={{ background: COURSES[course].color }}><Icon size={12} color="#fff" strokeWidth={2.4} /></span>
        <span className={styles.rowMain}><span className={styles.rowTitle}>{title}</span><span className={styles.rowSub}>{sub}</span></span>
        <ChevronRight size={18} className={styles.chev} />
      </button>
    );
  };
  return (
    <div className={`${styles.card} ${styles.list}`}>
      {mats.filter((m) => m.kind !== "flashcard").map((m) => row(m.id, m.kind, m.title, MATERIAL_LABELS[m.kind], `/courses/${course}/${m.kind}/${m.id}`))}
      {cards > 0 && row("cards", "flashcard", MATERIAL_LABELS.flashcard, `${cards} cards`, cardsHash)}
    </div>
  );
}

/** Clinic and Tutoring tasks that are overdue or due within two days. Hidden when there are none. */
function DueSoonCard() {
  const { tasks, completeWithUndo } = useCourseTasks();
  const list = dueSoon(tasks);
  if (!list.length) return null;
  return (
    <section className={styles.sec}>
      <div className={styles.secH}><h2>To do</h2></div>
      <div className={`${styles.card} ${styles.list}`}>
        {list.slice(0, 6).map((t) => {
          const c = SCHOOL_COURSES[t.course], label = dueLabel(t.due!);
          return (
            <div key={t.id} className={styles.row}>
              <button className={styles.todoCheck} style={{ color: c.color }} aria-label="Mark done"
                onClick={() => { haptic(); completeWithUndo(t); }} />
              <button className={styles.rowMain} onClick={() => { haptic(); window.location.hash = `/courses/${t.course}`; }}>
                <span className={styles.rowTitle}>{t.title}</span>
                <span className={styles.rowSub}><span className={label.tone === "late" ? styles.todoLate : label.tone === "soon" ? styles.todoSoon : ""}>{label.text}</span> · {c.short}</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Counts up from the previous value (0 on first show) with an ease-out curve.
function Num({ v, suffix = "" }: { v: number; suffix?: string }) {
  const [n, setN] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    prev.current = v;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (from === v || reduce) { setN(v); return; }
    let raf = 0;
    const t0 = performance.now(), d = 650;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / d);
      setN(Math.round(from + (v - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <>{n}{suffix}</>;
}

function LoadingCard() {
  return (
    <div className={`${styles.card} ${styles.hero}`} aria-busy="true">
      <Skeleton style={{ height: 36, borderRadius: 10 }} />
      <Skeleton style={{ height: 48, width: "70%", borderRadius: 10 }} />
      <Skeleton style={{ height: 52, borderRadius: 14 }} />
    </div>
  );
}

function StudyView({ e, state, goal, cards, plan, filter, setFilter, celebrate, resuming, nextReview, onHow, onMode, onLesson, onStart, onCourse, onEssay, onStarred, onExam, onWrite, onUpdate }: {
  resuming: boolean;
  nextReview: string | null;
  onHow: () => void;
  onMode: (mode: StudyMode) => void;
  onLesson: (topics: MissedTopic[]) => void;
  goal: number;
  /** Recall cards ready now for the chosen filter. */
  cards: ReturnType<typeof readyCards>;
  /** Today's plan per course while finals are ahead; empty when the plan is off. */
  plan: PlanCourse[];
  onEssay: (c: CourseCode) => void;
  e: Engine; state: NonNullable<ReturnType<typeof useLawstinData>["query"]["data"]>; filter: Filter; setFilter: (f: Filter) => void; celebrate: boolean;
  onStart: () => void; onCourse: (c: CourseCode) => void; onStarred: () => void; onExam: () => void; onWrite: () => void; onUpdate: (items: QuestionDTO[], course: CourseCode | null) => void;
}) {
  if (!e.questions.length) {
    return <div className={`${styles.card} ${styles.empty}`}><h2>No questions yet</h2></div>;
  }
  const qs = e.queues(filter);
  const today = e.todayCount?.answered ?? 0;
  const ready = qs.due.length + qs.fresh.length + cards.list.length;
  const missed = e.missedTopics().filter((t) => filter === "all" || t.course === filter);
  const essays = plan.filter((c) => c.essay && (filter === "all" || filter === c.course));
  const roundLabel = resuming ? "Resume studying" : !ready ? "All caught up" : today > 0 ? "Keep going" : "Start studying";
  const run = state.runs[0];
  const goalPct = Math.min(1, today / goal);
  const goalDone = today >= goal;
  const circ = 2 * Math.PI * 16;
  const streak = e.streak();
  const studiedToday = today > 0;
  const showFinals = upcomingFinals().length > 0;
  // Minutes left today: what is still needed (or ready, if less) at about 45 seconds an item, to the next 5.
  const left = Math.min(Math.max(0, goal - today), ready);
  const mins = Math.max(5, Math.ceil((left * 45) / 60 / 5) * 5);
  return (
    <div className={styles.studyCols}>
      <div className={styles.studyCol}>
      <div className={styles.o1}>
      <div className={`${styles.card} ${styles.hero}`}>
        <div className={styles.seg} role="group" aria-label="Course filter">
          {([["all", "All"], ["il", "Intl Law"], ["asy", "Asylum"], ["pr", "Pro Res"]] as const).map(([k, l]) => (
            <button key={k} aria-pressed={filter === k} className={filter === k ? styles.segOn : ""} onClick={() => { if (filter !== k) haptic(); setFilter(k); }}>{l}</button>
          ))}
        </div>
        <div className={styles.todayRow}>
          <button className={styles.todayBtn} onClick={onHow} aria-label="How today’s plan is built">
            <span className={`${styles.goalWrap} ${celebrate ? styles.goalBurst : ""}`}>
              <svg viewBox="0 0 40 40" className={styles.goalRing} aria-hidden="true">
                <circle cx="20" cy="20" r="16" className={styles.goalTrack} />
                <circle cx="20" cy="20" r="16" className={styles.goalVal} style={{ strokeDasharray: circ, strokeDashoffset: circ * (1 - goalPct), opacity: today ? 1 : 0 }} />
              </svg>
              {goalDone ? <Check size={26} strokeWidth={3.2} className={styles.goalCheck} /> : <b className={styles.ringNum}><Num v={today} /></b>}
            </span>
            <span className={styles.todayText}>
              <span className={styles.todayHead}>{goalDone ? "Done for today" : left ? `${goal - today} to go today` : "Nothing ready today"}</span>
              {!goalDone && left > 0 && <span className={styles.rowSub}>About {mins} min</span>}
            </span>
            <ChevronRight size={18} className={styles.chev} />
          </button>
          <div className={`${styles.streakChip} ${streak && studiedToday ? styles.streakLit : ""}`} role="img" aria-label={`${streak} day streak`}>
            <Flame size={18} className={styles.flame} fill={streak && studiedToday ? "currentColor" : "none"} strokeWidth={2} />
            <b>{streak}</b>
          </div>
        </div>
        <Button className={`${styles.big} ${styles.cta} ${!ready && !resuming ? styles.caughtUp : ""}`} disabled={!ready && !resuming} onClick={onStart}>
          {!ready && !resuming && <Check size={18} />}{roundLabel}
        </Button>
        <div className={`${styles.list} ${styles.flat} ${styles.heroRows}`}>
          <button className={styles.row} disabled={!qs.due.length && !cards.due.length} onClick={() => onMode("due")} aria-label={`Review ${qs.due.length + cards.due.length} due items`}>
            <span className={styles.dot} style={{ background: "var(--uh-red)" }}><RotateCcw size={12} color="#fff" strokeWidth={2.4} /></span>
            <span className={styles.rowMain}><span className={styles.rowTitle}>Ready to review</span></span>
            <span className={styles.rowEnd}><Num v={qs.due.length + cards.due.length} /></span>
            <ChevronRight size={18} className={styles.chev} />
          </button>
          <button className={styles.row} disabled={!qs.fresh.length && !cards.fresh.length} onClick={() => onMode("new")} aria-label={`Study ${qs.fresh.length + cards.fresh.length} new items`}>
            <span className={styles.dot} style={{ background: "var(--info)" }}><Sparkles size={12} color="#fff" strokeWidth={2.4} /></span>
            <span className={styles.rowMain}><span className={styles.rowTitle}>Not seen yet</span></span>
            <span className={styles.rowEnd}><Num v={qs.fresh.length + cards.fresh.length} /></span>
            <ChevronRight size={18} className={styles.chev} />
          </button>
          <button className={styles.row} disabled={!missed.length} onClick={() => onLesson(missed.slice(0, 4))} aria-label={`Review ${missed.length} missed topics`}>
            <span className={styles.dot} style={{ background: "var(--warning)" }}><GraduationCap size={12} color="#fff" strokeWidth={2.4} /></span>
            <span className={styles.rowMain}><span className={styles.rowTitle}>Missed topics</span></span>
            <span className={styles.rowEnd}><Num v={missed.length} /></span>
            <ChevronRight size={18} className={styles.chev} />
          </button>
        </div>
        {!ready && nextReview && <div className={styles.nextReview}>
          <span><CalendarDays size={16} />Next review · {new Date(`${nextReview}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          <button onClick={() => onMode("ahead")}>Review ahead <ChevronRight size={14} /></button>
        </div>}
        {essays.length > 0 && (
          <div className={styles.essays}>
            {essays.map((c) => (
              <Button key={c.course} variant="secondary" className={styles.big} onClick={() => onEssay(c.course)}><PenLine size={16} />{COURSES[c.course].short} essay</Button>
            ))}
          </div>
        )}
      </div>

      </div>
          <div className={styles.o3}><DueSoonCard /></div>
        </div>
        <div className={styles.studyCol}>
          <div className={styles.o2}><FinalsCard e={e} plan={plan} onCourse={onCourse} /></div>
          <div className={styles.o5}>
              <section className={styles.sec}>
                <div className={`${styles.card} ${styles.list}`}>
                  <button className={styles.row} onClick={onExam}>
                    <span className={styles.dot} style={{ background: "var(--foreground)" }}><Timer size={13} color="var(--background)" /></span>
                    <span className={styles.rowMain}><span className={styles.rowTitle}>Practice exam</span></span>
                    <ChevronRight size={18} className={styles.chev} />
                  </button>
                  <button className={styles.row} onClick={() => { haptic(); window.location.hash = "/courses/review"; }} disabled={!cards.list.length}>
                    <span className={styles.dot} style={{ background: "#5e5ce6" }}><Layers3 size={12} color="#fff" strokeWidth={2.4} /></span>
                    <span className={styles.rowMain}><span className={styles.rowTitle}>Flashcards</span></span>
                    <span className={styles.rowEnd}>{cards.list.length}</span>
                    <ChevronRight size={18} className={styles.chev} />
                  </button>
                  <button className={styles.row} onClick={onWrite}>
                    <span className={styles.dot} style={{ background: "var(--uh-red)" }}><PenLine size={12} color="#fff" strokeWidth={2.4} /></span>
                    <span className={styles.rowMain}><span className={styles.rowTitle}>Written practice</span></span>
                    <ChevronRight size={18} className={styles.chev} />
                  </button>
                  <button className={styles.row} onClick={onStarred} disabled={!qs.starred.length}>
                    <span className={styles.dot} style={{ background: "#e0a100" }}><Star size={12} color="#fff" fill="#fff" /></span>
                    <span className={styles.rowMain}><span className={styles.rowTitle}>Starred</span></span>
                    <span className={styles.rowEnd}>{qs.starred.length}</span>
                    <ChevronRight size={18} className={styles.chev} />
                  </button>
                </div>
              </section>
          </div>
          {!showFinals && <div className={styles.o4}>
              <section className={styles.sec}>
                <div className={styles.secH}><h2>Courses</h2></div>
                <div className={`${styles.card} ${styles.list}`}>
                  {COURSE_KEYS.map((k) => {
                    const c = COURSES[k], s = e.courseStats(k), q = e.queues(k);
                    return (
                      <button key={k} className={styles.row} onClick={() => onCourse(k)}>
                        <span className={styles.dot} style={{ background: c.color }}>{c.short[0]}</span>
                        <span className={styles.rowMain}>
                          <span className={styles.rowTitle}>{c.name}</span>
                          <span className={styles.rowSub}>{q.fresh.length} new · {q.due.length} due{s.seen ? ` · ${s.acc}% correct` : ""}</span>
                          <span className={styles.meter}><i style={{ width: `${pct(s.seen, s.n)}%`, background: c.color }} /></span>
                        </span>
                        <ChevronRight size={18} className={styles.chev} />
                      </button>
                    );
                  })}
                </div>
              </section>
          </div>}
          {run && <div className={styles.o6}><UpdateCard e={e} run={run} onStudy={onUpdate} /></div>}
        </div>
      </div>
  );
}

type Run = NonNullable<ReturnType<typeof useLawstinData>["query"]["data"]>["runs"][number];

function UpdateCard({ e, run, onStudy }: { e: Engine; run: Run; onStudy: (items: QuestionDTO[], course: CourseCode | null) => void }) {
  // Questions written by this update: matched by batch, which update runs stamp with the run date.
  const added = e.questions.filter((q) => q.batch?.includes(run.date));
  const courses = (Object.entries(run.byCourse) as [CourseCode, number][]).filter(([k, n]) => n > 0 && COURSES[k]);
  const rows = courses.map(([k, n]) => {
    const qs = added.filter((q) => q.course === k);
    const left = qs.length ? qs.filter((q) => !e.prog(q.id)?.seen).length : Math.min(n, e.queues(k).fresh.length);
    return { k, n, qs, left };
  });
  const total = rows.reduce((a, r) => a + r.n, 0) || run.added;
  const left = rows.reduce((a, r) => a + r.left, 0);
  const doneN = Math.max(0, total - left);
  const circ = 2 * Math.PI * 15;
  const fmtDate = new Date(`${run.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const today = run.date === e.today;
  return (
    <section className={styles.sec}>
      <div className={styles.secH}><h2>{today ? "New today" : "Latest update"}</h2><small>{fmtDate}</small></div>
      <div className={`${styles.card} ${styles.upd}`}>
        <div className={styles.updTop}>
          <span className={styles.updRing}>
            <svg viewBox="0 0 36 36" className={styles.updRingSvg} aria-hidden="true">
              <circle cx="18" cy="18" r="15" className={styles.updTrack} />
              <circle cx="18" cy="18" r="15" className={styles.updVal} style={{ strokeDasharray: circ, strokeDashoffset: circ * (1 - (total ? doneN / total : 0)) }} />
            </svg>
            {left === 0 ? <Check size={16} strokeWidth={3} className={styles.updCheck} /> : <Sparkles size={16} className={styles.updSpark} />}
          </span>
          <div className={styles.updHead}>
            <b>{total} new question{total === 1 ? "" : "s"}</b>
            <span>{left === 0 ? "All studied" : `${left} left to study`}</span>
          </div>
          {left > 0 && (
            <button className={styles.updGo} onClick={() => onStudy(added, null)}>Study</button>
          )}
        </div>
        <div className={styles.updTopics}><TopicBubbles bubbles={topicBubbles(e, run, added)} onStudy={onStudy} /></div>
      </div>
    </section>
  );
}

const STATUS_COLOR: Record<CoverageStatus, string> = { none: "var(--faint-foreground)", unseen: "var(--muted-foreground)", shaky: "var(--error)", learning: "var(--warning)", solid: "var(--success)" };
const OPEN_KEY = "lawstin-progress-open";
const readOpen = (): Partial<Record<CourseCode, boolean>> => {
  try { const o = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; }
};

function ProgressView({ e, syllabus, materials, onTopic, onHow }: { onHow: () => void; e: Engine; syllabus: Syllabus; materials: StudyMaterial[]; onTopic: (c: CourseCode, t: string) => void }) {
  const wide = useWide();
  const m = e.missProfile();
  const misses = m.sneaky + m.average + m.bad;
  // On phones only the course with the nearest final starts open; what you open or close is remembered.
  const nearest = (upcomingFinals()[0]?.k ?? COURSE_KEYS[0]) as CourseCode;
  const [stored, setStored] = useState(readOpen);
  const isOpen = (k: CourseCode) => wide || (stored[k] ?? k === nearest);
  const toggle = (k: CourseCode) => {
    haptic();
    const next = { ...stored, [k]: !isOpen(k) };
    setStored(next);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  const byTopic = new Map<string, number>();
  for (const x of materials) byTopic.set(`${x.course}|${x.topic}`, (byTopic.get(`${x.course}|${x.topic}`) ?? 0) + 1);
  const roleRow = (label: string, n: number, color: string) => (
    <div className={styles.row}>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{label}</span>
        <span className={styles.meter}><i style={{ width: `${pct(n, misses)}%`, background: color }} /></span>
      </span>
      <span className={styles.rowEnd}><b>{n}</b></span>
    </div>
  );
  return (
    <>
      <div className={styles.tiles}>
        <div className={`${styles.card} ${styles.tile}`}><b>{m.correct + m.wrong ? <Num v={pct(m.correct, m.correct + m.wrong)} suffix="%" /> : "—"}</b><span>Correct overall</span></div>
        <div className={`${styles.card} ${styles.tile}`}><b><Num v={m.correct + m.wrong} /></b><span>Answers given</span></div>
        <div className={`${styles.card} ${styles.tile}`}><b><Num v={m.seen} /></b><span>Questions seen</span></div>
      </div>
      <section className={`${styles.sec} ${styles.fullRow}`}>
        <div className={styles.secH}><h2>Which wrong answers catch you</h2><button className={styles.feedToggle} onClick={onHow}>How this works</button></div>
        <div className={`${styles.card} ${styles.list} ${styles.flat} ${styles.missGrid}`}>
          {roleRow("Sneaky distractor", m.sneaky, "var(--course-pr)")}
          {roleRow("Average distractor", m.average, "var(--course-il)")}
          {roleRow("Really bad answer", m.bad, "var(--error)")}
          {roleRow("Correct but guessed", m.guessed, "var(--faint-foreground)")}
        </div>
      </section>
      {COURSE_KEYS.map((k) => {
        // The course as taught, in class order: what is covered, and how well each unit is known.
        const rows = e.coverage(k, syllabus[k], byTopic);
        if (!rows.length) return null;
        const c = COURSES[k];
        const covered = rows.filter((r) => r.n > 0).length;
        const open = isOpen(k);
        const head = (
          <>
            <span className={styles.dot} style={{ background: c.color }}>{c.short[0]}</span>
            <span className={styles.rowMain}>
              <span className={styles.rowTitle}>{c.name}</span>
              <span className={styles.rowSub}>{covered} of {rows.length} covered</span>
              <span className={styles.segBar} aria-hidden="true">{rows.map((r) => <i key={r.topic} style={{ background: STATUS_COLOR[r.status] }} />)}</span>
            </span>
            {!wide && <ChevronRight size={18} className={`${styles.chev} ${styles.courseChev} ${open ? styles.courseChevOn : ""}`} />}
          </>
        );
        return (
          <section key={k} className={styles.sec}>
            <div className={`${styles.card} ${styles.course}`}>
              {wide
                ? <div className={`${styles.row} ${styles.courseHead}`}>{head}</div>
                : <button className={`${styles.row} ${styles.courseHead}`} aria-expanded={open} onClick={() => toggle(k)}>{head}</button>}
              {open && <div className={`${styles.list} ${styles.flat} ${styles.courseBody}`}>
                {rows.map((t) => {
                  const a = t.c + t.w, acc = pct(t.c, a), col = STATUS_COLOR[t.status];
                  const body = (
                    <>
                      <span className={styles.rowMain}>
                        <span className={`${styles.rowTitle} ${styles.wrap}`}>{t.topic}</span>
                        <span className={styles.rowSub}>{t.n ? `${t.seen} of ${t.n} seen${a ? ` · ${acc}%` : ""}` : t.materials ? `${t.materials} materials` : "No questions"}</span>
                        <span className={styles.meter}><i style={{ width: `${t.n ? pct(t.seen, t.n) : 0}%`, background: col }} /></span>
                      </span>
                      <span className={`${styles.status} ${t.status === "none" ? styles.statusNone : ""}`} style={{ color: col, background: `color-mix(in srgb, ${col} 13%, transparent)` }}>{STATUS_LABEL[t.status]}</span>
                      {t.n > 0 && <ChevronRight size={18} className={styles.chev} />}
                    </>
                  );
                  return t.n > 0
                    ? <button key={t.topic} className={styles.row} onClick={() => onTopic(k, t.topics[0])}>{body}</button>
                    : <div key={t.topic} className={styles.row}>{body}</div>;
                })}
              </div>}
            </div>
          </section>
        );
      })}
    </>
  );
}

const fmtDay = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, o);
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
/** Fill step for a day: 0 is the empty track, 1 to 4 get darker with more answers. */
const dayLevel = (n: number) => (n <= 0 ? 0 : n < 10 ? 1 : n < 20 ? 2 : n < 40 ? 3 : 4);

/** The last five weeks (Sunday first, ending with this week): darker green for more answers; tap a day for its numbers. */
function StudyCalendar({ days }: { days: { date: string; answered: number; correct: number }[] }) {
  const today = dateKey.today();
  const [sel, setSel] = useState(today);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const dow = new Date(`${today}T12:00:00`).getDay();
  const start = dateKey.addDays(today, -dow - 28);
  const cells = Array.from({ length: 35 }, (_, i) => dateKey.addDays(start, i));
  const cur = byDate.get(sel);
  return (
    <section className={styles.sec}>
      <div className={styles.secH}>
        <h2>Study calendar</h2>
        <small>{cur?.answered ? `${cur.answered} answered · ${pct(cur.correct, cur.answered)}%` : fmtDay(sel, { month: "short", day: "numeric" })}</small>
      </div>
      <div className={`${styles.card} ${styles.cal}`}>
        <div className={styles.calGrid} aria-hidden="true">{WEEKDAYS.map((w, i) => <span key={i} className={styles.calHead}>{w}</span>)}</div>
        <div className={styles.calGrid}>
          {cells.map((d) => {
            if (d > today) return <span key={d} className={`${styles.calDay} ${styles.calFuture}`} aria-hidden="true" />;
            const n = byDate.get(d)?.answered ?? 0;
            return (
              <button key={d} aria-pressed={sel === d} aria-label={`${fmtDay(d, { month: "short", day: "numeric" })}: ${n} answered`}
                className={`${styles.calDay} ${styles[`calL${dayLevel(n)}`]} ${d === today ? styles.calToday : ""} ${sel === d ? styles.calSel : ""}`}
                onClick={() => { if (sel !== d) haptic(); setSel(d); }}>{Number(d.slice(8))}</button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ActivityView({ e, state, onStudy, onLesson }: { e: Engine; state: NonNullable<ReturnType<typeof useLawstinData>["query"]["data"]>; onStudy: (items: QuestionDTO[], course: CourseCode | null) => void; onLesson: (topics: MissedTopic[]) => void }) {
  const days = e.lastNDays(14);
  const max = Math.max(10, ...days.map((d) => d.answered));
  const fmt = fmtDay;
  const library = useStudyLibrary();
  const total = days.reduce((a, d) => a + d.answered, 0);
  const missed = e.missedTopics();
  return (
    <>
      {missed.length > 0 && <MissedTopics topics={missed} onLesson={onLesson} />}
      <StudyCalendar days={state.days} />
      {total > 0 && <section className={styles.sec}>
        <div className={styles.secH}><h2>Last 14 days</h2><small>{total} answers</small></div>
        <div className={`${styles.card} ${styles.bars}`}>
          <div className={styles.barsRow}>
            {days.map((d) => (
              <div key={d.date} className={styles.bar} style={{ height: `${Math.max(3, (d.answered / max) * 100)}%` }} title={`${fmt(d.date, { month: "short", day: "numeric" })}: ${d.answered} answered`}>
                <i style={{ height: `${d.answered ? (d.correct / d.answered) * 100 : 0}%`, background: "var(--success)" }} />
                <i style={{ height: `${d.answered ? ((d.answered - d.correct) / d.answered) * 100 : 0}%`, background: "var(--error)", opacity: 0.75 }} />
              </div>
            ))}
          </div>
          <div className={styles.barsX}>{days.map((d, i) => <span key={d.date}>{i % 2 ? "" : Number(d.date.slice(8))}</span>)}</div>
          <div className={styles.legend}><span><i style={{ background: "var(--success)" }} />Correct</span><span><i style={{ background: "var(--error)", opacity: 0.75 }} />Missed</span></div>
        </div>
      </section>}
      <UpdateFeed e={e} runs={state.runs.slice(0, 20)} studyRuns={library.data?.runs.slice(0, 20) ?? []} materials={library.data?.materials ?? []} onStudy={onStudy} />
    </>
  );
}

function whenLabel(date: string, today: string) {
  const days = Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) / 86400000);
  const d = new Date(`${date}T12:00:00`);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Updates shown as a notification stack: the newest on top, earlier ones tucked behind until tapped. */
type FeedEntry = { key: string; date: string; node: (e: Engine) => React.ReactNode };

/** Question updates and study-material updates in one notification feed, newest first. */
function UpdateFeed({ e, runs: qRuns, studyRuns, materials, onStudy }: { e: Engine; runs: Run[]; studyRuns: StudyRun[]; materials: StudyMaterial[]; onStudy: (items: QuestionDTO[], course: CourseCode | null) => void }) {
  const [open, setOpen] = useState(false);
  const runs: FeedEntry[] = [
    ...qRuns.map((r) => ({ key: `q-${r.date}`, date: r.date, node: (en: Engine) => <UpdateNote e={en} run={r} onStudy={onStudy} /> })),
    ...studyRuns.map((r) => ({ key: `s-${r.id}`, date: r.run_date, node: (en: Engine) => <StudyNote today={en.today} run={r} materials={materials} /> })),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  const earlier = runs.length - 1;
  if (!runs.length) return null;
  return (
    <section className={`${styles.sec} ${styles.fullRow}`}>
      <div className={styles.secH}>
        <h2>Updates</h2>
        {earlier > 0 && <button className={styles.feedToggle} onClick={() => { haptic(); setOpen((v) => !v); }}>{open ? "Show less" : `${earlier} earlier`}</button>}
      </div>
      {(
        <div className={`${styles.feed} ${open ? styles.feedOpen : ""}`}>
          {runs[0].node(e)}
          {!open && earlier > 0 && (
            <button className={styles.feedPeek} aria-label={`Show ${earlier} earlier updates`} onClick={() => { haptic(); setOpen(true); }}>
              <i /><i />
            </button>
          )}
          {open && runs.slice(1).map((r, i) => (
            <div key={r.key} className={styles.feedIn} style={{ animationDelay: `${i * 45}ms` }}>{r.node(e)}</div>
          ))}
        </div>
      )}
    </section>
  );
}

type Bubble = { course: CourseCode; label: string; qs: QuestionDTO[]; n: number; left: number };

/** Topics an update added, grouped by course; falls back to course totals when questions can't be matched by batch. */
function topicBubbles(e: Engine, run: Run, added: QuestionDTO[]): Bubble[] {
  const groups = new Map<string, { course: CourseCode; label: string; qs: QuestionDTO[] }>();
  for (const q of added) {
    if (!COURSES[q.course]) continue;
    const key = `${q.course}|${q.topic}`;
    const g = groups.get(key) ?? { course: q.course, label: q.topic, qs: [] };
    g.qs.push(q);
    groups.set(key, g);
  }
  const bubbles = [...groups.values()].sort((a, b) => COURSE_KEYS.indexOf(a.course) - COURSE_KEYS.indexOf(b.course) || b.qs.length - a.qs.length)
    .map((g) => ({ ...g, n: g.qs.length, left: g.qs.filter((q) => !e.prog(q.id)?.seen).length }));
  if (!bubbles.length) {
    return (Object.entries(run.byCourse) as [CourseCode, number][]).filter(([k, n]) => n > 0 && COURSES[k])
      .map(([k, n]) => ({ course: k, label: COURSES[k].short, qs: [], n, left: n }));
  }
  return bubbles;
}

type Chip = { course: CourseCode; label: string; n: number; left: number; onClick: () => void };
/** Most bubbles shown before the rest collapse into one "+N". */
const BUBBLE_CAP = 6;

/** Topic bubbles, topics with questions left first; past the cap a "+N" bubble reveals the rest in place. */
function BubbleList({ chips }: { chips: Chip[] }) {
  const [all, setAll] = useState(false);
  const sorted = [...chips].sort((a, b) => Number(b.left > 0) - Number(a.left > 0));
  const hidden = all ? 0 : Math.max(0, sorted.length - BUBBLE_CAP);
  return (
    <div className={styles.bubbles}>
      {(hidden ? sorted.slice(0, BUBBLE_CAP) : sorted).map((b) => (
        <button key={`${b.course}|${b.label}`} className={`${styles.bubble} ${b.left === 0 ? styles.bubbleDone : ""}`}
          style={{ "--c": COURSES[b.course].color } as React.CSSProperties} onClick={b.onClick}>
          {b.left === 0 ? <Check size={12} strokeWidth={3} /> : <i />}
          <span>{b.label}</span>
          <small>{b.n}</small>
        </button>
      ))}
      {hidden > 0 && (
        <button className={`${styles.bubble} ${styles.bubbleMore}`} aria-label={`Show ${hidden} more topics`} onClick={() => { haptic(); setAll(true); }}>+{hidden}</button>
      )}
    </div>
  );
}

function TopicBubbles({ bubbles, onStudy }: { bubbles: Bubble[]; onStudy: (items: QuestionDTO[], course: CourseCode | null) => void }) {
  return <BubbleList chips={bubbles.map((b) => ({ course: b.course, label: b.label, n: b.n, left: b.left, onClick: () => onStudy(b.qs, b.course) }))} />;
}

function UpdateNote({ e, run, onStudy }: { e: Engine; run: Run; onStudy: (items: QuestionDTO[], course: CourseCode | null) => void }) {
  const added = e.questions.filter((q) => q.batch?.includes(run.date));
  const bubbles = topicBubbles(e, run, added);
  const left = bubbles.reduce((a, b) => a + b.left, 0);
  return (
    <div className={`${styles.card} ${styles.note}`}>
      <div className={styles.noteTop}>
        <img src="./icon-192.png" alt="" className={styles.noteIcon} />
        <span className={styles.noteApp}>Lawstin</span>
        <span className={styles.noteWhen}>{whenLabel(run.date, e.today)}</span>
      </div>
      <button className={styles.noteMain} onClick={() => onStudy(added, null)}>
        <b>{run.added} new question{run.added === 1 ? "" : "s"}</b>
        <span>{left === 0 ? "All studied" : `${left} left to study`}</span>
      </button>
      <TopicBubbles bubbles={bubbles} onStudy={onStudy} />
    </div>
  );
}

const KIND_ONE = { flashcard: "flashcard", flowchart: "flowchart", outline: "rule review", comparison: "comparison", drill: "sorting drill", hypothetical: "hypothetical" };
const KIND_MANY = { flashcard: "flashcards", flowchart: "flowcharts", outline: "rule reviews", comparison: "comparisons", drill: "sorting drills", hypothetical: "hypotheticals" };

function StudyNote({ today, run, materials }: { today: string; run: StudyRun; materials: StudyMaterial[] }) {
  const added = materials.filter((m) => m.batch === run.run_date);
  const groups = new Map<string, { course: CourseCode; label: string; n: number }>();
  for (const m of added) {
    const key = `${m.course}|${m.topic}`;
    const g = groups.get(key) ?? { course: m.course, label: m.topic, n: 0 };
    g.n++; groups.set(key, g);
  }
  let bubbles = [...groups.values()].sort((a, b) => COURSE_KEYS.indexOf(a.course) - COURSE_KEYS.indexOf(b.course) || b.n - a.n);
  if (!bubbles.length) bubbles = (Object.entries(run.by_course) as [CourseCode, number][]).filter(([k, n]) => n > 0 && COURSES[k]).map(([k, n]) => ({ course: k, label: COURSES[k].short, n }));
  const kinds = Object.entries(run.by_kind).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${(n === 1 ? KIND_ONE : KIND_MANY)[k as keyof typeof KIND_ONE] ?? k}`).join(" · ");
  const open = (course?: CourseCode) => { haptic(); window.location.hash = course ? `/courses/${course}` : "/courses"; };
  return (
    <div className={`${styles.card} ${styles.note}`}>
      <div className={styles.noteTop}>
        <img src="./icon-192.png" alt="" className={styles.noteIcon} />
        <span className={styles.noteApp}>Lawstin</span>
        <span className={styles.noteWhen}>{whenLabel(run.run_date, today)}</span>
      </div>
      <button className={styles.noteMain} onClick={() => open()}>
        <b>{run.added} new study material{run.added === 1 ? "" : "s"}</b>
        <span>{kinds}</span>
      </button>
      <BubbleList chips={bubbles.map((b) => ({ course: b.course, label: b.label, n: b.n, left: b.n, onClick: () => open(b.course) }))} />
    </div>
  );
}

/** Pro Res is tested by timed multiple choice; the essay courses by a timed essay. */
function ExamPicker({ e, onStart, onEssay }: { e: Engine; onStart: (f: Filter, n: number, timed: boolean) => void; onEssay: (c: CourseCode) => void }) {
  const [f, setF] = useState<Filter>("pr");
  const [n, setN] = useState(20);
  const [timed, setTimed] = useState(true);
  const essay = f !== "all" && EXAMS[f].format === "essay";
  const available = e.queues(f).total;
  // Only offer lengths the bank can fill; the last option is always "every question" for this course.
  const lengths = [10, 20, 30].filter((k) => k < available);
  if (available > 0) lengths.push(available);
  const size = lengths.includes(n) ? n : lengths[lengths.length - 1] ?? 0;
  return (
    <div className={styles.examPick}>
      <div className={styles.seg} role="group" aria-label="Exam course">
        {([["pr", "Pro Res"], ["il", "Intl Law"], ["asy", "Asylum"], ["all", "Mixed"]] as const).map(([k, l]) => (
          <button key={k} aria-pressed={f === k} className={f === k ? styles.segOn : ""} onClick={() => { haptic(); setF(k); }}>{l}</button>
        ))}
      </div>
      {essay ? (
        <Button className={`${styles.big} ${styles.cta}`} onClick={() => onEssay(f as CourseCode)}>Start 45-minute essay</Button>
      ) : (
        <>
          {lengths.length > 1 && (
            <div className={styles.seg} role="group" aria-label="Exam length">
              {lengths.map((k) => (
                <button key={k} aria-pressed={size === k} className={size === k ? styles.segOn : ""} onClick={() => { haptic(); setN(k); }}>
                  {k === available ? `All ${k}` : k}
                </button>
              ))}
            </div>
          )}
          <div className={styles.seg} role="group" aria-label="Timing">
            <button aria-pressed={timed} className={timed ? styles.segOn : ""} onClick={() => { haptic(); setTimed(true); }}>{size ? `${Math.round((size * EXAM_PACE) / 60)} minutes` : "Timed"}</button>
            <button aria-pressed={!timed} className={!timed ? styles.segOn : ""} onClick={() => { haptic(); setTimed(false); }}>Untimed</button>
          </div>
          <Button className={`${styles.big} ${styles.cta}`} disabled={!size} onClick={() => onStart(f, size, timed)}>
            {size ? `Start ${size}-question exam` : "No questions yet"}
          </Button>
        </>
      )}
    </div>
  );
}

/** The reasoning behind the numbers, from the same rules the code uses (finalsPlan, reviewSchedule, examDue, coverage). */
function HowItWorks({ plan, planOn, goal }: { plan: PlanCourse[]; planOn: boolean; goal: number }) {
  const chips: [CoverageStatus, string][] = [
    ["unseen", "You haven’t answered any of its questions yet."],
    ["shaky", "Under 70% right after at least 2 answers, or a low-scoring essay on it."],
    ["learning", "Some questions unseen, or under 85% right."],
    ["solid", "Every question seen and 85% right or better."],
    ["none", "No questions written for it yet."],
  ];
  const steps = ["1 day", "3 days", "7 days", "16 days", "35 days"];
  return (
    <div className={styles.how}>
      <section className={styles.sec}>
        <div className={styles.secH}><h2>Today</h2></div>
        <div className={`${styles.card} ${styles.list}`}>
          {planOn ? plan.map((c) => (
            <div key={c.course} className={styles.row}>
              <span className={styles.dot} style={{ background: COURSES[c.course].color }}>{COURSES[c.course].short[0]}</span>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{COURSES[c.course].short}</span>
                <span className={styles.rowSub}>{c.days === 0 ? "Final today" : `${c.days} ${c.days === 1 ? "day" : "days"} to the final`}</span>
              </span>
              <span className={styles.rowEnd}><b>{c.target}</b></span>
            </div>
          )) : (
            <div className={styles.row}>
              <span className={styles.rowMain}><span className={styles.rowTitle}>Daily goal</span></span>
              <span className={styles.rowEnd}><b>{goal}</b></span>
            </div>
          )}
          {planOn && (
            <div className={styles.row}>
              <span className={styles.rowMain}><span className={styles.rowTitle}>Today’s goal</span></span>
              <span className={styles.rowEnd}><b>{goal}</b></span>
            </div>
          )}
        </div>
        {planOn && <p className={styles.howNote}>Each number is the course’s unseen material spread over the days left, finishing two days before its final, plus reviews that are ready.</p>}
      </section>

      <section className={styles.sec}>
        <div className={styles.secH}><h2>When a question comes back</h2></div>
        <div className={`${styles.card} ${styles.howCard}`}>
          <ol className={styles.ladder}>
            {steps.map((l, i) => (
              <li key={l} className={styles.rung}>
                <span className={styles.rungDot} style={{ background: i === 0 ? "var(--error)" : `color-mix(in srgb, var(--success) ${40 + i * 15}%, transparent)` }}>{i + 1}</span>
                <span className={styles.rungLabel}>{l}</span>
              </li>
            ))}
          </ol>
          <p className={styles.howNote}>A miss comes back the next day. Each right answer moves it one step further out. Anything that would land on or after a final comes back in the last 5 days before it.</p>
        </div>
      </section>

      <section className={styles.sec}>
        <div className={styles.secH}><h2>What the labels mean</h2></div>
        <div className={`${styles.card} ${styles.list}`}>
          {chips.map(([k, line]) => (
            <div key={k} className={styles.row}>
              <span className={`${styles.status} ${styles.howChip} ${k === "none" ? styles.statusNone : ""}`} style={{ color: STATUS_COLOR[k], background: `color-mix(in srgb, ${STATUS_COLOR[k]} 13%, transparent)` }}>{STATUS_LABEL[k]}</span>
              <span className={styles.rowMain}><span className={`${styles.rowSub} ${styles.wrapSub}`}>{line}</span></span>
            </div>
          ))}
          <div className={styles.row}>
            <span className={`${styles.status} ${styles.howChip}`} style={{ color: "var(--warning)", background: "color-mix(in srgb, var(--warning) 13%, transparent)" }}>Missed</span>
            <span className={styles.rowMain}><span className={`${styles.rowSub} ${styles.wrapSub}`}>A topic is missed when your latest answer to one of its questions was wrong, or a guess. A later right answer or finishing its lesson clears it.</span></span>
          </div>
        </div>
      </section>
    </div>
  );
}

function BottomSheet({ title, eyebrow, onClose, children, className }: { className?: string; title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode }) {
  const [closing, setClosing] = useState(false);
  const close = () => { setClosing(true); setTimeout(onClose, 300); };
  useBackClose(close);
  const swipe = useSwipeDown<HTMLDivElement>(close);
  const modalRef = useModalFocus<HTMLDivElement>();
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") close(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  return (
    <div ref={modalRef} tabIndex={-1} className={`${styles.scrim} ${closing ? styles.scrimOut : ""}`} onClick={close}>
      <div ref={swipe.ref} className={`${styles.bsheet} ${className ?? ""} ${closing ? styles.bsheetOut : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={(ev) => ev.stopPropagation()}>
        <div {...swipe.handle}>
          <div className={styles.grab} />
          <div className={styles.bsheetHead}>
            <div>{eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}<h2>{title}</h2></div>
            <button className={styles.x} onClick={close} aria-label="Close"><X size={15} strokeWidth={2.4} /></button>
          </div>
        </div>
        <div className={styles.bsheetBody}>{children}</div>
      </div>
    </div>
  );
}
