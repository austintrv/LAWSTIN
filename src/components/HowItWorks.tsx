import { COURSES, STATUS_LABEL, type CoverageStatus } from "../helpers/studyEngine";
import { type PlanCourse } from "../helpers/studySession";
import styles from "../pages/_index.module.css";

import { STATUS_COLOR } from "../pages/StudyParts";

/** The reasoning behind the numbers, from the same rules the code uses (finalsPlan, reviewSchedule, examDue, coverage). */
export function HowItWorks({ plan, planOn, goal }: { plan: PlanCourse[]; planOn: boolean; goal: number }) {
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

