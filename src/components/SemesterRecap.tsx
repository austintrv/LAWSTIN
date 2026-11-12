import type { SemesterRecap as Recap } from '../helpers/semesterRecap';
import { SCHOOL_COURSES, type SchoolCourse } from '../helpers/studyMaterials';
import { BottomSheet } from './BottomSheet';
import styles from '../pages/_index.module.css';
export function SemesterRecap({value,onClose}:{value:Recap;onClose:()=>void}){
 return <BottomSheet title={`${value.name} recap`} onClose={onClose}><div className={styles.semesterStats}>{[[value.answers,'Answers'],[value.days,'Days studied'],[value.streak,'Longest streak'],[value.essays,'Essays'],[value.average===null?'—':`${value.average.toFixed(1)}/10`,'Average score']].map(([n,label])=><div key={label}><b>{n}</b><span>{label}</span></div>)}</div>
 <div className={styles.card}>{value.solid.map(c=><div className={styles.row} key={c.course}><span className={styles.rowMain}>{SCHOOL_COURSES[c.course as SchoolCourse].short}</span><span>{c.count} of {c.total} units Solid</span></div>)}</div>
 {!!value.rules.length && <section className={styles.sec}><div className={styles.secH}><h2>Most-missed rules</h2></div><div className={styles.card}>{value.rules.map(r=><button className={styles.row} key={r.id} onClick={()=>{onClose();window.location.hash=`#/q/${encodeURIComponent(r.id)}`;}}><span className={styles.rowMain}><span>{r.rule}</span><span className={styles.rowSub}>{r.authority}</span></span><span>{r.wrong}</span></button>)}</div></section>}</BottomSheet>;
}
