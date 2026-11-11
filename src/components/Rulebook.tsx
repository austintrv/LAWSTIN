import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import type { OutputType as QuestionState } from "../endpoints/state_GET.schema";
import { studyEngine, type CourseCode } from "../helpers/studyEngine";
import { haptic } from "../helpers/haptics";
import { createPortal } from "react-dom";
import { useLawstinData } from "../helpers/useLawstinData";
import { useModalFocus } from "../helpers/useModalFocus";
import { useBackClose } from "../helpers/useBackClose";
import { useWide } from "../helpers/useWide";
import header from "./WrittenPractice.module.css";
import { Button } from "./Button";
import styles from "./Rulebook.module.css";

type Mode = "read" | "recall";
type Section = { topic: string; rules: { subtopic: string; rule: string; authority: string | null }[] };

/** Every rule for a course by topic in class order. Read shows them all; Recall hides each behind a tap. */
export function Rulebook({ course, state, topic, embedded = false, initialMode = "read", readOnly = false }: { course: CourseCode; state?: QuestionState; topic?: string; embedded?: boolean; initialMode?: Mode; readOnly?: boolean }) {
  const [search, setSearch] = useState(topic ?? "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  const [mode, setMode] = useState<Mode>(initialMode);
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

  const query = search.trim().toLocaleLowerCase();
  const filtered = sections.map(s => ({ ...s, rules: s.rules.filter(r => [s.topic, r.subtopic, r.rule, r.authority].join(" ").toLocaleLowerCase().includes(query)) })).filter(s => s.rules.length);
  return <div ref={body} className={`${styles.rulebook} ${embedded ? styles.embedded : ""}`}>
    <div className={styles.page}>
      <div className={styles.search}><Search size={20} /><input ref={input} type="search" aria-label="Search rules" placeholder="Search rules" value={search} onChange={e => setSearch(e.target.value)} />{search && <button onClick={() => { setSearch(""); input.current?.focus(); }} aria-label="Clear search"><X size={18} /></button>}</div>
      {topic && search === topic && <Button size="lg" variant="secondary" onClick={() => { setSearch(""); input.current?.focus(); }}>Show all rules</Button>}
      {!filtered.length && <div className={styles.empty}><Search size={30} strokeWidth={1.5} /><h3>{sections.length ? "No matching rules" : "No rules yet"}</h3></div>}
      {!readOnly && <div className={styles.seg} role="group" aria-label="Rulebook mode">{(["read", "recall"] as const).map(m => <button key={m} aria-pressed={mode === m} onClick={() => pick(m)}>{m === "read" ? "Read" : "Recall"}</button>)}</div>}
      {filtered.length > 4 && <div className={styles.chipBar}><div className={styles.chips}>{filtered.map((s, i) => <button key={s.topic} onClick={() => jump(i)}>{s.topic}</button>)}</div></div>}
      <div className={styles.sections}>{filtered.map((s, i) => <section key={s.topic} data-section={i} className={styles.section}>
        <div className={styles.sectionHead}><h3>{s.topic}</h3><span>{s.rules.length}</span></div>
        <div className={styles.card}>{s.rules.map(r => {
          const key = `${s.topic}|${r.subtopic}|${r.rule}`;
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

export function RulesPanel({ course, topic, onClose }: { course: CourseCode; topic: string; onClose: () => void }) {
  const { query } = useLawstinData();
  const wide = useWide();
  const ref = useModalFocus<HTMLDivElement>(!wide);
  useBackClose(onClose);
  useEffect(() => { ref.current?.querySelector("input")?.focus({ preventScroll: true }); }, [wide]);
  const panel = <div ref={ref} tabIndex={-1} className={styles.panel} role={wide ? "region" : "dialog"} aria-modal={wide ? undefined : true} aria-label="Rules">
    <header className={header.top}><div className={header.topIn}><span className={header.spacer} /><span className={header.topTitle}>Rules</span><button className={header.x} aria-label="Close rules" onClick={onClose}><X size={17} /></button></div></header>
    <Rulebook course={course} topic={topic} state={query.data} embedded />
  </div>;
  return wide ? panel : createPortal(<div className={styles.sheet}>{panel}</div>, document.body);
}
