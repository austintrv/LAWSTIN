import { ClinicHours } from "./ClinicHours";
import { useSyncedSetting } from "../helpers/useSyncedSetting";
import { reorder } from "../helpers/workspace";
import React, { useEffect, useRef, useState } from "react";
import { Plus, GripVertical, ArrowUp, ArrowUpRight, CalendarDays, Check, ChevronRight, FileText, Flag, Trash2, X } from "lucide-react";
import { dateKey } from "../helpers/dateKey";
import { haptic } from "../helpers/haptics";
import { sortTasks, useCourseTasks, useWorkspaceSync, flushSettings, type CourseTask, type TaskCourse } from "../helpers/useCourseTasks";
import { readCache, writeCache, queueSetting, settingQueue } from "../helpers/offlineCache";
import { toast } from "../helpers/toast";
import { supabase } from "../helpers/supabase";
import styles from "./TaskList.module.css";

export function dueLabel(due: string, today = dateKey.today()): { text: string; tone: "late" | "soon" | "later" } {
  const d = new Date(`${due}T12:00:00`);
  const short = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (due < today) return { text: `Overdue · ${short}`, tone: "late" };
  if (due === today) return { text: "Today", tone: "late" };
  if (due === dateKey.addDays(today, 1)) return { text: "Tomorrow", tone: "soon" };
  if (due <= dateKey.addDays(today, 6)) return { text: d.toLocaleDateString(undefined, { weekday: "long" }), tone: "later" };
  return { text: short, tone: "later" };
}

export type WorkspaceLink = { title: string; url: string };

export function TaskList({ course, color, links = [] }: { course: TaskCourse; color: string; links?: WorkspaceLink[] }) {
  const { tasks, add, update, removeWithUndo, completeWithUndo } = useCourseTasks();
  const mine = tasks.filter((t) => t.course === course);
  const sorted = sortTasks(mine);
  const order = useSyncedSetting<string[]>(`workspace:task-order:${course}`,[]);
  const open = [...sorted.open].sort((a,b) => { const rank=(id:string)=>{const n=order.value.indexOf(id);return n<0?99999:n;};return rank(a.id)-rank(b.id); }), done=sorted.done;
  const dragged=useRef<string|null>(null);
  const move=(id:string,before:string)=>order.save(reorder(open.map(t=>t.id),id,before));
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    haptic();
    add.mutate({ course, title: t, due });
    setTitle(""); setDue(null);
  };
  const complete = (t: CourseTask) => {
    haptic();
    if (t.done_at) { update.mutate({ id: t.id, patch: { done_at: null } }); return; }
    // Let the check fill before the row leaves the open list.
    setLeaving((s) => new Set(s).add(t.id));
    setTimeout(() => {
      completeWithUndo(t);
      setLeaving((s) => { const n = new Set(s); n.delete(t.id); return n; });
    }, 420);
  };

  return (
    <div className={styles.wrap} style={{ "--c": color } as React.CSSProperties}>
      <div className={styles.col}>
      <section className={styles.card}>
        <form className={styles.add} onSubmit={submit}>
          <span className={styles.addDot} aria-hidden="true" />
          <input autoFocus={!mine.length} className={styles.addInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task" aria-label="New task" enterKeyHint="done" maxLength={300} />
          <DateChip value={due} onChange={setDue} />
          <button className={styles.addGo} type="submit" disabled={!title.trim()} aria-label="Add task"><ArrowUp size={18} strokeWidth={2.6} /></button>
        </form>
        {open.length > 0 && (
          <ul className={styles.list}>
            {open.map((t) => (
              <li key={t.id} data-task-order={t.id} className={styles.orderedTask} draggable onDragStart={()=>{dragged.current=t.id;}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(dragged.current)move(dragged.current,t.id);dragged.current=null;}}>
              <button className={styles.dragHandle} aria-label={`Reorder ${t.title}`} onPointerDown={e=>{dragged.current=t.id;e.currentTarget.setPointerCapture(e.pointerId);}} onPointerUp={e=>{const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-task-order]')?.dataset.taskOrder;if(target && dragged.current && target!==dragged.current)move(dragged.current,target);dragged.current=null;}} onKeyDown={e=>{const i=open.findIndex(x=>x.id===t.id);if(e.key==='ArrowUp' && i>0){e.preventDefault();move(t.id,open[i-1].id);}if(e.key==='ArrowDown' && i<open.length-1){e.preventDefault();order.save(reorder(open.map(x=>x.id),open[i+1].id,t.id));}}}><GripVertical size={16}/></button>
              <TaskRow task={t} leaving={leaving.has(t.id)} open={expanded === t.id}
                onToggle={() => setExpanded((x) => (x === t.id ? null : t.id))} onComplete={() => complete(t)}
                onPatch={(patch) => update.mutate({ id: t.id, patch })} onDelete={() => { haptic(); removeWithUndo(t); setExpanded(null); }} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <details className={`${styles.card} ${styles.done}`}>
          <summary><span>Completed</span><span className={styles.count}>{done.length}</span><ChevronRight size={16} className={styles.chev} /></summary>
          <ul className={styles.list}>
            {done.slice(0, 50).map((t) => (
              <li key={t.id}><TaskRow task={t} leaving={false} open={expanded === t.id}
                onToggle={() => setExpanded((x) => (x === t.id ? null : t.id))} onComplete={() => complete(t)}
                onPatch={(patch) => update.mutate({ id: t.id, patch })} onDelete={() => { haptic(); removeWithUndo(t); setExpanded(null); }} /></li>
            ))}
          </ul>
        </details>
      )}

      </div>
      <div className={styles.col}>
      {course === "clinic" && <ClinicHours />}
      <WorkspaceNotes course={course} />
      {links.length > 0 && (
        <section className={styles.card}>
          <ul className={styles.list} style={{ borderTop: 0 }}>
            {links.map((l) => (
              <li key={l.url} className={styles.task}>
                <a className={styles.link} href={l.url} target="_blank" rel="noopener noreferrer">
                  <FileText size={18} /><span>{l.title}</span><ArrowUpRight size={17} className={styles.chev} />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </div>
  );
}

function DateChip({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const label = value ? dueLabel(value) : null;
  return (
    <label className={`${styles.dateChip} ${value ? styles.dateSet : ""} ${label ? styles[label.tone] : ""}`}>
      <CalendarDays size={16} />
      {label && <span>{label.text}</span>}
      <input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} aria-label="Due date" />
    </label>
  );
}

function TaskRow({ task: t, leaving, open, onToggle, onComplete, onPatch, onDelete }: {
  task: CourseTask; leaving: boolean; open: boolean; onToggle: () => void; onComplete: () => void;
  onPatch: (p: Partial<CourseTask>) => void; onDelete: () => void;
}) {
  const [title, setTitle] = useState(t.title);
  const [notes, setNotes] = useState(t.notes);
  useEffect(() => { setTitle(t.title); setNotes(t.notes); }, [t.title, t.notes]);
  const label = t.due ? dueLabel(t.due) : null;
  const done = !!t.done_at || leaving;
  const saveTitle = () => { const v = title.trim(); if (v && v !== t.title) onPatch({ title: v }); else setTitle(t.title); };
  const saveNotes = () => { if (notes !== t.notes) onPatch({ notes }); };
  return (
    <div className={`${styles.task} ${leaving ? styles.leaving : ""} ${t.done_at ? styles.isDone : ""}`}>
      <div className={styles.taskRow}>
        <button className={`${styles.check} ${done ? styles.checked : ""}`} onClick={onComplete} aria-label={t.done_at ? "Mark not done" : "Mark done"} aria-pressed={done}>
          {done && <Check size={14} strokeWidth={3.2} />}
        </button>
        <button className={styles.taskMain} onClick={onToggle} aria-expanded={open}>
          <span className={styles.taskTitle}>{t.title}</span>
          {(label || t.flagged || t.notes) && (
            <span className={styles.taskMeta}>
              {t.flagged && <Flag size={13} className={styles.flag} fill="currentColor" />}
              {label && !t.done_at && <span className={styles[label.tone]}>{label.text}</span>}
              {t.notes && <span className={styles.notePreview}>{t.notes.split("\n")[0]}</span>}
            </span>
          )}
        </button>
      </div>
      {open && (
        <div className={styles.editor}>
          <input className={styles.editTitle} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label="Task title" maxLength={300} />
          <textarea className={styles.editNotes} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} placeholder="Notes" aria-label="Notes" rows={3} />
          <div className={styles.editBar}>
            <label>Repeat<select aria-label="Repeat task" value={t.repeat??''} onChange={e=>onPatch({repeat:(e.target.value || null) as CourseTask['repeat']})}><option value="">Never</option><option value="weekly">Weekly</option><option value="fortnightly">Every two weeks</option></select></label>
            <DateChip value={t.due} onChange={(v) => onPatch({ due: v })} />
            {t.due && <button className={styles.ghost} onClick={() => onPatch({ due: null })} aria-label="Clear due date"><X size={16} /></button>}
            <button className={`${styles.ghost} ${t.flagged ? styles.flagOn : ""}`} onClick={() => { haptic(); onPatch({ flagged: !t.flagged }); }} aria-pressed={t.flagged} aria-label={t.flagged ? "Remove flag" : "Flag"}>
              <Flag size={16} fill={t.flagged ? "currentColor" : "none"} />
            </button>
            <span className={styles.spacer} />
            <button className={`${styles.ghost} ${styles.danger}`} onClick={onDelete} aria-label="Delete task"><Trash2 size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkspaceNotes({ course }: { course: TaskCourse }) {
  const key = `workspace:notes:${course}`;
  const [text, setText] = useState<string | null>(() => settingQueue()[key]?.value ?? readCache<string>(key) ?? null);
  const [failed, setFailed] = useState(false);
  useWorkspaceSync();
  useEffect(() => {
    let live = true;
    const fetch = async () => {
      const pending = settingQueue()[key];
      const before = readCache<string>(key);
      const { data, error } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
      if (!live) return;
      setFailed(!!error);
      if (error) return;
      const value = settingQueue()[key]?.value ?? (pending || readCache<string>(key) !== before ? readCache<string>(key) : data?.value) ?? "";
      writeCache(key, value); setText(value);
    };
    void fetch();
    window.addEventListener("online", fetch);
    return () => { live = false; window.removeEventListener("online", fetch); };
  }, [key]);
  useEffect(() => {
    if (!settingQueue()[key]) return;
    const timer = setTimeout(() => void flushSettings(), 700);
    return () => clearTimeout(timer);
  }, [key, text]);
  if (text === null && !failed) return <section className={`${styles.card} ${styles.notes} ${styles.placeholder}`} aria-busy="true" />;
  if (text === null) return <section className={`${styles.card} ${styles.notes}`}><h3>Notes</h3><button className={styles.ghost} onClick={() => window.dispatchEvent(new Event("online"))}>Retry</button></section>;
  return <section className={`${styles.card} ${styles.notes}`}>
    <h3>Notes</h3>
    <textarea value={text} onChange={e => {
      const value = e.target.value;
      try { queueSetting(key, value); } catch { toast.error("Couldn’t save notes on this device"); }
      setText(value);
    }} onBlur={() => void flushSettings()} aria-label="Workspace notes" rows={Math.min(14, Math.max(4, text.split("\n").length + 1))} />
  </section>;
}
