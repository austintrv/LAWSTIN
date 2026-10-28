import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Star, Flag, ChevronRight, Check } from "lucide-react";
import { Button } from "./Button";
import { Textarea } from "./Textarea";
import type { QuestionDTO, ProgressDTO } from "../endpoints/state_GET.schema";
import { COURSES, ROLE_LABEL, type RoundItem } from "../helpers/studyEngine";
import styles from "./QuizSession.module.css";

export type QuizMode = "practice" | "exam";

type Props = {
  items: RoundItem[];
  mode: QuizMode;
  getProgress: (id: string) => ProgressDTO | undefined;
  onAnswer: (q: QuestionDTO, choice: string) => Promise<boolean>;
  onStar: (q: QuestionDTO, starred: boolean) => void;
  onGuess: (q: QuestionDTO) => void;
  onFlag: (q: QuestionDTO, note: string) => void;
  onAnother: () => void;
  onRetry: (items: RoundItem[]) => void;
  onClose: () => void;
  className?: string;
};

const paras = (t: string) => t.split(/\n\s*\n/).map((p, i) => <p key={i}>{p.trim()}</p>);

export function QuizSession({ items, mode, getProgress, onAnswer, onStar, onGuess, onFlag, onAnother, onRetry, onClose, className }: Props) {
  const [i, setI] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [results, setResults] = useState<(boolean | undefined)[]>([]);
  const [picks, setPicks] = useState<string[]>([]);
  const [anim, setAnim] = useState<"in" | "out">("in");
  const [closing, setClosing] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagNote, setFlagNote] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [guessed, setGuessed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const done = i >= items.length;
  const item = items[Math.min(i, items.length - 1)];
  const q = item.q;

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 380);
  }, [onClose]);

  const goNext = useCallback(() => {
    setAnim("out");
    setTimeout(() => {
      setI((n) => n + 1);
      setSel(null);
      setChecked(false);
      setFlagOpen(false);
      setFlagNote("");
      setFlagged(false);
      setGuessed(false);
      setAnim("in");
      scrollRef.current?.scrollTo({ top: 0 });
    }, 170);
  }, []);

  const check = useCallback(async () => {
    if (!sel || checked) return;
    setChecked(true);
    const local = sel === q.answer;
    setResults((r) => { const n = [...r]; n[i] = local; return n; });
    setPicks((p) => { const n = [...p]; n[i] = sel; return n; });
    try { await onAnswer(q, sel); } catch { /* the toast in the parent reports it */ }
    if (mode === "exam") goNext();
  }, [sel, checked, q, i, mode, onAnswer, goNext]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const k = e.key.toUpperCase();
      if (!done && !checked && ["A", "B", "C", "D", "1", "2", "3", "4"].includes(k)) {
        setSel("ABCD"["1234".includes(k) ? Number(k) - 1 : "ABCD".indexOf(k)]);
      } else if (e.key === "Enter" && !done) {
        e.preventDefault();
        if (!checked) check(); else if (mode === "practice") goNext();
      } else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, checked, check, goNext, close, mode]);

  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current; touch.current = null;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
    if (checked && mode === "practice" && dx < -70 && Math.abs(dy) < 50) goNext();
  };
  const onTopTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current; touch.current = null;
    if (t && e.changedTouches[0].clientY - t.y > 70) close();
  };

  const p = getProgress(q.id);
  const chosen = q.choices.find((c) => c.id === sel);
  const right = q.choices.find((c) => c.id === q.answer)!;
  const ok = sel === q.answer;
  const course = COURSES[q.course];
  const showSheet = checked && mode === "practice" && !done;

  return (
    <div className={`${styles.modal} ${closing ? styles.closing : ""} ${className ?? ""}`} role="dialog" aria-modal="true" aria-label={mode === "exam" ? "Practice exam" : "Quiz round"}>
      <div className={styles.top} onTouchStart={onTouchStart} onTouchEnd={onTopTouchEnd}>
        <div className={styles.topIn}>
          <button className={styles.x} onClick={close} aria-label="Close"><X size={16} strokeWidth={2.4} /></button>
          <div className={styles.prog}>
            {items.map((_, k) => {
              const r = results[k];
              const cls = mode === "exam" ? (r !== undefined ? styles.done : k === i ? styles.cur : "") : r === undefined ? (k === i ? styles.cur : "") : r ? styles.ok : styles.bad;
              return <i key={k} className={cls} />;
            })}
          </div>
          <span className={styles.count}>{done ? "" : `${i + 1} of ${items.length}`}</span>
        </div>
      </div>

      <div className={styles.scroll} ref={scrollRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {!done ? (
          <div className={`${styles.body} ${anim === "in" ? styles.in : styles.out}`} key={i}>
            <div className={styles.meta}>
              <span className={styles.chip} style={{ color: course.color, background: `color-mix(in srgb, ${course.color} 14%, transparent)` }}>{course.short}</span>
              {mode === "exam" ? <span className={styles.pill}>Exam</span> : item.review ? <span className={styles.pill}>Review</span> : null}
              <span className={styles.topic}>{q.topic}{q.subtopic ? ` · ${q.subtopic}` : ""}</span>
            </div>
            <div className={styles.stem}>{paras(q.stem)}</div>
            <p className={styles.ask}>{q.prompt}</p>
            <div className={styles.choices} role="group" aria-label="Answer choices">
              {q.choices.map((c) => {
                const state = checked && mode === "practice"
                  ? c.id === q.answer ? styles.isOk : c.id === sel ? styles.isBad : styles.dim
                  : c.id === sel ? styles.selected : "";
                return (
                  <button key={c.id} className={`${styles.choice} ${state}`} disabled={checked} aria-pressed={c.id === sel} onClick={() => setSel(c.id)}>
                    <span className={styles.letter}>{checked && mode === "practice" && c.id === q.answer ? <Check size={15} strokeWidth={3} /> : c.id}</span>
                    <span className={styles.choiceText}>{c.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <Results items={items} results={results} picks={picks} mode={mode} onAnother={onAnother} onRetry={onRetry} onClose={close} />
        )}
      </div>

      {!done && !showSheet && (
        <div className={styles.foot}>
          <div className={styles.footIn}>
            <Button className={styles.big} disabled={!sel || checked} onClick={check}>
              {mode === "exam" ? (i === items.length - 1 ? "Finish" : "Next") : "Check answer"}
            </Button>
          </div>
        </div>
      )}

      <div className={`${styles.sheet} ${showSheet ? styles.sheetOpen : ""}`} aria-hidden={!showSheet}>
        {showSheet && (
          <div className={styles.sheetIn}>
            <div className={styles.grab} />
            <div className={styles.sheetScroll}>
              <div className={`${styles.verdict} ${ok ? styles.vOk : styles.vBad}`}>
                <span className={styles.vIcon}>{ok ? <Check size={16} strokeWidth={3} /> : <X size={16} strokeWidth={3} />}</span>
                {ok ? "Correct" : "Not quite"}
              </div>
              {!ok && chosen && (
                <div className={styles.ex}>
                  <span className={styles.exH}>Why {chosen.id} is wrong · {ROLE_LABEL[chosen.role]}</span>
                  <p>{chosen.why}</p>
                </div>
              )}
              <div className={styles.ex}>
                <span className={`${styles.exH} ${styles.exOk}`}>{ok ? `Why ${right.id} is right` : `The answer is ${right.id}`}</span>
                <p>{right.why}</p>
              </div>
              {q.rule && (
                <div className={styles.rule}>
                  <p>{q.rule}</p>
                  {q.authority && <small>{q.authority}</small>}
                </div>
              )}
              <details className={styles.all}>
                <summary>All four choices <ChevronRight size={14} /></summary>
                <div className={styles.allList}>
                  {q.choices.map((c) => (
                    <div key={c.id} className={styles.allItem}>
                      <span className={`${styles.letterSm} ${c.id === q.answer ? styles.letterOk : ""}`}>{c.id}</span>
                      <div><b>{ROLE_LABEL[c.role]}</b><p>{c.why}</p></div>
                    </div>
                  ))}
                </div>
              </details>
              {p && p.seen > 1 && (
                <p className={styles.history}>Seen {p.seen} times · {p.correct} right · {p.wrong} missed</p>
              )}
              {flagOpen && !flagged && (
                <div className={styles.flagBox}>
                  <Textarea value={flagNote} onChange={(e) => setFlagNote(e.target.value)} placeholder="What’s wrong with this question?" autoFocus />
                  <Button variant="secondary" onClick={() => { onFlag(q, flagNote); setFlagged(true); setFlagOpen(false); }}>Send flag</Button>
                </div>
              )}
            </div>
            <div className={styles.actions}>
              <button className={`${styles.iconBtn} ${p?.starred ? styles.starOn : ""}`} aria-label={p?.starred ? "Unstar" : "Star"} onClick={() => onStar(q, !p?.starred)}>
                <Star size={20} fill={p?.starred ? "currentColor" : "none"} />
              </button>
              <button className={`${styles.iconBtn} ${flagged ? styles.flagOn : ""}`} aria-label="Flag a problem" onClick={() => !flagged && setFlagOpen((v) => !v)}>
                <Flag size={20} fill={flagged ? "currentColor" : "none"} />
              </button>
              {ok && (
                <Button variant="secondary" className={styles.guess} disabled={guessed} onClick={() => { onGuess(q); setGuessed(true); }}>
                  {guessed ? "Marked as a guess" : "I guessed"}
                </Button>
              )}
              <Button className={styles.next} onClick={goNext}>{i === items.length - 1 ? "See results" : "Continue"}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Results({ items, results, picks, mode, onAnother, onRetry, onClose }: {
  items: RoundItem[]; results: (boolean | undefined)[]; picks: string[]; mode: QuizMode;
  onAnother: () => void; onRetry: (items: RoundItem[]) => void; onClose: () => void;
}) {
  const n = items.length;
  const c = results.filter(Boolean).length;
  const missed = items.filter((_, k) => results[k] === false);
  const circ = 2 * Math.PI * 62;
  const [offset, setOffset] = useState(circ);
  useEffect(() => { const t = requestAnimationFrame(() => setOffset(circ * (1 - c / Math.max(n, 1)))); return () => cancelAnimationFrame(t); }, [c, n, circ]);
  const color = c / n >= 0.8 ? "var(--success)" : c / n >= 0.5 ? "var(--accent)" : "var(--error)";
  const by: Record<string, { n: number; c: number }> = {};
  items.forEach((it, k) => { const b = (by[it.q.course] ||= { n: 0, c: 0 }); b.n++; if (results[k]) b.c++; });
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className={styles.res}>
      <div className={styles.ring}>
        <svg viewBox="0 0 148 148"><circle className={styles.track} cx="74" cy="74" r="62" /><circle className={styles.val} cx="74" cy="74" r="62" style={{ stroke: color, strokeDasharray: circ, strokeDashoffset: offset }} /></svg>
        <div><b>{c}/{n}</b><span>correct</span></div>
      </div>
      <h1 className={styles.resTitle}>{mode === "exam" ? "Exam complete" : "Round complete"}</h1>
      <div className={styles.card}>
        {Object.entries(by).map(([k, b]) => {
          const course = COURSES[k as keyof typeof COURSES];
          return (
            <div key={k} className={styles.row}>
              <span className={styles.dot} style={{ background: course.color }}>{course.short[0]}</span>
              <span className={styles.rowTitle}>{course.name}</span>
              <span className={styles.rowEnd}>{b.c} of {b.n}</span>
            </div>
          );
        })}
      </div>
      {mode === "exam" ? (
        <div className={styles.card}>
          {items.map((it, k) => {
            const pick = it.q.choices.find((x) => x.id === picks[k]);
            const right = it.q.choices.find((x) => x.id === it.q.answer)!;
            const isOpen = open === k;
            return (
              <div key={k} className={styles.reviewItem}>
                <button className={styles.reviewHead} onClick={() => setOpen(isOpen ? null : k)} aria-expanded={isOpen}>
                  <span className={`${styles.mark} ${results[k] ? styles.markOk : styles.markBad}`}>{results[k] ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}</span>
                  <span className={styles.rowMain}><span className={styles.rowTitle}>{it.q.subtopic ?? it.q.topic}</span><span className={styles.rowSub}>{it.q.prompt}</span></span>
                  <ChevronRight size={16} className={`${styles.chev} ${isOpen ? styles.chevOpen : ""}`} />
                </button>
                {isOpen && (
                  <div className={styles.reviewBody}>
                    {!results[k] && pick && <p><b>You chose {pick.id}.</b> {pick.why}</p>}
                    <p><b>The answer is {right.id}.</b> {right.why}</p>
                    {it.q.rule && <p className={styles.reviewRule}>{it.q.rule}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : missed.length > 0 ? (
        <div className={styles.card}>
          {missed.map((it) => (
            <div key={it.q.id} className={styles.row}>
              <span className={styles.rowMain}><span className={styles.rowTitle}>{it.q.subtopic ?? it.q.topic}</span><span className={styles.rowSub}>{it.q.prompt}</span></span>
            </div>
          ))}
        </div>
      ) : null}
      <div className={styles.btns}>
        <Button className={styles.big} onClick={onAnother}>{mode === "exam" ? "New exam" : "Another round"}</Button>
        {missed.length > 0 && (
          <Button variant="secondary" className={styles.big} onClick={() => onRetry(missed.map((it) => ({ q: it.q, review: true })))}>Retry the {missed.length} missed</Button>
        )}
        <Button variant="ghost" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
