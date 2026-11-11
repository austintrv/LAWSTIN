import { COURSES, STATUS_LABEL, type CoverageStatus } from "../helpers/studyEngine";
import { type PlanCourse } from "../helpers/studySession";
import styles from "../pages/_index.module.css";

import { STATUS_COLOR } from "../pages/StudyParts";

/** The reasoning behind the numbers, from the same rules the code uses (finalsPlan, reviewSchedule, examDue, coverage). */
export function HowItWorks({ plan, planOn, goal }: { plan: PlanCourse[]; planOn: boolean; goal: number }) {
  const chips: [CoverageStatus, string][] = [
    ["unseen", "You haven’t answered any of its questions yet."],
    ["shaky", "Under 70% right after at least 2 answers, an essay below 7, or fewer than half the issues spotted on it."],
    ["learning", "Some questions unseen, or under 85% right."],
    ["solid", "Every question seen and 85% right or better."],
    ["none", "No questions written for it yet."],
  ];
  const steps = ["Miss · 1 day", "First right · 3 days", "7 days", "16 days", "35 days"];
  return (
    <div className={styles.how}>
      <section className={styles.sec}>
        <div className={styles.secH}><h2>Today</h2></div>
        <div className={`${styles.card} ${styles.list}`}>
          {plan.map((c) => (
            <div key={c.course} className={styles.row}>
              <span className={styles.dot} style={{ background: COURSES[c.course].color }}>{COURSES[c.course].short[0]}</span>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{COURSES[c.course].short}</span>
                <span className={styles.rowSub}>{c.days < 0 ? "Daily target" : c.days === 0 ? "Final today" : `${c.days} ${c.days === 1 ? "day" : "days"} to the final`}</span>
              </span>
              <span className={styles.rowEnd}><b>{c.target}</b></span>
            </div>
          ))}
            <div className={styles.row}>
              <span className={styles.rowMain}><span className={styles.rowTitle}>Today’s goal</span></span>
              <span className={styles.rowEnd}><b>{goal}</b></span>
            </div>
        </div>
        <div className={`${styles.card} ${styles.list}`}>
          {(planOn ? [
            ["Goal", "Still to do + done today"],
            ["Range", "5 to 40 a day"],
            ["Reviews", "Up to 10 per course; the rest roll forward"],
            ["Unseen material", "Spread out to finish 2 days before each final"],
            ["Course targets", "Add up to today’s goal"],
            ["Saved for today", "Answers move from to do to done"],
          ] : [["Daily goal", "Fixed for today, from 5 to 40"], ["Course targets", "Add up to today’s goal"]]).map(([label, value]) => (
            <div className={styles.row} key={label}><span className={styles.rowMain}><span className={styles.rowTitle}>{label}</span><span className={`${styles.rowSub} ${styles.wrapSub}`}>{value}</span></span></div>
          ))}
        </div>
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
          <div className={styles.row}><span className={styles.rowMain}><span className={styles.rowTitle}>Before a final</span><span className={`${styles.rowSub} ${styles.wrapSub}`}>Reviews scheduled past it return in the last 5 days, unless already reviewed then.</span></span></div>
        </div>
      </section>

      <section className={styles.sec}>
        <div className={styles.secH}><h2>What the labels mean</h2></div>
        <div className={`${styles.card} ${styles.list}`}>
          {[
            ["Ready to review", "Questions + recall cards due today or earlier"],
            ["To go today", "Remaining target, up to what is ready"],
            ["Spot the issues", "2 answers, scored by the issues caught"],
            ["Written practice", "5 answers at 15 minutes; 10 at 45, scored by the grade"],
            ["Weak topics", "A low essay or issue result lasts 2 weeks, until a stronger attempt"],
            ["Streak", "Consecutive days with a question, card, drill or essay"],
          ].map(([label, line]) => <div className={styles.row} key={label}><span className={styles.rowMain}><span className={styles.rowTitle}>{label}</span><span className={`${styles.rowSub} ${styles.wrapSub}`}>{line}</span></span></div>)}
          {chips.map(([k, line]) => (
            <div key={k} className={styles.row}>
              <span className={`${styles.status} ${styles.howChip} ${k === "none" ? styles.statusNone : ""}`} style={{ color: STATUS_COLOR[k], background: `color-mix(in srgb, ${STATUS_COLOR[k]} 13%, transparent)` }}>{STATUS_LABEL[k]}</span>
              <span className={styles.rowMain}><span className={`${styles.rowSub} ${styles.wrapSub}`}>{line}</span></span>
            </div>
          ))}
          <div className={styles.row}>
            <span className={`${styles.status} ${styles.howChip}`} style={{ color: "var(--warning)", background: "color-mix(in srgb, var(--warning) 13%, transparent)" }}>Missed</span>
            <span className={styles.rowMain}><span className={`${styles.rowSub} ${styles.wrapSub}`}>Latest answer wrong or guessed. A confident right answer or a passed lesson check clears it.</span></span>
          </div>
        </div>
      </section>
    </div>
  );
}

