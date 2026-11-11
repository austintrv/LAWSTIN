import { X } from "lucide-react";
import { STATUS_LABEL } from "../helpers/studyEngine";
import { type recapChanges } from "../helpers/studySession";
import { useBackClose } from "../helpers/useBackClose";
import { useModalFocus } from "../helpers/useModalFocus";
import styles from "../pages/_index.module.css";
import layout from "./QuizSession.module.css";
import { Button } from "./Button";

export function SessionRecap({ answered, right, changes, nextReview, onClose, onContinue }: {
  answered: number; right: number; changes: ReturnType<typeof recapChanges>; nextReview: string | null; onClose: () => void; onContinue: () => void;
}) {
  const ref = useModalFocus<HTMLDivElement>();
  useBackClose(onClose);
  return <div ref={ref} tabIndex={-1} className={layout.modal} role="dialog" aria-modal="true" aria-label="Session recap">
    <div className={layout.top}><div className={layout.topIn}><span /><span className={layout.examTitle}>Session recap</span><button className={layout.x} onClick={onClose} aria-label="Close"><X size={16} strokeWidth={2.4} /></button></div></div>
    <div className={styles.recapBody}><section className={styles.recapStats}><h2>Session complete</h2><div className={styles.semesterStats}><div><b>{answered}</b><span>Answered</span></div><div><b>{right}</b><span>Right</span></div></div></section>
      <div className={styles.recapDetails}>{changes.length > 0 && <section className={styles.sec}><div className={styles.secH}><h2>Units moved</h2></div><div className={styles.topicChips}>{changes.map((u) => <span key={`${u.course}|${u.topic}`}>{u.topic} · {STATUS_LABEL[u.from]} → {STATUS_LABEL[u.status]}</span>)}</div></section>}
        <div className={`${styles.card} ${styles.row}`}><span className={styles.rowTitle}>Next review</span><span className={styles.rowEnd}>{nextReview ? new Date(`${nextReview}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "All caught up"}</span></div>
        <Button className={`${styles.big} ${styles.cta}`} onClick={onClose}>Done</Button><Button className={styles.big} variant="secondary" onClick={onContinue}>Keep going</Button>
      </div></div>
  </div>;
}
