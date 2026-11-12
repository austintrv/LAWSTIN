import { useIsFetching } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSyncedSetting } from "../helpers/useSyncedSetting";
import { weekStart, weeklyDiff, type WeekSnapshot } from "../helpers/weeklyProgress";
import { useWritten } from "../helpers/useWritten";
import { unitStatuses, streakHistory } from "../helpers/studySession";
import { STATUS_LABEL, type Syllabus } from "../helpers/studyEngine";
import type { Engine } from "../pages/StudyParts";
import type { OutputType as State } from "../endpoints/state_GET.schema";
import styles from "../pages/_index.module.css";
export function WeeklyProgress({e,syllabus,state,missed,ready}:{e:Engine;syllabus:Syllabus;state?:State;missed:string[];ready:boolean}) {
  const fetching = useIsFetching({ queryKey: ["lawstin-syllabus"] });
  const week=weekStart(e.today), written=useWritten();
  const snapshot=useSyncedSetting<WeekSnapshot|null>(`snapshot:v1:${week}`,null,"lawstin-week-snapshot");
  const units=unitStatuses(e,syllabus);
  useEffect(()=>{if(ready && !fetching && snapshot.loaded && !snapshot.error && (!snapshot.value || snapshot.value.week!==week)) snapshot.save({week,units,missed});},[ready,fetching,snapshot.loaded,snapshot.error,snapshot.value?.week,week]);
  const diff=weeklyDiff(snapshot.value?.week===week ? snapshot.value : {week,units,missed},units,missed,written.list,e.today);
  const best=streakHistory((state?.days??[]).filter(d=>d.date>=week),e.today).best;
  return <section className={styles.sec}><div className={styles.secH}><h2>This week</h2></div><div className={`${styles.card} ${styles.howCard}`}>
    <div className={styles.topicChips}>{diff.moved.map(u=><button key={`${u.course}|${u.topic}`} onClick={()=>{window.location.hash=`#/tool/Topic/${u.course}/${encodeURIComponent(u.topic)}`;}}>{u.topic} · {STATUS_LABEL[u.from]} → {STATUS_LABEL[u.status]}</button>)}</div>
    <div className={styles.topicChips}><span>{diff.cleaned.length} rules cleaned</span><span>{diff.essays} essays</span>{diff.average!==null && <span>{diff.average.toFixed(1)}/10 average</span>}<span>{best} day best streak</span></div>
  </div></section>;
}
