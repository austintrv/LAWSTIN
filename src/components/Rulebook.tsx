import { useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { OutputType as QuestionState } from "../endpoints/state_GET.schema";
import { studyEngine, type CourseCode } from "../helpers/studyEngine";
import { haptic } from "../helpers/haptics";
import styles from "./Rulebook.module.css";

type Mode = "read" | "recall";
type Section = { topic: string; rules: { subtopic: string; rule: string; authority: string | null }[] };

/** Every rule for a course by topic in class order. Read shows them all; Recall hides each behind a tap. */
export function Rulebook({ course, state }: { course: CourseCode; state?: QuestionState }) {
  const [mode, setMode] = useState<Mode>("read");
  const [shown, setShown] = useState<Set<string>>(new Set());
  const body = useRef<HTMLDivElement>(null);
  const sections = useMemo<Section[]>(() => {
    const e = studyEngine(state);
    const first = new Map<string, number>();
    for (const q of e.questions) {
      if (q.course !== course) continue;
      first.set(q.topic, Math.min(first.get(q.topic) ?? Infinity, q.classDay ?? Infinity));
    }
    return [...first.keys()].sort((a, b) => first.get(a)! - first.get(b)! || a.localeCompare(b))
      .map(topic => ({ topic, rules: e.topicRules(course, topic) })).filter(s => s.rules.length);
  }, [course, state]);

  const pick = (m: Mode) => { if (m === mode) return; haptic(); setMode(m); setShown(new Set()); };
  const toggle = (key: string) => { haptic(); setShown(prev => { const next = new Set(prev); if (!next.delete(key)) next.add(key); return next; }); };
  const jump = (i: number) => {
    haptic();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    body.current?.querySelector<HTMLElement>(`[data-section="${i}"]`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  if (!sections.length) return <div className={styles.rulebook}><div className={styles.page}><div className={styles.empty}><Search size={30} strokeWidth={1.5} /><h3>No rules yet</h3></div></div></div>;
  return <div ref={body} className={styles.rulebook}>
    <div className={styles.page}>
      <div className={styles.seg} role="group" aria-label="Rulebook mode">{(["read", "recall"] as const).map(m => <button key={m} aria-pressed={mode === m} onClick={() => pick(m)}>{m === "read" ? "Read" : "Recall"}</button>)}</div>
      {sections.length > 4 && <div className={styles.chipBar}><div className={styles.chips}>{sections.map((s, i) => <button key={s.topic} onClick={() => jump(i)}>{s.topic}</button>)}</div></div>}
      <div className={styles.sections}>{sections.map((s, i) => <section key={s.topic} data-section={i} className={styles.section}>
        <div className={styles.sectionHead}><h3>{s.topic}</h3><span>{s.rules.length}</span></div>
        <div className={styles.card}>{s.rules.map((r, k) => {
          const key = `${s.topic}|${k}`;
          if (mode === "read") return <div key={key} className={styles.rule}><span className={styles.sub}>{r.subtopic}</span><p>{r.rule}</p>{r.authority && <small>{r.authority}</small>}</div>;
          const open = shown.has(key);
          return <button key={key} className={styles.rule} aria-expanded={open} onClick={() => toggle(key)}>
            <span className={styles.subRow}><span className={styles.sub}>{r.subtopic}</span><ChevronDown size={20} className={styles.chevron} /></span>
            {open && <><p>{r.rule}</p>{r.authority && <small>{r.authority}</small>}</>}
          </button>;
        })}</div>
      </section>)}</div>
    </div>
  </div>;
}
