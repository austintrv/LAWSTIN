import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, BarChart3, BookCheck, CalendarDays, Star, X, Timer, Flame, PenLine, Check, Sparkles, LibraryBig } from "lucide-react";
const Courses = lazy(() => import("../components/Courses").then(module => ({ default: module.Courses })));
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { QuizSession, type QuizMode } from "../components/QuizSession";
import { SettingsPanel } from "../components/SettingsPanel";
import { WrittenPractice } from "../components/WrittenPractice";
import { useLawstinData } from "../helpers/useLawstinData";
import { useLawstinAi } from "../helpers/useLawstinAi";
import { switchToAutoMode } from "../helpers/themeMode";
import { toast } from "../helpers/toast";
import { dateKey } from "../helpers/dateKey";
import { haptic } from "../helpers/haptics";
import { COURSES, COURSE_KEYS, DAILY_GOAL, ROUND_SIZE, studyEngine, makeGreeting, type Filter, type RoundItem, type CourseCode } from "../helpers/studyEngine";
import type { QuestionDTO } from "../endpoints/state_GET.schema";
import styles from "./_index.module.css";

type Tab = "progress" | "study" | "activity" | "courses";
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

export default function LawstinApp({ userId }: { userId: string }) {
  const { query, answer, mark } = useLawstinData();
  const { harder } = useLawstinAi();
  const state = query.data;
  const e = useMemo(() => studyEngine(state), [state]);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [coursesVisited, setCoursesVisited] = useState(() => tabFromHash() === "courses");
  const [filter, setFilter] = useState<Filter>("all");
  const [session, setSession] = useState<{ items: RoundItem[]; mode: QuizMode; key: number; source: () => RoundItem[] } | null>(null);
  const [topicSheet, setTopicSheet] = useState<{ course: CourseCode; topic: string } | null>(null);
  const [examSheet, setExamSheet] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [greeting, setGreeting] = useState(() => {
    const h = new Date().getHours();
    return h < 5 || h >= 22 ? `Still up, ${NAME}?` : h < 12 ? `Good morning, ${NAME}` : h < 17 ? `Good afternoon, ${NAME}` : `Good evening, ${NAME}`;
  });
  const greeted = useRef(false);
  const paneRefs = useRef<Record<Tab, HTMLDivElement | null>>({ progress: null, study: null, activity: null, courses: null });
  const hiddenAt = useRef(0);
  const prevToday = useRef<number | null>(null);
  const [compact, setCompact] = useState<Record<Tab, boolean>>({ progress: false, study: false, activity: false, courses: false });
  const onPaneScroll = (k: Tab, el: HTMLDivElement) => {
    const on = el.scrollTop > 52;
    setCompact((c) => (c[k] === on ? c : { ...c, [k]: on }));
  };

  useEffect(() => { switchToAutoMode(); }, []);
  useEffect(() => { if (tab === "courses") setCoursesVisited(true); }, [tab]);
  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = (next: Tab) => {
    haptic();
    if (tab === next) paneRefs.current[next]?.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    else { window.location.hash = `/${next}`; setTab(next); }
  };

  useEffect(() => {
    if (!state || greeted.current) return;
    greeted.current = true;
    const g = makeGreeting(state, NAME, readRecent());
    setGreeting(g); saveRecent(g);
  }, [state]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) { hiddenAt.current = Date.now(); return; }
      if (hiddenAt.current && Date.now() - hiddenAt.current > 20 * 60 * 1000) {
        greeted.current = false;
        query.refetch();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [query]);

  // Daily goal: celebrate once when today's count crosses the goal.
  const todayAnswered = e.todayCount?.answered ?? 0;
  useEffect(() => {
    if (!state) return;
    const prev = prevToday.current;
    prevToday.current = todayAnswered;
    if (prev !== null && prev < DAILY_GOAL && todayAnswered >= DAILY_GOAL) {
      setCelebrate(true);
      haptic();
      toast("Daily goal done");
      const t = setTimeout(() => setCelebrate(false), 2400);
      return () => clearTimeout(t);
    }
  }, [todayAnswered, state]);

  const start = (source: () => RoundItem[], mode: QuizMode = "practice") => {
    const items = source();
    if (!items.length) { toast("Nothing to study here yet"); return; }
    haptic();
    setExamSheet(false); setTopicSheet(null);
    setSession({ items, mode, key: Date.now(), source });
  };

  const onAnswer = async (q: QuestionDTO, choice: string) => {
    if (q.id.startsWith("ai-")) return choice === q.answer;
    try {
      const res = await answer.mutateAsync({ questionId: q.id, choice: choice as "A" | "B" | "C" | "D", localDate: dateKey.today() });
      return res.correct;
    } catch {
      toast.error("Couldn’t save that answer");
      return choice === q.answer;
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

  const loading = !state && query.isFetching;
  const failed = !state && query.isError;

  return (
    <div className={styles.app}>
      <main className={styles.panes} data-app-panes>
        {TABS.map((k) => (
          <div key={k} data-pane={k} ref={(el) => { paneRefs.current[k] = el; }} className={`${styles.pane} ${tab === k ? styles.paneOn : ""}`} aria-hidden={tab !== k}
            onScroll={(ev) => onPaneScroll(k, ev.currentTarget)}>
            <div className={`${styles.navbar} ${compact[k] ? styles.navbarOn : ""}`} aria-hidden="true">
              <span>{k === "study" ? "Study" : k === "progress" ? "Progress" : k === "courses" ? "Courses" : "Activity"}</span>
            </div>
            <div className={styles.shell}>
              <header className={styles.head}>
                <div className={styles.headRow}>
                  <span className={styles.eyebrow}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
                  <button className={styles.avatar} onClick={() => { haptic(); setSettingsOpen(true); }} aria-label="Settings">{NAME[0]}</button>
                </div>
                <h1 className={k === "study" ? styles.greet : styles.title}>{k === "study" ? greeting : k === "progress" ? "Progress" : k === "courses" ? "Courses" : "Activity"}</h1>
              </header>

              {loading && k !== "courses" && <LoadingCard />}
              {failed && k !== "courses" && (
                <div className={`${styles.card} ${styles.empty}`}>
                  <h2>Couldn’t load your questions</h2>
                  <p>{(query.error as Error)?.message}</p>
                  <Button variant="secondary" onClick={() => query.refetch()}>Try again</Button>
                </div>
              )}

              {state && k === "study" && (
                <StudyView e={e} state={state} filter={filter} setFilter={setFilter} celebrate={celebrate}
                  onStart={() => start(() => studyEngine(query.data).buildRound(filter))}
                  onCourse={(c) => start(() => studyEngine(query.data).buildRound(c))}
                  onMissed={() => start(() => studyEngine(query.data).listRound(studyEngine(query.data).queues(filter).missed))}
                  onStarred={() => start(() => studyEngine(query.data).listRound(studyEngine(query.data).queues(filter).starred))}
                  onExam={() => { haptic(); setExamSheet(true); }}
                  onWrite={() => { haptic(); setWriting(true); }}
                  onUpdate={(list, c) => start(() => {
                    const eng = studyEngine(query.data);
                    if (!list.length) return eng.buildRound(c ?? "all");
                    const left = list.filter((q) => !(eng.prog(q.id)?.seen));
                    return eng.listRound(left.length ? left : list);
                  })} />
              )}
              {state && k === "progress" && <ProgressView e={e} onTopic={(course, topic) => { haptic(); setTopicSheet({ course, topic }); }} />}
              {state && k === "activity" && (
                <ActivityView e={e} state={state}
                  onStudy={(list, c) => start(() => {
                    const eng = studyEngine(query.data);
                    if (!list.length) return eng.buildRound(c ?? "all");
                    const left = list.filter((q) => !(eng.prog(q.id)?.seen));
                    return eng.listRound(left.length ? left : list);
                  })} />
              )}
              {k === "courses" && coursesVisited && <Suspense fallback={<LoadingCard />}><Courses userId={userId} state={state} onWrite={() => setWriting(true)} onQuiz={(course, topic) => start(() => topic ? studyEngine(query.data).topicRound(course, topic) : studyEngine(query.data).buildRound(course))} /></Suspense>}
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
          <Button className={`${styles.big} ${styles.cta}`} onClick={() => start(() => studyEngine(query.data).topicRound(topicSheet.course, topicSheet.topic))}>Drill this topic</Button>
        </BottomSheet>
      )}

      {examSheet && (
        <BottomSheet onClose={() => setExamSheet(false)} title="Practice exam">
          <ExamPicker e={e} onStart={(f, n) => start(() => studyEngine(query.data).examRound(f, n), "exam")} />
        </BottomSheet>
      )}

      {settingsOpen && (
        <BottomSheet onClose={() => setSettingsOpen(false)} title="Settings">
          <SettingsPanel />
        </BottomSheet>
      )}

      {writing && <WrittenPractice onClose={() => setWriting(false)} />}

      {session && (
        <QuizSession
          key={session.key}
          items={session.items}
          mode={session.mode}
          getProgress={(id) => studyEngine(query.data).prog(id)}
          onAnswer={onAnswer}
          onHarder={session.mode === "practice" ? onHarder : undefined}
          onStar={(q, starred) => mark.mutate({ action: "star", questionId: q.id, starred })}
          onGuess={(q) => mark.mutate({ action: "guess", questionId: q.id, localDate: dateKey.today() })}
          onFlag={(q, note) => { mark.mutate({ action: "flag", questionId: q.id, note }); toast("Flagged for the next update"); }}
          onAnother={() => { const items = session.source(); if (!items.length) { setSession(null); toast("All caught up"); return; } setSession({ ...session, items, key: Date.now() }); }}
          onRetry={(items) => setSession({ items, mode: "practice", key: Date.now(), source: session.source })}
          onClose={() => setSession(null)}
        />
      )}
    </div>
  );
}

type Engine = ReturnType<typeof studyEngine>;

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

function StudyView({ e, state, filter, setFilter, celebrate, onStart, onCourse, onMissed, onStarred, onExam, onWrite, onUpdate }: {
  e: Engine; state: NonNullable<ReturnType<typeof useLawstinData>["query"]["data"]>; filter: Filter; setFilter: (f: Filter) => void; celebrate: boolean;
  onStart: () => void; onCourse: (c: CourseCode) => void; onMissed: () => void; onStarred: () => void; onExam: () => void; onWrite: () => void; onUpdate: (items: QuestionDTO[], course: CourseCode | null) => void;
}) {
  if (!e.questions.length) {
    return <div className={`${styles.card} ${styles.empty}`}><h2>No questions yet</h2><p>New questions arrive Tuesday, Thursday, and Saturday mornings.</p></div>;
  }
  const qs = e.queues(filter);
  const today = e.todayCount?.answered ?? 0;
  const week = e.lastNDays(7).reduce((a, d) => ({ a: a.a + d.answered, c: a.c + d.correct }), { a: 0, c: 0 });
  const avail = qs.due.length + qs.fresh.length + qs.ahead.length;
  const ready = qs.due.length + qs.fresh.length;
  const roundN = Math.min(ROUND_SIZE, ready || qs.ahead.length);
  const roundLabel = !avail ? "All caught up" : ready ? `Start ${roundN} question${roundN === 1 ? "" : "s"}` : `Review ${roundN} ahead`;
  const run = state.runs[0];
  const goalPct = Math.min(1, today / DAILY_GOAL);
  const goalDone = today >= DAILY_GOAL;
  const circ = 2 * Math.PI * 16;
  const streak = e.streak();
  const studiedToday = today > 0;
  return (
    <>
      <div className={`${styles.card} ${styles.hero}`}>
        <div className={styles.seg} role="group" aria-label="Course filter">
          {([["all", "All"], ["il", "Intl Law"], ["asy", "Asylum"], ["pr", "Pro Res"]] as const).map(([k, l]) => (
            <button key={k} aria-pressed={filter === k} className={filter === k ? styles.segOn : ""} onClick={() => { if (filter !== k) haptic(); setFilter(k); }}>{l}</button>
          ))}
        </div>
        <div className={styles.split}>
          <div><b><Num v={qs.due.length} /></b><span>Reviews due</span></div>
          <div><b><Num v={qs.fresh.length} /></b><span>New</span></div>
          <div><b><Num v={qs.missed.length} /></b><span>Missed</span></div>
        </div>
        <Button className={`${styles.big} ${styles.cta}`} disabled={!avail} onClick={onStart}>
          {roundLabel}
        </Button>
      </div>

      <div className={styles.tiles}>
        <div className={`${styles.card} ${styles.tile} ${styles.streakTile} ${streak && studiedToday ? styles.streakLit : ""}`}>
          <div className={styles.streakTop}>
            <b><Num v={streak} /></b>
            <Flame size={20} className={styles.flame} fill={streak && studiedToday ? "currentColor" : "none"} strokeWidth={2} />
          </div>
          <span>Day streak</span>
        </div>
        <div className={`${styles.card} ${styles.tile} ${styles.goalTile} ${goalDone ? styles.goalDone : ""} ${celebrate ? styles.goalBurst : ""}`}>
          <div><b><Num v={today} /></b><span>of {DAILY_GOAL} today</span></div>
          <span className={styles.goalWrap}>
            <svg viewBox="0 0 40 40" className={styles.goalRing} aria-hidden="true">
              <circle cx="20" cy="20" r="16" className={styles.goalTrack} />
              <circle cx="20" cy="20" r="16" className={styles.goalVal} style={{ strokeDasharray: circ, strokeDashoffset: circ * (1 - goalPct), opacity: today ? 1 : 0 }} />
            </svg>
            {goalDone && <Check size={14} strokeWidth={3.2} className={styles.goalCheck} />}
          </span>
        </div>
        <div className={`${styles.card} ${styles.tile}`}><b>{week.a ? <Num v={pct(week.c, week.a)} suffix="%" /> : "—"}</b><span>Correct, 7 days</span></div>
      </div>

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

      <section className={styles.sec}>
        <div className={`${styles.card} ${styles.list}`}>
          <button className={styles.row} onClick={onExam}>
            <span className={styles.dot} style={{ background: "var(--foreground)" }}><Timer size={13} color="var(--background)" /></span>
            <span className={styles.rowMain}><span className={styles.rowTitle}>Practice exam</span></span>
            <ChevronRight size={18} className={styles.chev} />
          </button>
          <button className={styles.row} onClick={onWrite}>
            <span className={styles.dot} style={{ background: "var(--uh-red)" }}><PenLine size={12} color="#fff" strokeWidth={2.4} /></span>
            <span className={styles.rowMain}><span className={styles.rowTitle}>Written practice</span></span>
            <ChevronRight size={18} className={styles.chev} />
          </button>
          <button className={styles.row} onClick={onMissed} disabled={!qs.missed.length}>
            <span className={styles.dot} style={{ background: "var(--error)" }}>!</span>
            <span className={styles.rowMain}><span className={styles.rowTitle}>Missed questions</span></span>
            <span className={styles.rowEnd}>{qs.missed.length}</span>
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

      {run && <UpdateCard e={e} run={run} onStudy={onUpdate} />}
    </>
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
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15" className={styles.updTrack} />
              <circle cx="18" cy="18" r="15" className={styles.updVal} style={{ strokeDasharray: circ, strokeDashoffset: circ * (1 - (total ? doneN / total : 0)) }} />
            </svg>
            {left === 0 ? <Check size={14} strokeWidth={3} className={styles.updCheck} /> : <Sparkles size={14} className={styles.updSpark} />}
          </span>
          <div className={styles.updHead}>
            <b>{total} new question{total === 1 ? "" : "s"}</b>
            <span>{left === 0 ? "All studied" : `${left} left to study`}</span>
          </div>
          {left > 0 && (
            <button className={styles.updGo} onClick={() => onStudy(added, null)}>Study</button>
          )}
        </div>
        <div className={styles.updRows}>
          {rows.map((r) => {
            const c = COURSES[r.k];
            return (
              <button key={r.k} className={styles.updRow} onClick={() => onStudy(r.qs, r.k)}>
                <span className={styles.dot} style={{ background: c.color }}>{c.short[0]}</span>
                <span className={styles.updName}>{c.short}</span>
                <span className={styles.updCount}>{r.left === 0 ? <><Check size={13} strokeWidth={3} /> Done</> : `${r.left} of ${r.n}`}</span>
                <ChevronRight size={16} className={styles.chev} />
              </button>
            );
          })}
        </div>
        <div className={styles.updTopics}><TopicBubbles bubbles={topicBubbles(e, run, added)} onStudy={onStudy} /></div>
      </div>
    </section>
  );
}

function ProgressView({ e, onTopic }: { e: Engine; onTopic: (c: CourseCode, t: string) => void }) {
  const m = e.missProfile();
  const misses = m.sneaky + m.average + m.bad;
  const ts = e.topicStats();
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
      <section className={styles.sec}>
        <div className={styles.secH}><h2>Which wrong answers catch you</h2></div>
        <div className={`${styles.card} ${styles.list} ${styles.flat}`}>
          {roleRow("Sneaky distractor", m.sneaky, "var(--course-pr)")}
          {roleRow("Average distractor", m.average, "var(--course-il)")}
          {roleRow("Really bad answer", m.bad, "var(--error)")}
          {roleRow("Correct but guessed", m.guessed, "var(--faint-foreground)")}
        </div>
      </section>
      {COURSE_KEYS.map((k) => {
        const rows = ts.filter((t) => t.course === k).sort((a, b) => {
          const aa = a.c + a.w ? a.c / (a.c + a.w) : 2, bb = b.c + b.w ? b.c / (b.c + b.w) : 2;
          return aa - bb;
        });
        if (!rows.length) return null;
        const s = e.courseStats(k), c = COURSES[k];
        return (
          <section key={k} className={styles.sec}>
            <div className={styles.secH}><h2>{c.name}</h2><small>{s.seen ? `${s.acc}% correct` : "Not started"}</small></div>
            <div className={`${styles.card} ${styles.list} ${styles.flat}`}>
              {rows.map((t) => {
                const a = t.c + t.w, acc = pct(t.c, a);
                const col = !a ? "var(--faint-foreground)" : acc >= 80 ? "var(--success)" : acc >= 60 ? c.color : "var(--error)";
                return (
                  <button key={t.topic} className={styles.row} onClick={() => onTopic(k, t.topic)}>
                    <span className={styles.rowMain}>
                      <span className={`${styles.rowTitle} ${styles.wrap}`}>{t.topic}</span>
                      <span className={styles.rowSub}>{t.seen} of {t.n} seen</span>
                      <span className={styles.meter}><i style={{ width: `${a ? acc : 0}%`, background: col }} /></span>
                    </span>
                    <span className={styles.rowEnd} style={{ color: col, fontWeight: 600 }}>{a ? `${acc}%` : "—"}</span>
                    <ChevronRight size={18} className={styles.chev} />
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

function ActivityView({ e, state, onStudy }: { e: Engine; state: NonNullable<ReturnType<typeof useLawstinData>["query"]["data"]>; onStudy: (items: QuestionDTO[], course: CourseCode | null) => void }) {
  const days = e.lastNDays(14);
  const max = Math.max(10, ...days.map((d) => d.answered));
  const studied = [...state.days].filter((d) => d.answered).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, o);
  return (
    <>
      <section className={styles.sec}>
        <div className={styles.secH}><h2>Last 14 days</h2><small>{days.reduce((a, d) => a + d.answered, 0)} answers</small></div>
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
      </section>
      <section className={styles.sec}>
        <div className={styles.secH}><h2>Days you studied</h2></div>
        {studied.length ? (
          <div className={`${styles.card} ${styles.list} ${styles.flat}`}>
            {studied.map((d) => (
              <div key={d.date} className={styles.row}>
                <span className={styles.rowMain}><span className={styles.rowTitle}>{fmt(d.date, { weekday: "long", month: "short", day: "numeric" })}</span><span className={styles.rowSub}>{d.answered} answered · {pct(d.correct, d.answered)}% correct</span></span>
              </div>
            ))}
          </div>
        ) : <div className={`${styles.card} ${styles.empty}`}><p>Your study days show up here after your first round.</p></div>}
      </section>
      <UpdateFeed e={e} runs={state.runs.slice(0, 20)} onStudy={onStudy} />
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
function UpdateFeed({ e, runs, onStudy }: { e: Engine; runs: Run[]; onStudy: (items: QuestionDTO[], course: CourseCode | null) => void }) {
  const [open, setOpen] = useState(false);
  const earlier = runs.length - 1;
  return (
    <section className={styles.sec}>
      <div className={styles.secH}>
        <h2>Updates</h2>
        {earlier > 0 && <button className={styles.feedToggle} onClick={() => { haptic(); setOpen((v) => !v); }}>{open ? "Show less" : `${earlier} earlier`}</button>}
      </div>
      {runs.length ? (
        <div className={`${styles.feed} ${open ? styles.feedOpen : ""}`}>
          <UpdateNote e={e} run={runs[0]} onStudy={onStudy} />
          {!open && earlier > 0 && (
            <button className={styles.feedPeek} aria-label={`Show ${earlier} earlier updates`} onClick={() => { haptic(); setOpen(true); }}>
              <i /><i />
            </button>
          )}
          {open && runs.slice(1).map((r, i) => (
            <div key={r.date} className={styles.feedIn} style={{ animationDelay: `${i * 45}ms` }}><UpdateNote e={e} run={r} onStudy={onStudy} /></div>
          ))}
        </div>
      ) : <div className={`${styles.card} ${styles.empty}`}><p>New questions arrive Tuesday, Thursday, and Saturday mornings.</p></div>}
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

function TopicBubbles({ bubbles, onStudy }: { bubbles: Bubble[]; onStudy: (items: QuestionDTO[], course: CourseCode | null) => void }) {
  return (
    <div className={styles.bubbles}>
      {bubbles.map((b) => (
        <button key={`${b.course}|${b.label}`} className={`${styles.bubble} ${b.left === 0 ? styles.bubbleDone : ""}`}
          style={{ "--c": COURSES[b.course].color } as React.CSSProperties} onClick={() => onStudy(b.qs, b.course)}>
          {b.left === 0 ? <Check size={12} strokeWidth={3} /> : <i />}
          <span>{b.label}</span>
          <small>{b.n}</small>
        </button>
      ))}
    </div>
  );
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
        <span>{left === 0 ? "All studied" : left === run.added ? "Tap a topic to start" : `${left} left to study`}</span>
      </button>
      <TopicBubbles bubbles={bubbles} onStudy={onStudy} />
    </div>
  );
}

function ExamPicker({ e, onStart }: { e: Engine; onStart: (f: Filter, n: number) => void }) {
  const [f, setF] = useState<Filter>("pr");
  const [n, setN] = useState(20);
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
      {lengths.length > 1 && (
        <div className={styles.seg} role="group" aria-label="Exam length">
          {lengths.map((k) => (
            <button key={k} aria-pressed={size === k} className={size === k ? styles.segOn : ""} onClick={() => { haptic(); setN(k); }}>
              {k === available ? `All ${k}` : k}
            </button>
          ))}
        </div>
      )}
      <Button className={`${styles.big} ${styles.cta}`} disabled={!size} onClick={() => onStart(f, size)}>
        {size ? `Start ${size}-question exam` : "No questions yet"}
      </Button>
    </div>
  );
}

function BottomSheet({ title, eyebrow, onClose, children }: { title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode }) {
  const [closing, setClosing] = useState(false);
  const close = () => { setClosing(true); setTimeout(onClose, 300); };
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") close(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  return (
    <div className={`${styles.scrim} ${closing ? styles.scrimOut : ""}`} onClick={close}>
      <div className={`${styles.bsheet} ${closing ? styles.bsheetOut : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={(ev) => ev.stopPropagation()}>
        <div className={styles.grab} />
        <div className={styles.bsheetHead}>
          <div>{eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}<h2>{title}</h2></div>
          <button className={styles.x} onClick={close} aria-label="Close"><X size={15} strokeWidth={2.4} /></button>
        </div>
        <div className={styles.bsheetBody}>{children}</div>
      </div>
    </div>
  );
}
