import { ChevronRight, X } from "lucide-react";
import type { OutputType as QuestionState } from "../endpoints/state_GET.schema";
import { COURSES, EXAMS, FINALS, type CourseCode, type Syllabus, type studyEngine } from "../helpers/studyEngine";
import { dateKey } from "../helpers/dateKey";
import { weakUnits, weakestRules, type studyNumbers } from "../helpers/studySession";
import { useBackClose } from "../helpers/useBackClose";
import { useModalFocus } from "../helpers/useModalFocus";
import { STATUS_COLOR } from "../pages/StudyParts";
import styles from "../pages/_index.module.css";
import layout from "./QuizSession.module.css";
import { BottomSheet } from "./BottomSheet";
import { Rulebook } from "./Rulebook";
import { hasTool } from "./ToolHost";

type Engine = ReturnType<typeof studyEngine>;
export function WeakSpots({ e, course, syllabus, onTopic }: { e: Engine; course: CourseCode; syllabus: Syllabus; onTopic: (topic: string) => void }) {
  const units = weakUnits(e, course, syllabus);
  return units.length ? <section className={styles.sec}><div className={styles.secH}><h2>Weak spots</h2></div><div className={styles.topicChips}>{units.map((u) => <button key={u.topic} onClick={() => onTopic(u.topics[0] ?? u.topic)}>{u.topic}</button>)}</div></section> : null;
}

export function CourseSheet({ course, e, syllabus, numbers, onClose, onTopic, onStudy, onEssay, onExam, onTool }: {
  course: CourseCode; e: Engine; syllabus: Syllabus; numbers: ReturnType<typeof studyNumbers>; onClose: () => void; onTopic: (topic: string) => void;
  onStudy: (mode: "due" | "new") => void; onEssay: (full: boolean) => void; onExam: () => void; onTool: (name: string) => void;
}) {
  const exam = EXAMS[course], days = dateKey.diff(e.today, FINALS[course]), units = e.coverage(course, syllabus[course]);
  const row = (label: string, value: string, onClick: () => void, disabled = false) => <button key={label} className={styles.row} disabled={disabled} onClick={onClick}><span className={styles.rowMain}><span className={styles.rowTitle}>{label}</span></span><span className={styles.rowEnd}>{value}</span><ChevronRight size={18} className={styles.chev} /></button>;
  return <BottomSheet title={COURSES[course].name} onClose={onClose}>
    <div className={styles.topicChips}><span>{new Date(`${FINALS[course]}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><span>{days < 0 ? "Finished" : days === 0 ? "Today" : `${days} ${days === 1 ? "day" : "days"} left`}</span>{exam.labels.map((l) => <span key={l}>{l}</span>)}</div>
    <section className={styles.sec}><div className={styles.secH}><h2>Today</h2></div><div className={`${styles.card} ${styles.list}`}>
      {exam.format === "essay" ? <>
        {hasTool("IssueSpot") && row("Spot the issues", "3 min", () => onTool("IssueSpot"))}
        {row("Write an essay", days >= 0 && days <= 7 ? "45 min" : "15 min", () => onEssay(days >= 0 && days <= 7))}
      </> : <>
        {row("Timed set", "25 questions", onExam)}
        {hasTool("MissedRules") && row("Rules you miss", "", () => onTool("MissedRules"))}
        {hasTool("CloseCalls") && row("Close calls", "", () => onTool("CloseCalls"))}
      </>}
      {row(`Review ${numbers.review}`, "", () => onStudy("due"), !numbers.review)}
      {row(`${numbers.fresh} new`, "", () => onStudy("new"), !numbers.fresh)}
    </div></section>
    <WeakSpots e={e} course={course} syllabus={syllabus} onTopic={onTopic} />
    <section className={styles.sec}><div className={styles.secH}><h2>Coverage</h2></div><div className={styles.segBar} aria-label="Unit coverage">{units.map((u) => <i key={u.topic} title={`${u.topic} · ${u.status}`} style={{ background: STATUS_COLOR[u.status], flex: 1 }} />)}</div></section>
  </BottomSheet>;
}

export function CourseRulebook({ course, topic, state, e, warmup, recall, onClose }: { course: CourseCode; topic?: string; state?: QuestionState; e: Engine; warmup?: boolean; recall?: boolean; onClose: () => void }) {
  const ref = useModalFocus<HTMLDivElement>();
  useBackClose(onClose);
  const filtered = warmup && state ? { ...state, questions: weakestRules(e, course) } : state;
  return <div ref={ref} tabIndex={-1} className={layout.modal} role="dialog" aria-modal="true" aria-label={warmup ? "Warm up" : "Rulebook"}>
    <div className={layout.top}><div className={layout.topIn}><span /><span className={layout.examTitle}>{warmup ? "Warm up · 10 min" : "Rulebook"}</span><button className={layout.x} onClick={onClose} aria-label="Close"><X size={16} strokeWidth={2.4} /></button></div></div>
    <Rulebook key={`${course}:${recall}:${topic ?? ""}`} course={course} topic={topic} state={filtered} initialMode={recall ? "recall" : "read"} readOnly={warmup} />
  </div>;
}
