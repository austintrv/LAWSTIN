import { CalendarDays, Check, ChevronRight, Flame, GraduationCap, Layers3, PenLine, RotateCcw, Shuffle, Sparkles, Star, Timer } from "lucide-react";
import React from "react";
import { WeakSpots } from "../components/CourseSheet";
import { hasTool } from "../components/ToolHost";
import { Button } from "../components/Button";
import { dueLabel } from "../components/TaskList";
import type { QuestionDTO } from "../endpoints/state_GET.schema";
import { dateKey } from "../helpers/dateKey";
import { haptic } from "../helpers/haptics";
import { COURSES, COURSE_KEYS, FINALS, activeCourses, type Syllabus, type CourseCode, type Filter, type StudyMode } from "../helpers/studyEngine";
import { SCHOOL_COURSES } from "../helpers/studyMaterials";
import { examMoment, readyCards, unitStatuses, type ExamMoment, type PlanCourse, type studyNumbers } from "../helpers/studySession";
import { dueSoon, useCourseTasks } from "../helpers/useCourseTasks";
import { useLawstinData } from "../helpers/useLawstinData";
import styles from "./_index.module.css";

import { Num, pct, type Engine, type MissedTopic } from "./StudyParts";
import { UpdateCard } from "./UpdateCards";

/** Days to each final, soonest first, with the day's target and how well that course's questions are going. */
function FinalsCard({ e, courseNumbers, onCourse }: { e: Engine; courseNumbers: (c: CourseCode) => ReturnType<typeof studyNumbers>; onCourse: (c: CourseCode) => void }) {
  const list = COURSE_KEYS.map((k) => ({ k, date: FINALS[k], days: dateKey.diff(e.today, FINALS[k]) })).filter((f) => f.days >= 0).sort((a, b) => a.days - b.days);
  if (!list.length) return null;
  return (
    <section className={`${styles.sec} ${styles.finals}`}>
      <div className={styles.secH}><h2>Finals</h2></div>
      <div className={styles.finalTiles}>
        {list.map(({ k, date, days }) => {
          const c = COURSES[k], s = e.courseStats(k), numbers = courseNumbers(k), today = numbers.left;
          return (
            <button key={k} className={`${styles.card} ${styles.finalTile}`} style={{ "--course-color": c.color } as React.CSSProperties} onClick={() => onCourse(k)}>
              <span className={styles.finalCourse}><i />{c.short}</span>
              <b data-today={days === 0}>{days === 0 ? "Today" : days}</b>
              <span className={styles.finalWhen}>{days === 0 ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" }) : `${days === 1 ? "day" : "days"} · ${new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}</span>
              <span className={styles.meter}><i style={{ width: `${pct(s.seen, s.n)}%`, background: c.color }} /></span>
              <span className={styles.finalStats}>{examMoment(e.today).kind !== "normal" ? `${pct(s.seen, s.n)}% seen` : today ? `${today} to go` : "Done today"}{s.seen > 0 && <span className={styles.finalFull}> · {s.acc}% correct</span>}</span>
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

export function StudyView({ e, state, syllabus, moment, passNumbers, essaysWritten, onStreak, onLastPass, onRulebook, onTopic, onTool, numbers, courseNumbers, cards, plan, filter, setFilter, celebrate, resuming, nextReview, onHow, onMode, onLesson, onStart, onCourse, onEssay, onStarred, onExam, onWrite, onMatch, onUpdate }: {
  syllabus: Syllabus; moment: ExamMoment; passNumbers: { goal: number; answered: number; resuming: boolean }; essaysWritten: number;
  onStreak: () => void; onLastPass: () => void; onRulebook: (course: CourseCode, warmup?: boolean, recall?: boolean) => void;
  onTopic: (course: CourseCode, topic: string) => void; onTool: (name: string, course: CourseCode) => void;
  resuming: boolean;
  nextReview: string | null;
  onHow: () => void;
  onMode: (mode: StudyMode) => void;
  onLesson: (topics: MissedTopic[]) => void;
  numbers: ReturnType<typeof studyNumbers>;
  courseNumbers: (c: CourseCode) => ReturnType<typeof studyNumbers>;
  /** Recall cards ready now for the chosen filter. */
  cards: ReturnType<typeof readyCards>;
  /** Saved course quotas and essay prompts for today. */
  plan: PlanCourse[];
  onEssay: (c: CourseCode) => void;
  e: Engine; state: NonNullable<ReturnType<typeof useLawstinData>["query"]["data"]>; filter: Filter; setFilter: (f: Filter) => void; celebrate: boolean;
  onStart: () => void; onCourse: (c: CourseCode) => void; onStarred: () => void; onExam: (size?: number) => void; onWrite: () => void; onMatch?: () => void; onUpdate: (items: QuestionDTO[], course: CourseCode | null) => void;
}) {
  const qs = e.queues(filter);
  const { answered: today, goal, ready, left, minutes: mins, review, fresh } = numbers;
  const missed = e.missedTopics().filter((t) => activeCourses(e.today, filter).includes(t.course));
  const essays = plan.filter((c) => c.essay && (filter === "all" || filter === c.course));
  const roundLabel = resuming ? "Resume studying" : !ready ? "All caught up" : today > 0 ? "Keep going" : "Start studying";
  const run = state.runs[0];
  const goalPct = goal ? Math.min(1, today / goal) : 0;
  const goalDone = today >= goal;
  const circ = 2 * Math.PI * 16;
  const streak = e.streak();
  const studiedToday = today > 0;
  const showFinals = COURSE_KEYS.some((c) => FINALS[c] >= e.today);
  const special = moment.kind === "done" || (moment.course && (filter === "all" || filter === moment.course)) ? moment.kind : "normal";
  const course = moment.course;
  const specialRow = (label: string, go: () => void, length = "") => <button key={label} className={styles.row} onClick={go}><span className={styles.rowMain}><span className={styles.rowTitle}>{label}</span></span>{length && <span className={styles.rowEnd}>{length}</span>}<ChevronRight size={18} className={styles.chev} /></button>;
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
        {special === "normal" ? <>
        <div className={styles.todayRow}>
          <button className={styles.todayBtn} onClick={onHow} aria-label="How today’s plan is built">
            <span role="progressbar" aria-label="Today’s goal" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(today, goal)} className={`${styles.goalWrap} ${celebrate ? styles.goalBurst : ""}`}>
              <svg viewBox="0 0 40 40" className={styles.goalRing} aria-hidden="true">
                <circle cx="20" cy="20" r="16" className={styles.goalTrack} />
                <circle cx="20" cy="20" r="16" className={styles.goalVal} style={{ strokeDasharray: circ, strokeDashoffset: circ * (1 - goalPct), opacity: today ? 1 : 0 }} />
              </svg>
              {goalDone ? <Check size={26} strokeWidth={3.2} className={styles.goalCheck} /> : <b className={styles.ringNum}><Num v={today} /></b>}
            </span>
            <span className={styles.todayText}>
              <span className={styles.todayHead}>{!ready ? "Nothing ready today" : goalDone ? "Done for today" : left ? `${left} to go today` : "Nothing ready today"}</span>
              {!goalDone && left > 0 && <span className={styles.rowSub}>About {mins} min</span>}
            </span>
            <ChevronRight size={18} className={styles.chev} />
          </button>
          <button onClick={onStreak} className={`${styles.streakChip} ${streak && studiedToday ? styles.streakLit : ""}`} aria-label={`${streak} day streak`}>
            <Flame size={18} className={styles.flame} fill={streak && studiedToday ? "currentColor" : "none"} strokeWidth={2} />
            <b>{streak}</b>
          </button>
        </div>
        <Button className={`${styles.big} ${styles.cta} ${!ready && !resuming ? styles.caughtUp : ""}`} disabled={!ready && !resuming} onClick={onStart}>
          {!ready && !resuming && <Check size={18} />}{roundLabel}
        </Button>
        <div className={`${styles.list} ${styles.flat} ${styles.heroRows}`}>
          <button className={styles.row} disabled={!review} onClick={() => onMode("due")} aria-label={`Review ${review} due items`}>
            <span className={styles.dot} style={{ background: "var(--uh-red)" }}><RotateCcw size={12} color="#fff" strokeWidth={2.4} /></span>
            <span className={styles.rowMain}><span className={styles.rowTitle}>Ready to review</span></span>
            <span className={styles.rowEnd}><Num v={review} /></span>
            <ChevronRight size={18} className={styles.chev} />
          </button>
          <button className={styles.row} disabled={!fresh} onClick={() => onMode("new")} aria-label={`Study ${fresh} new items`}>
            <span className={styles.dot} style={{ background: "var(--info)" }}><Sparkles size={12} color="#fff" strokeWidth={2.4} /></span>
            <span className={styles.rowMain}><span className={styles.rowTitle}>Not seen yet</span></span>
            <span className={styles.rowEnd}><Num v={fresh} /></span>
            <ChevronRight size={18} className={styles.chev} />
          </button>
          <button className={styles.row} disabled={!missed.length} onClick={() => onLesson(missed)} aria-label={`Review ${missed.length} missed topics`}>
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
        </> : special === "done" ? <>
          <h2 className={styles.examHeroTitle}>Fall finals done</h2>
          <div className={styles.semesterStats}>
            <div><b>{state.days.filter((d) => d.date >= "2026-08-01" && d.date <= e.today).reduce((n, d) => n + d.answered, 0)}</b><span>Answers given</span></div>
            <div><b>{essaysWritten}</b><span>Essays written</span></div>
            <div><b>{unitStatuses(e, syllabus).filter((u) => u.status === "solid").length}</b><span>Units Solid</span></div>
          </div>
          <Button variant="secondary" className={styles.big} onClick={onStart}>Keep practicing</Button>
          {specialRow("How Lawstin works", onHow)}
        </> : course && <>
          <button className={styles.examHeroTitle} onClick={() => onCourse(course)}>{COURSES[course].name} {special === "eve" ? "tomorrow" : "today"}</button>
          {special === "morning" ? <Button variant="secondary" className={styles.big} onClick={() => onRulebook(course, true)}>Warm up · 10 min</Button> : <>
            <Button className={`${styles.big} ${styles.cta}`} onClick={onLastPass} disabled={!passNumbers.goal || (passNumbers.answered >= passNumbers.goal && !passNumbers.resuming)}>Last pass</Button>
            <button className={styles.lastPassCount} onClick={onHow}>{passNumbers.answered} of {passNumbers.goal}</button>
            <WeakSpots e={e} course={course} syllabus={syllabus} onTopic={(topic) => onTopic(course, topic)} />
            <div className={`${styles.list} ${styles.flat} ${styles.heroRows}`}>
              {specialRow("Rulebook", () => onRulebook(course))}
              {course === "pr" ? <>{specialRow("Timed set", () => onExam(25), "25 questions")}{specialRow("Rule recall", () => onRulebook(course, false, true))}</> : <>
                {hasTool("IssueSpot") && specialRow("Spot the issues", () => onTool("IssueSpot", course), "3 min")}
                {specialRow("Write an essay", () => onEssay(course), "45 min")}
              </>}
            </div>
          </>}
        </>}
      </div>

      </div>
          {special !== "done" && <div className={styles.o3}><DueSoonCard /></div>}
        </div>
        <div className={styles.studyCol}>
          <div className={styles.o2}><FinalsCard e={e} courseNumbers={courseNumbers} onCourse={onCourse} /></div>
          {special === "done" && <div className={styles.o3}><DueSoonCard /></div>}
          <div className={styles.o5}>
              <section className={styles.sec}>
                <div className={`${styles.card} ${styles.list}`}>
                  <button className={styles.row} onClick={() => onExam()}>
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
                  {activeCourses(e.today, filter).map((k) => {
                    const c = COURSES[k], s = e.courseStats(k), n = courseNumbers(k);
                    return (
                      <button key={k} className={styles.row} onClick={() => onCourse(k)}>
                        <span className={styles.dot} style={{ background: c.color }}>{c.short[0]}</span>
                        <span className={styles.rowMain}>
                          <span className={styles.rowTitle}>{c.name}</span>
                          <span className={styles.rowSub}>{n.fresh} new · {n.review} due{s.seen ? ` · ${s.acc}% correct` : ""}</span>
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

