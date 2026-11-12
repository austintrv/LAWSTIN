import { ChevronRight } from "lucide-react";
import { COURSES, COURSE_KEYS, STATUS_LABEL, type CoverageStatus } from "../helpers/studyEngine";
import { type ExamMoment, type PlanCourse } from "../helpers/studySession";
import type { Engine } from "../pages/StudyParts";
import { STATUS_COLOR } from "../pages/StudyParts";
import styles from "../pages/_index.module.css";

type Props = { semesterName?: string; plan: PlanCourse[]; planOn: boolean; goal: number; moment: ExamMoment; e: Engine; numbers: { review: number; fresh: number }; statuses: CoverageStatus[]; onOpen: (kind: "due" | "new" | "missed" | "streak" | "progress") => void };
export function HowItWorks({ semesterName = "Fall 2026", plan, goal, moment, e, numbers, statuses, onOpen }: Props) {
  return <div className={styles.how}>
    <section className={styles.sec}><div className={styles.secH}><h2>{moment.kind === "normal" ? "Today’s goal" : moment.kind === "eve" ? "Last pass" : moment.kind === "morning" ? "Warm up" : `${semesterName.replace(/ 20\d\d$/, "")} finals done`}</h2></div>
      <div className={`${styles.card} ${styles.howCard}`}><b className="finish-number">{moment.kind === "normal" ? goal : moment.kind === "eve" ? "≤25" : moment.kind === "morning" ? "10 min" : "✓"}</b>
        <div className="finish-chips">{moment.kind === "normal" && COURSE_KEYS.map(k => <span key={k} className={styles.status} style={{color:COURSES[k].color,background:"var(--fill)"}}>{COURSES[k].short} · {plan.find(p => p.course === k)?.target ?? 0}</span>)}</div>
      </div>
      <div className={styles.topicChips}><span>5 to 40 a day</span><span>10 overdue reviews per course</span></div><div className={`${styles.card} ${styles.list}`}>{([
        ["due", "Ready to review", numbers.review], ["new", "Not seen yet", numbers.fresh], ["missed", "Missed topics", e.missedTopics().length], ["streak", "Streak", e.streak()],
      ] as const).map(([kind,label,n]) => (n > 0 || kind === "streak") && <button key={kind} className={styles.row} onClick={() => onOpen(kind)}><span className={styles.rowMain}>{label}</span><span>{n}</span><ChevronRight size={18}/></button>)}</div>
    </section>
    <section className={styles.sec}><div className={styles.secH}><h2>When a question comes back</h2></div><div className={`${styles.card} ${styles.howCard}`}><ol className={styles.ladder}>{["Miss · 1 day", "First right · 3 days", "7 days", "16 days", "35 days"].map((label,i) => <li key={label} className={styles.rung}><span className={styles.rungDot}>{i+1}</span><span className={styles.rungLabel}>{label}</span><b>{e.questions.filter(q => e.prog(q.id)?.box === i+1).length}</b></li>)}</ol><details><summary>Before a final</summary><span>Last 5 days</span></details></div></section>
    <section className={styles.sec}><div className={styles.secH}><h2>Units</h2></div><div className={`${styles.card} ${styles.howCard}`}>{(["none","unseen","shaky","learning","solid"] as CoverageStatus[]).map(k => <button key={k} className={styles.row} onClick={() => { onOpen("progress"); }}><span className={styles.status} style={{color:STATUS_COLOR[k]}}>{STATUS_LABEL[k]}</span><span>{statuses.filter(s => s === k).length}</span></button>)}</div></section>
  </div>;
}
