import { useEffect, useRef, useState } from "react";
import { X, ChevronRight, BookOpen } from "lucide-react";
import { Button } from "../Button";
import { RulesPanel } from "../Rulebook";
import { WrittenPractice } from "../WrittenPractice";
import { useStudyLibrary } from "../../helpers/useStudyLibrary";
import { useWritten, scoreSpot, spotCredit, nextSpotHypo, type SpotEntry } from "../../helpers/useWritten";
import { useLawstinData } from "../../helpers/useLawstinData";
import { useLogStudy } from "../../helpers/useLogStudy";
import { studyEngine, COURSES, type CourseCode } from "../../helpers/studyEngine";
import type { Hypothetical } from "../../helpers/studyMaterials";
import { readCache } from "../../helpers/offlineCache";
import { useModalFocus } from "../../helpers/useModalFocus";
import { useBackClose } from "../../helpers/useBackClose";
import { toast } from "../../helpers/toast";
import { haptic } from "../../helpers/haptics";
import shared from "../WrittenPractice.module.css";
import styles from "./IssueSpot.module.css";

type Props = { course?: CourseCode; arg?: string; onClose: () => void; hypo?: Hypothetical; entry?: SpotEntry; onWrite?: (h: Hypothetical) => void };
export default function IssueSpot({ course = "il", arg, onClose, hypo, entry, onWrite }: Props) {
  const library = useStudyLibrary();
  const written = useWritten();
  const { query } = useLawstinData();
  const log = useLogStudy();
  const hypos = (library.data?.materials ?? []).filter((m): m is Hypothetical => m.kind === "hypothetical" && m.course !== "pr");
  const weak = new Set([...written.weak, ...studyEngine(query.data).weakTopics().map(t => `${t.course}|${t.topic}`)]);
  const [current, setCurrent] = useState<Hypothetical | null>(hypo ?? null);
  const [view, setView] = useState(entry);
  const [essay, setEssay] = useState<Hypothetical | null>(null);
  const next = (skip?: string) => nextSpotHypo(hypos, course, written.spots, weak, skip);
  const material = current ?? hypos.find(h => h.id === (entry?.id ?? arg)) ?? (!arg && !entry ? next() : undefined);
  const write = (h: Hypothetical) => onWrite ? onWrite(h) : setEssay(h);
  if (essay) return <WrittenPractice hypo={essay} hypos={hypos} weak={weak} written={written} onClose={() => setEssay(null)}
    onGraded={(e, length) => { const n = length === "full" ? 10 : 5; log("written", e.id, e.grade.score >= 7, n, Math.round(e.grade.score / 10 * n)); }}
    onTopic={c => { onClose(); window.location.hash = `#/courses/${c}`; }} />;
  return <Exercise key={material?.id ?? "empty"} material={material} entry={view} onClose={onClose} loading={library.isLoading}
    onNext={() => { setView(undefined); setCurrent(next(material?.id) ?? null); }} hasNext={!!next(material?.id)} onWrite={write}
    onSave={e => { if (material) setCurrent(material); written.addSpot(e); log("drill", `spot:${e.id}:${e.at}`, e.caught * 2 >= e.total, 2, spotCredit(e)); }} />;
}

function Exercise({ material: h, entry, onClose, onNext, hasNext, onWrite, onSave, loading }: {
  material?: Hypothetical; entry?: SpotEntry; onClose: () => void; onNext: () => void; hasNext: boolean; onWrite: (h: Hypothetical) => void; onSave: (e: SpotEntry) => void; loading: boolean;
}) {
  const draftName = `lawstin-cache:spot-draft:${h?.id}`;
  const [draft] = useState(() => readCache<{ lines: string; seconds: number; revealed: boolean; marks: Record<number, boolean> }>(`spot-draft:${h?.id}`));
  const [lines, setLines] = useState(entry?.lines ?? draft?.lines ?? "");
  const [seconds, setSeconds] = useState(draft?.seconds ?? 0);
  const [revealed, setRevealed] = useState(!!entry || draft?.revealed || false);
  const [marks, setMarks] = useState<Record<number, boolean>>(draft?.marks ?? {});
  const [result, setResult] = useState(entry);
  const [rules, setRules] = useState(false);
  const ref = useModalFocus<HTMLDivElement>();
  const completed = useRef(!!entry);
  useBackClose(onClose);
  useEffect(() => {
    if (!h || result) return;
    const timer = setInterval(() => { if (!document.hidden) setSeconds(s => s + 1); }, 1000);
    return () => clearInterval(timer);
  }, [h, result]);
  const keep = (value = { lines, seconds, revealed, marks }) => {
    if (!h || result) return;
    try { localStorage.setItem(draftName, JSON.stringify(value)); } catch { toast.error("Couldn’t save your issues on this device"); }
  };
  useEffect(() => { keep(); }, [lines, seconds, revealed, marks, result]);
  const finish = () => {
    if (!h || completed.current || Object.keys(marks).length !== h.answer.length) return;
    const e = scoreSpot(h, marks, lines);
    try { onSave(e); completed.current = true; setResult(e); localStorage.removeItem(draftName); haptic(); }
    catch { toast.error("Couldn’t save your result on this device"); }
  };
  const issues = h?.answer.map((a, i) => ({ ...a, i })) ?? [];
  if (result) issues.sort((a, b) => Number(result.missed.includes(b.issue)) - Number(result.missed.includes(a.issue)));
  return <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Spot the issues" className={shared.modal}>
    <header className={shared.top}><div className={shared.topIn}><span className={shared.spacer} /><span className={shared.topTitle}>Spot the issues</span><button className={shared.x} aria-label="Close" onClick={onClose}><X size={17} /></button></div></header>
    <div className={`${shared.workspace} ${rules ? shared.withRules : ""}`}>
      <div className={shared.scroll}><div className={`${shared.body} ${styles.body}`}>
        {h ? <>
          <div className={styles.meta}><span style={{ color: COURSES[h.course].color }}>{COURSES[h.course].short}</span><span role="timer">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span><Button size="lg" variant="secondary" onClick={() => setRules(true)} aria-expanded={rules}><BookOpen size={18} />Rules</Button></div>
          <h1 className={styles.title}>{result ? `${result.caught} of ${result.total} issues` : h.title}</h1>
          {!revealed ? <div className={styles.columns}>
            <div className={styles.facts}><p>{h.facts}</p><h2>{h.prompt}</h2></div>
            <div className={styles.work}><textarea aria-label="Your issues" placeholder="Your issues, one per line" value={lines} onChange={e => { setLines(e.target.value); keep({ lines: e.target.value, seconds, revealed, marks }); }} /><Button size="lg" className={shared.cta} onClick={() => { haptic(); setRevealed(true); }}>Show the issues</Button></div>
          </div> : <div className={styles.columns}>
            <section className={styles.work}><h2>Your issues</h2><div className={styles.lines}>{lines || "Kept in mind"}</div><details className={shared.model}><summary>Fact pattern<ChevronRight size={18} /></summary><div className={shared.modelBody}><h2>{h.title}</h2><p>{h.facts}</p><b>{h.prompt}</b></div></details></section>
            <section className={styles.work} aria-label="Checked issues">{issues.map(a => <article key={a.i} className={shared.card}>
              <details className={styles.issue}><summary>{result && <span className={result.missed.includes(a.issue) ? styles.missed : styles.got}>{result.missed.includes(a.issue) ? "Missed it" : "Got it"}</span>}<span>{a.issue}</span><ChevronRight size={18} /></summary><p>{a.analysis}</p><p className={styles.authority}>{a.authority}</p></details>
              {!result && <div className={styles.marks}>{([true, false] as const).map(ok => <Button size="lg" key={String(ok)} variant="secondary" aria-pressed={marks[a.i] === ok} onClick={() => { haptic(); setMarks(m => ({ ...m, [a.i]: ok })); }}>{ok ? "Got it" : "Missed it"}</Button>)}</div>}
            </article>)}</section>
          </div>}
          {revealed && !result && <Button size="lg" className={`${shared.big} ${shared.cta}`} disabled={Object.keys(marks).length !== h.answer.length} onClick={finish}>See result</Button>}
          {result && <div className={styles.actions}><Button size="lg" className={shared.cta} disabled={!hasNext} onClick={onNext}>Next fact pattern</Button><Button size="lg" variant="secondary" onClick={() => onWrite({ ...h, minutes: 15 })}>Write it out · 15 min</Button><Button size="lg" variant="secondary" onClick={onClose}>Done</Button></div>}
        </> : <div className={styles.empty}><h1>{loading ? "Loading…" : "All caught up"}</h1><Button size="lg" variant="secondary" onClick={onClose}>Done</Button></div>}
      </div></div>
      {rules && h && <RulesPanel course={h.course} topic={h.topic} onClose={() => setRules(false)} />}
    </div>
  </div>;
}
