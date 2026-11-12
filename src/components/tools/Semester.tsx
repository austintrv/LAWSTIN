import { useState } from "react";
import { readCache,writeCache } from "../../helpers/offlineCache";
import { useSemester } from '../../helpers/useSemester';
import { ToolFrame, type ToolProps } from '../ExamTools';
import type { SemesterCourse } from '../../helpers/semester';
import styles from '../ExamTools.module.css';
import fields from './Semester.module.css';
export default function Semester({onClose}:ToolProps){
 const setting=useSemester(), semester=setting.value;
 const change=(code:string,patch:Partial<SemesterCourse>)=>setting.save({...semester,courses:semester.courses.map(c=>c.code===code?{...c,...patch}:c)});
 if(!setting.loaded)return <ToolFrame title="Semester" onClose={onClose}><div aria-busy="true"/></ToolFrame>;
 return <ToolFrame title="Semester" onClose={onClose}><div className={fields.grid}>
 <section className={styles.card}><label className={fields.field}>Semester<NameInput label="Semester name" value={semester.name} onSave={name=>setting.save({...semester,name})}/></label></section>
 {semester.courses.map(c=><section key={c.code} className={styles.card}><h2>{c.name}</h2>
 <label className={fields.field}>Name<NameInput label={`${c.code} course name`} value={c.name} onSave={name=>change(c.code,{name})}/></label>
 <label className={fields.field}>Short name<NameInput label={`${c.code} short name`} value={c.short} onSave={short=>change(c.code,{short})}/></label>
 {c.kind==='exam' && <><label className={fields.field}>Exam date<input type="date" aria-label={`${c.short} exam date`} value={c.final??''} onChange={e=>change(c.code,{final:e.target.value})}/></label>
 <label className={fields.field}>Format<select aria-label={`${c.short} exam format`} value={c.format} onChange={e=>change(c.code,{format:e.target.value as SemesterCourse['format']})}><option value="essay">Essay</option><option value="mc">Multiple choice</option></select></label>
 <label className={fields.field}>Notes<select aria-label={`${c.short} exam notes`} value={c.notes} onChange={e=>change(c.code,{notes:e.target.value as SemesterCourse['notes']})}><option value="closed">Closed book</option><option value="open">Open book</option><option value="printed">Printed notes</option></select></label></>}
 </section>)}</div></ToolFrame>;
}

function NameInput({label,value,onSave}:{label:string;value:string;onSave:(value:string)=>void}) {
 const key=`semester-draft:${label}`;
 const [text,setText]=useState(()=>readCache<string>(key)??value);
 return <input aria-label={label} value={text} onChange={e=>{setText(e.target.value);writeCache(key,e.target.value);}} onBlur={()=>{if(text.trim()){onSave(text.trim());setText(text.trim());localStorage.removeItem(`lawstin-cache:${key}`);}}}/>;
}
