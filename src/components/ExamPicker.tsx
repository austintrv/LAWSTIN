import { useState } from "react";
import { haptic } from "../helpers/haptics";
import { EXAMS, EXAM_PACE, type CourseCode, type Filter } from "../helpers/studyEngine";
import styles from "../pages/_index.module.css";
import { Button } from "./Button";

import { type Engine } from "../pages/StudyParts";

/** Pro Res is tested by timed multiple choice; the essay courses by a timed essay. */
export function ExamPicker({ e, onStart, onEssay, initialSize = 20 }: { e: Engine; initialSize?: number; onStart: (f: Filter, n: number, timed: boolean) => void; onEssay: (c: CourseCode) => void }) {
  const [f, setF] = useState<Filter>("pr");
  const [n, setN] = useState(initialSize);
  const [timed, setTimed] = useState(true);
  const essay = f !== "all" && EXAMS[f].format === "essay";
  const available = e.queues(f).total;
  // Only offer lengths the bank can fill; the last option is always "every question" for this course.
  const lengths = [10, 20, 25, 30].filter((k) => k < available);
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

