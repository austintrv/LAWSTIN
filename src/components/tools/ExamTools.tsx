import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useModalFocus } from "../../helpers/useModalFocus";
import { useBackClose } from "../../helpers/useBackClose";
import { useLawstinData } from "../../helpers/useLawstinData";
import { dateKey } from "../../helpers/dateKey";
import { studyEngine, type CourseCode } from "../../helpers/studyEngine";
import { ANSWER_LABEL } from "../../helpers/missedRules";
import { QuizSession } from "../QuizSession";
import type { QuestionDTO } from "../../endpoints/state_GET.schema";
import type { ExamEntry } from "../../helpers/useExams";
import quiz from "../QuizSession.module.css";
import styles from "./ExamTools.module.css";

export type ToolProps = { course?: CourseCode; arg?: string; onClose: () => void };
export function ToolFrame({ title, onClose, onBack, children }: { title: string; onClose: () => void; onBack?: () => void; children: ReactNode }) {
  const ref = useModalFocus<HTMLDivElement>();
  useBackClose(() => { if (onBack) { onBack(); return false; } onClose(); });
  return <div ref={ref} tabIndex={-1} className={quiz.modal} role="dialog" aria-modal="true" aria-label={title}>
    <div className={quiz.top}><div className={`${quiz.topIn} ${quiz.examTop}`}>
      <div>{onBack && <button className={quiz.x} aria-label="Back" onClick={onBack}><ChevronLeft size={18} /></button>}</div>
      <h1 className={quiz.examTitle}>{title}</h1>
      <button className={quiz.x} aria-label="Close" onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
    </div></div>
    <div className={quiz.scroll}><div className={styles.page}>{children}</div></div>
  </div>;
}
export function ScoreRing({ score, total }: { score: number; total: number }) {
  const circumference = 2 * Math.PI * 28;
  return <span className={styles.ring} role="img" aria-label={`${score} of ${total} correct`}><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" /><circle cx="32" cy="32" r="28" style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - score / Math.max(1, total)) }} /></svg><b>{score}/{total}</b></span>;
}
export function ScoreTrend({ list, onOpen }: { list: ExamEntry[]; onOpen: (e: ExamEntry) => void }) {
  return <div className={`${styles.card} ${styles.trend}`} role="group" aria-label="Score trend">{list.slice(0, 5).reverse().map(e => <button key={e.at} aria-label={`${new Date(e.at).toLocaleDateString()}, ${e.score} of ${e.total}`} onClick={() => onOpen(e)}>
    <i style={{ marginBottom: `${Math.round(e.score / e.total * 48)}px` }} /><span>{e.score}/{e.total}</span>
  </button>)}</div>;
}
export function QuestionReview({ q, pick }: { q: QuestionDTO; pick?: string }) {
  const chosen = q.choices.find(c => c.id === pick), right = q.choices.find(c => c.id === q.answer)!;
  return <details className={styles.review}><summary><span className={styles.main}><span className={styles.title}>{q.subtopic ?? q.topic}</span><span>{q.prompt}</span></span><ChevronRight size={18} /></summary>
    <div className={styles.detail}>
      <p className={styles.reading}>{q.stem}</p>
      {chosen ? <div className={styles.stack}><span className={`${styles.chip} ${chosen.id === q.answer ? styles.correct : styles.wrong}`}>Your answer · {ANSWER_LABEL[chosen.role]}</span><p className={styles.reading}>{chosen.text}</p><p className={styles.reading}>{chosen.why}</p></div> : <span className={styles.chip}>Unanswered</span>}
      {chosen?.id !== right.id && <div className={styles.stack}><span className={`${styles.chip} ${styles.correct}`}>Correct answer</span><p className={styles.reading}>{right.text}</p><p className={styles.reading}>{right.why}</p></div>}
      {q.rule && <p className={styles.reading}>{q.rule}</p>}
      {q.authority && <span className={styles.muted}>{q.authority}</span>}
    </div>
  </details>;
}
export function PracticeSet({ questions, onClose }: { questions: QuestionDTO[]; onClose: () => void }) {
  const { query, answer, queueAnswer, mark } = useLawstinData();
  const e = studyEngine(query.data);
  const [round, setRound] = useState({ questions, key: 0 });
  return <QuizSession key={round.key} items={round.questions.map(q => ({ q, review: true }))} mode="practice" getProgress={e.prog} onCard={() => {}}
    onAnswer={async (q, choice) => {
      const input = { questionId: q.id, choice: choice as "A" | "B" | "C" | "D", localDate: dateKey.today() };
      if (!navigator.onLine) { queueAnswer(input, choice === q.answer); return choice === q.answer; }
      try { return (await answer.mutateAsync(input)).correct; }
      catch (err) { const { isNetworkError } = await import("../../helpers/offlineCache"); if (!isNetworkError(err)) throw err; queueAnswer(input, choice === q.answer); return choice === q.answer; }
    }} onStar={(q, starred) => mark.mutate({ questionId: q.id, action: "star", starred })}
    onGuess={q => mark.mutate({ questionId: q.id, action: "guess", localDate: dateKey.today() })}
    onFlag={(q, note) => mark.mutate({ questionId: q.id, action: "flag", note })}
    onAnother={onClose} onRetry={items => setRound(r => ({ questions: items.flatMap(it => it.q ? [it.q] : []), key: r.key + 1 }))} onClose={onClose} />;
}
