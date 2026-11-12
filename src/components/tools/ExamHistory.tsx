import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useExams, examDate, examTime, type ExamEntry } from "../../helpers/useExams";
import { useLawstinData } from "../../helpers/useLawstinData";
import { COURSES } from "../../helpers/studyEngine";
import type { QuestionDTO } from "../../endpoints/state_GET.schema";
import { Button } from "../Button";
import { ToolFrame, ScoreRing, ScoreTrend, QuestionReview, PracticeSet, type ToolProps } from "../ExamTools";
import styles from "../ExamTools.module.css";
import quiz from "../QuizSession.module.css";

export default function ExamHistory({ course, arg, onClose }: ToolProps) {
  const exams = useExams();
  const { query } = useLawstinData();
  const [selected, setSelected] = useState<string | null>(arg ?? null);
  const [practice, setPractice] = useState<QuestionDTO[] | null>(null);
  const list = exams.list.filter(e => !course || e.course === course);
  const entry = list.find(e => e.at === selected);
  const missed = entry ? entry.wrong.flatMap(id => { const q = query.data?.questions.find(q => q.id === id); return q ? [q] : []; }) : [];
  const label = (e: ExamEntry) => e.course === "all" ? "Mixed" : COURSES[e.course].short;
  if (practice) return <PracticeSet questions={practice} onClose={() => setPractice(null)} />;
  return <ToolFrame title="Practice exams" onClose={onClose} onBack={entry ? () => setSelected(null) : undefined}>
    {entry ? <div className={styles.columns}>
      <div className={styles.stack}><div className={`${styles.card} ${styles.hero}`}><ScoreRing score={entry.score} total={entry.total} /><div className={styles.chips}><span className={styles.chip}>{examDate(entry.at)}</span><span className={styles.chip}>{label(entry)}</span><span className={styles.chip}>{entry.timed ? "Timed" : "Untimed"}</span><span className={styles.chip}>{examTime(Math.round(entry.seconds / entry.total))} per question</span></div></div>
        <div className={styles.buttons}>{missed.length > 0 && <Button className={quiz.cta} onClick={() => setPractice(missed)}>Retake the missed</Button>}</div>
      </div>
      <div className={styles.stack}><div className={styles.card}><table className={styles.table}><thead><tr><th>Topic</th><th>Correct</th></tr></thead><tbody>{entry.byTopic.map(t => <tr key={t.topic}><td>{t.topic}</td><td>{t.right} of {t.total}</td></tr>)}</tbody></table></div>
        <div className={styles.card}>{missed.map(q => <QuestionReview key={q.id} q={q} pick={entry.picks?.[q.id]} />)}</div>
      </div>
    </div> : <div className={styles.columns}>
      <div className={styles.stack}>{list.length > 0 ? <><h2 className={styles.heading}>Score trend</h2><ScoreTrend list={list} onOpen={e => setSelected(e.at)} /></> : <div className={`${styles.card} ${styles.empty}`}><Button className={quiz.cta} onClick={() => { onClose(); window.location.hash = "#/study"; }}>Practice exam</Button></div>}
        {exams.error && <Button variant="secondary" onClick={() => void exams.retry()}>Try again</Button>}
      </div>
      {list.length > 0 && <div className={styles.card}>{list.map(e => <button key={e.at} className={styles.row} onClick={() => setSelected(e.at)}><ScoreRing score={e.score} total={e.total} /><span className={styles.main}><span className={styles.title}>{label(e)} · {examDate(e.at)}</span><span className={styles.muted}>{examTime(Math.round(e.seconds / e.total))} per question</span></span><ChevronRight size={18} /></button>)}</div>}
    </div>}
  </ToolFrame>;
}
