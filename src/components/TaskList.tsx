import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, CalendarDays, Check, ChevronRight, FileText, Flag, Trash2, X } from "lucide-react";
import { dateKey } from "../helpers/dateKey";
import { haptic } from "../helpers/haptics";
import { sortTasks, useCourseTasks, type CourseTask, type TaskCourse } from "../helpers/useCourseTasks";
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
  const { tasks, add, update, remove } = useCourseTasks();
  const mine = tasks.filter((t) => t.course === course);
  const { open, done } = sortTasks(mine);
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
      update.mutate({ id: t.id, patch: { done_at: new Date().toISOString() } });
      setLeaving((s) => { const n = new Set(s); n.delete(t.id); return n; });
    }, 420);
  };

  return (
    <div className={styles.wrap} style={{ "--c": color } as React.CSSProperties}>
      <div className={styles.col}>
      <section className={styles.card}>
        <form className={styles.add} onSubmit={submit}>
          <span className={styles.addDot} aria-hidden="true" />
          <input className={styles.addInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task" aria-label="New task" enterKeyHint="done" maxLength={300} />
          <DateChip value={due} onChange={setDue} />
          <button className={styles.addGo} type="submit" disabled={!title.trim()} aria-label="Add task"><ArrowUp size={18} strokeWidth={2.6} /></button>
        </form>
        {open.length > 0 && (
          <ul className={styles.list}>
            {open.map((t) => (
              <TaskRow key={t.id} task={t} leaving={leaving.has(t.id)} open={expanded === t.id}
                onToggle={() => setExpanded((x) => (x === t.id ? null : t.id))} onComplete={() => complete(t)}
                onPatch={(patch) => update.mutate({ id: t.id, patch })} onDelete={() => { haptic(); remove.mutate(t.id); setExpanded(null); }} />
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <details className={`${styles.card} ${styles.done}`}>
          <summary><span>Completed</span><span className={styles.count}>{done.length}</span><ChevronRight size={16} className={styles.chev} /></summary>
          <ul className={styles.list}>
            {done.slice(0, 50).map((t) => (
              <TaskRow key={t.id} task={t} leaving={false} open={expanded === t.id}
                onToggle={() => setExpanded((x) => (x === t.id ? null : t.id))} onComplete={() => complete(t)}
                onPatch={(patch) => update.mutate({ id: t.id, patch })} onDelete={() => { haptic(); remove.mutate(t.id); setExpanded(null); }} />
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
    <li className={`${styles.task} ${leaving ? styles.leaving : ""} ${t.done_at ? styles.isDone : ""}`}>
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
    </li>
  );
}

const workspaceCache = new Map<string, string>();

/** Free-form workspace notes (contacts, meeting times, requirements), saved to the owner's settings row. */
function WorkspaceNotes({ course }: { course: TaskCourse }) {
  const key = `workspace:notes:${course}`;
  const [text, setText] = useState<string | null>(() => workspaceCache.get(key) ?? null);
  const saved = useRef(workspaceCache.get(key) ?? "");
  useEffect(() => {
    let live = true;
    const before = workspaceCache.get(key) ?? "";
    supabase.from("app_settings").select("value").eq("key", key).maybeSingle().then(({ data }) => {
      if (!live) return;
      const server = data?.value ?? "";
      workspaceCache.set(key, server);
      saved.current = server;
      // Keep anything typed while the fresh copy loaded; the save effect then writes it.
      setText((cur) => (cur === null || cur === before ? server : cur));
    });
    return () => { live = false; };
  }, [key]);
  useEffect(() => {
    if (text === null || text === saved.current) return;
    const t = setTimeout(async () => {
      const { error } = await supabase.from("app_settings").upsert({ key, value: text, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (!error) { saved.current = text; workspaceCache.set(key, text); }
    }, 700);
    return () => clearTimeout(t);
  }, [text, key]);
  if (text === null) return <section className={`${styles.card} ${styles.notes} ${styles.placeholder}`} aria-hidden="true" />;
  return (
    <section className={`${styles.card} ${styles.notes}`}>
      <h3>Notes</h3>
      <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Workspace notes" rows={Math.min(14, Math.max(4, text.split("\n").length + 1))} />
    </section>
  );
}

type Hours = { logged: number; required: number; as_of: string };

/** Clinic hour requirement: the official log lives in MyCase and the student's sheet; this keeps the running total in view. */
function ClinicHours() {
  const key = "workspace:clinic:hours";
  const [h, setH] = useState<Hours | null>(() => { try { const v = workspaceCache.get(key); return v ? JSON.parse(v) : null; } catch { return null; } });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", key).maybeSingle().then(({ data }) => {
      if (data?.value) workspaceCache.set(key, data.value);
      try { setH(data?.value ? JSON.parse(data.value) : { logged: 0, required: 200, as_of: dateKey.today() }); } catch { setH({ logged: 0, required: 200, as_of: dateKey.today() }); }
    });
  }, []);
  if (!h) return <section className={`${styles.card} ${styles.hours} ${styles.placeholder}`} aria-hidden="true" />;
  const save = async () => {
    const n = Number(draft);
    setEditing(false);
    if (!Number.isFinite(n) || n < 0) return;
    const next = { ...h, logged: Math.round(n * 100) / 100, as_of: dateKey.today() };
    setH(next); haptic();
    workspaceCache.set(key, JSON.stringify(next));
    await supabase.from("app_settings").upsert({ key, value: JSON.stringify(next), updated_at: new Date().toISOString() }, { onConflict: "key" });
  };
  const pct = Math.min(1, h.logged / h.required);
  const circ = 2 * Math.PI * 26;
  const asOf = new Date(`${h.as_of}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <section className={`${styles.card} ${styles.hours}`}>
      <span className={styles.hoursRing}>
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="26" className={styles.hoursTrack} />
          <circle cx="32" cy="32" r="26" className={styles.hoursVal} style={{ strokeDasharray: circ, strokeDashoffset: circ * (1 - pct) }} />
        </svg>
        <b>{Math.round(pct * 100)}%</b>
      </span>
      {editing ? (
        <form className={styles.hoursEdit} onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <input autoFocus inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => void save()} aria-label="Hours logged" />
          <span>of {h.required} hours</span>
        </form>
      ) : (
        <button className={styles.hoursMain} onClick={() => { setDraft(String(h.logged)); setEditing(true); }}>
          <span className={styles.hoursBig}>{h.logged} <small>of {h.required} hours</small></span>
          <span className={styles.hoursSub}>{Math.max(0, Math.round((h.required - h.logged) * 100) / 100)} to go · as of {asOf}</span>
        </button>
      )}
    </section>
  );
}
