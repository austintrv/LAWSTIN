import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useSyncedSetting } from '../helpers/useSyncedSetting';
import { dateKey } from '../helpers/dateKey';
import { readCache, writeCache } from '../helpers/offlineCache';
import { hoursTotal, weeklyHours, type HoursLog, type HoursEntry } from '../helpers/workspace';
import { toast } from '../helpers/toast';
import { Button } from './Button';
import styles from './TaskList.module.css';
type Hours = { logged:number; required:number; as_of:string };
export function ClinicHours() {
  const legacy=useSyncedSetting<Hours|null>('workspace:clinic:hours',null);
  const log=useSyncedSetting<HoursLog|null>('workspace:clinic:log',null);
  const [draft,setDraft]=useState(()=>readCache<Partial<HoursEntry>>('clinic-log-draft') ?? {});
  const [editing,setEditing]=useState(false);
  if (!legacy.loaded || !log.loaded) return <section className={styles.card} aria-busy="true"/>;
  if (!legacy.value && legacy.error || log.error && !log.value) return <section className={styles.card}>Hours unavailable<button className={styles.addGo} disabled aria-label="Add hours"><Plus size={18}/></button></section>;
  const h=legacy.value ?? {logged:0,required:200,as_of:dateKey.today()}, current=log.value ?? {base:h.logged,entries:[]};
  const total=hoursTotal(current), days=weeklyHours(current.entries), max=Math.max(1,...days.map(d=>d.hours));
  const save=(next:HoursLog)=>{ try { log.save(next); legacy.save({...h,logged:hoursTotal(next),as_of:dateKey.today()}); } catch { toast.error('Couldn’t save hours. Your entry is kept.'); return false; } return true; };
  const edit=(entry?:HoursEntry)=>{ const next=entry ?? {date:dateKey.today(),hours:undefined,note:''}; setDraft(next);writeCache('clinic-log-draft',next);setEditing(true); };
  const change=(patch:Partial<HoursEntry>)=>{const next={...draft,...patch};setDraft(next);writeCache('clinic-log-draft',next);};
  const remove=(entry:HoursEntry)=>{if(save({...current,entries:current.entries.filter(e=>e.id!==entry.id)})) toast('Hours removed',{action:{label:'Undo',onClick:()=>save({...current,entries:current.entries})}});};
  return <section className={styles.card}>
    <div className={styles.hours}><button className={styles.hoursMain} onClick={()=>edit()}><span className={styles.hoursBig}>{total} <small>of {h.required} hours</small></span><span className={styles.hoursSub}>{Math.max(0,Math.round((h.required-total)*100)/100)} to go</span></button><button className={styles.addGo} aria-label="Add hours" onClick={()=>edit()}><Plus size={18}/></button></div>
    {(editing || draft.hours !== undefined) && <form className={styles.editor} onSubmit={e=>{e.preventDefault();if(!draft.date || !Number.isFinite(draft.hours) || Number(draft.hours)<=0)return;const entry={id:draft.id??crypto.randomUUID(),date:draft.date,hours:Number(draft.hours),note:draft.note??''};if(save({...current,entries:[...current.entries.filter(x=>x.id!==entry.id),entry]})){setEditing(false);setDraft({});writeCache('clinic-log-draft',{});toast('Hours saved',{action:{label:'Undo',onClick:()=>save(current)}});}}}>
      <label>Date<input type="date" aria-label="Hours date" required value={draft.date??dateKey.today()} onChange={e=>change({date:e.target.value})}/></label>
      <label>Hours<input autoFocus type="number" aria-label="Hours logged" required min="0.01" step="0.01" value={draft.hours??''} onChange={e=>change({hours:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Note<input aria-label="Hours note" value={draft.note??''} onChange={e=>change({note:e.target.value})}/></label><Button type="submit">Save hours</Button>
    </form>}
    <div className={styles.weekBars} aria-label="Hours this week">{days.map(d=><div key={d.date}><span>{d.hours}</span><i style={{height:`${Math.max(2,d.hours/max*64)}px`}}/><span>{new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined,{weekday:'short'})}</span></div>)}</div>
    {!!current.entries.length && <ul className={styles.list}>{[...current.entries].sort((a,b)=>b.date.localeCompare(a.date)).map(e=><li className={styles.taskRow} key={e.id}><button className={styles.taskMain} onClick={()=>edit(e)}>{e.date} · {e.hours} hours{e.note && <span className={styles.notePreview}>{e.note}</span>}</button><button className={styles.ghost} aria-label={`Remove hours ${e.date}`} onClick={()=>remove(e)}>Remove</button></li>)}</ul>}
  </section>;
}
