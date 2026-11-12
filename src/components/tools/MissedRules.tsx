import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useLawstinData } from "../../helpers/useLawstinData";
import { ANSWER_LABEL, missedRules, queuedRuleAnswers, useRuleAnswers } from "../../helpers/missedRules";
import { examDate } from "../../helpers/useExams";
import { COURSES } from "../../helpers/studyEngine";
import type { QuestionDTO } from "../../endpoints/state_GET.schema";
import { Button } from "../Button";
import { PracticeSet, ToolFrame, type ToolProps } from "../ExamTools";
import styles from "../ExamTools.module.css";
import quiz from "../QuizSession.module.css";

export default function MissedRules({ course, onClose }: ToolProps) {
  const { query } = useLawstinData();
  const state = query.data, history = useRuleAnswers(state?.progress, !!state);
  const rows = missedRules(state?.questions ?? [], state?.progress ?? [], [...(history.data ?? []), ...queuedRuleAnswers(state?.questions ?? [])], course);
  const [practice, setPractice] = useState<QuestionDTO[] | null>(null);
  const groups = [...new Set(rows.map(r => `${r.q.course}|${r.q.topic}`))];
  if (practice) return <PracticeSet questions={practice} onClose={() => setPractice(null)} />;
  return <ToolFrame title="Rules you miss" onClose={onClose}>
    <div className={styles.toolbar}>
      <div className={styles.chips}><span className={`${styles.chip} ${styles.red}`}>{rows.length} {rows.length === 1 ? "rule" : "rules"}</span></div>
      {rows.length > 0 && <div className={styles.buttons}><Button className={quiz.cta} onClick={() => setPractice(rows.map(r => r.q))}>Drill these</Button></div>}
      {!rows.length && <div className={`${styles.card} ${styles.empty}`}><h2>{history.isFetching ? "Loading rules…" : "All clean"}</h2></div>}
      {history.isError && <Button variant="secondary" onClick={() => void history.refetch()}>Try again</Button>}
    </div><div className={`${styles.sections} ${styles.ruleGroups}`}>{groups.map(key => {
      const group = rows.filter(r => `${r.q.course}|${r.q.topic}` === key);
      return <section key={key} className={styles.stack}><h2 className={styles.heading}>{COURSES[group[0].q.course].short} · {group[0].q.topic}</h2><div className={styles.card}>{group.map(r => <details key={r.q.id} className={styles.review}><summary><span className={styles.main}><span className={styles.reading}>{r.q.rule!.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? r.q.rule}</span><span className={styles.chips}><span className={styles.chip}>{r.misses} missed</span>{r.lastMissed && <span className={styles.chip}>{examDate(r.lastMissed)}</span>}{r.role && <span className={`${styles.chip} ${styles.red}`}>{ANSWER_LABEL[r.role]}</span>}</span><span className={styles.muted}>{r.q.authority}</span></span><ChevronRight size={18} /></summary><div className={styles.detail}><p className={styles.reading}>{r.q.rule}</p></div></details>)}</div></section>;
    })}</div>
  </ToolFrame>;
}
