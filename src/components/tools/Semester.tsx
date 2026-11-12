import { useSemester } from '../../helpers/useSemester';
import { ToolFrame, type ToolProps } from '../ExamTools';
import type { SemesterCourse } from '../../helpers/semester';
import styles from '../ExamTools.module.css';
import fields from './Semester.module.css';
export default function Semester({onClose}:ToolProps){
 const setting=useSemester(), semester=setting.value;
 const change=(code:string,patch:Partial<SemesterCourse>)=>setting.save({...semester,courses:semester.courses.map(c=>c.code===code?{...c,...patch}:c)});
 return <ToolFrame title="Semester" onClose={onClose}><div className={fields.grid}>
 <section className={styles.card}><label className={fields.field}>Semester<input aria-label="Semester name" value={semester.name} onChange={e=>setting.save({...semester,name:e.target.value})}/></label></section>
 {semester.courses.map(c=><section key={c.code} className={styles.card}><h2>{c.name}</h2>
 <label className={fields.field}>Name<input aria-label={`${c.code} course name`} value={c.name} onChange={e=>change(c.code,{name:e.target.value})}/></label>
 <label className={fields.field}>Short name<input aria-label={`${c.code} short name`} value={c.short} onChange={e=>change(c.code,{short:e.target.value})}/></label>
 {c.kind==='exam' && <><label className={fields.field}>Exam date<input type="date" aria-label={`${c.short} exam date`} value={c.final??''} onChange={e=>change(c.code,{final:e.target.value})}/></label>
 <label className={fields.field}>Format<select aria-label={`${c.short} exam format`} value={c.format} onChange={e=>change(c.code,{format:e.target.value as SemesterCourse['format']})}><option value="essay">Essay</option><option value="mc">Multiple choice</option></select></label>
 <label className={fields.field}>Notes<select aria-label={`${c.short} exam notes`} value={c.notes} onChange={e=>change(c.code,{notes:e.target.value as SemesterCourse['notes']})}><option value="closed">Closed book</option><option value="open">Open book</option><option value="printed">Printed notes</option></select></label></>}
 </section>)}</div></ToolFrame>;
}
