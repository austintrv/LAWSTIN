import { CalendarDays, Check, ChevronRight, Flame, GraduationCap, Layers3, PenLine, RotateCcw, Shuffle, Sparkles, Star, Timer } from "lucide-react";
import React from "react";
import { Button } from "../components/Button";
import { dueLabel } from "../components/TaskList";
import type { QuestionDTO } from "../endpoints/state_GET.schema";
import { haptic } from "../helpers/haptics";
import { COURSES, COURSE_KEYS, type CourseCode, type Filter, type StudyMode } from "../helpers/studyEngine";
import { SCHOOL_COURSES } from "../helpers/studyMaterials";
import { readyCards, type PlanCourse } from "../helpers/studySession";
import { dueSoon, useCourseTasks } from "../helpers/useCourseTasks";
import { useLawstinData } from "../helpers/useLawstinData";
import styles from "./_index.module.css";

import { Num, pct, upcomingFinals, type Engine, type MissedTopic } from "./StudyParts";
import { UpdateCard } from "./UpdateCards";

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

export function StudyView({ e, state, goal, cards, plan, filter, setFilter, celebrate, resuming, nextReview, onHow, onMode, onLesson, onStart, onCourse, onEssay, onStarred, onExam, onWrite, onMatch, onUpdate }: {
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
  onStart: () => void; onCourse: (c: CourseCode) => void; onStarred: () => void; onExam: () => void; onWrite: () => void; onMatch?: () => void; onUpdate: (items: QuestionDTO[], course: CourseCode | null) => void;
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
                  <button className={styles.row} onClick={onMatch} disabled={!onMatch}>
                    <span className={styles.dot} style={{ background: "var(--success)" }}><Shuffle size={12} color="#fff" strokeWidth={2.4} /></span>
                    <span className={styles.rowMain}><span className={styles.rowTitle}>Match</span></span>
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

