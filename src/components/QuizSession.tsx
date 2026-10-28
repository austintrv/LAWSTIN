import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Star, Flag, ChevronRight, Check, MessageCircle, TrendingUp, Sparkles } from "lucide-react";
import { Button } from "./Button";
import { Textarea } from "./Textarea";
import { AskPanel } from "./AskPanel";
import type { QuestionDTO, ProgressDTO } from "../endpoints/state_GET.schema";
import { COURSES, ROLE_LABEL, type RoundItem } from "../helpers/studyEngine";
import { haptic } from "../helpers/haptics";
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
  /** Writes a harder version of the question with AI; it is inserted right after the current one. */
  onHarder?: (q: QuestionDTO) => Promise<QuestionDTO | null>;
  className?: string;
};

const paras = (t: string) => t.split(/\n\s*\n/).map((p, i) => <p key={i}>{p.trim()}</p>);
const isAi = (q: QuestionDTO) => q.id.startsWith("ai-");

export function QuizSession({ items: initial, mode, getProgress, onAnswer, onStar, onGuess, onFlag, onAnother, onRetry, onClose, onHarder, className }: Props) {
  const [items, setItems] = useState(initial);
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
  const [asking, setAsking] = useState(false);
  const [harder, setHarder] = useState<"idle" | "busy" | "added">("idle");
  const [phase, setPhase] = useState<"answer" | "review">("answer");
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
      setAsking(false);
      setHarder("idle");
      setPhase("answer");
      setAnim("in");
      scrollRef.current?.scrollTo({ top: 0 });
    }, 170);
  }, []);

  const check = useCallback(async () => {
    if (!sel || checked) return;
    const local = sel === q.answer;
    if (mode === "practice") haptic();
    setChecked(true);
    setResults((r) => { const n = [...r]; n[i] = local; return n; });
    setPicks((p) => { const n = [...p]; n[i] = sel; return n; });
    if (mode === "practice") {
      // Slide over to the review screen while the answer saves.
      setAnim("out");
      setTimeout(() => { setPhase("review"); setAnim("in"); scrollRef.current?.scrollTo({ top: 0 }); }, 170);
    }
    try { await onAnswer(q, sel); } catch { /* the toast in the parent reports it */ }
    if (mode === "exam") goNext();
  }, [sel, checked, q, i, mode, onAnswer, goNext]);

  const makeHarder = async () => {
    if (!onHarder || harder !== "idle") return;
    haptic();
    setHarder("busy");
    const nq = await onHarder(q);
    if (!nq) { setHarder("idle"); return; }
    setItems((list) => [...list.slice(0, i + 1), { q: nq, review: false }, ...list.slice(i + 1)]);
    setHarder("added");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (asking) return;
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const k = e.key.toUpperCase();
      if (!done && !checked && ["A", "B", "C", "D", "1", "2", "3", "4"].includes(k)) {
        const pick = "ABCD"["1234".includes(k) ? Number(k) - 1 : "ABCD".indexOf(k)];
        setSel((cur) => (cur === pick ? null : pick));
      } else if (e.key === "Enter" && !done) {
        e.preventDefault();
        if (!checked) check(); else if (mode === "practice") goNext();
      } else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, checked, check, goNext, close, mode, asking]);

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
  const reviewing = phase === "review" && mode === "practice" && !done;
  const ai = isAi(q);
  const others = q.choices.filter((c) => c.id !== q.answer && c.id !== sel);

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
        {done ? (
          <Results items={items} results={results} picks={picks} mode={mode} onAnother={onAnother} onRetry={onRetry} onClose={close} />
        ) : !reviewing ? (
          <div className={`${styles.body} ${anim === "in" ? styles.in : styles.out}`} key={`q-${i}-${q.id}`}>
            <span className={styles.courseLine} style={{ background: course.color }} aria-hidden="true" />
            <div className={styles.meta}>
              <span className={styles.chip} style={{ color: course.color, background: `color-mix(in srgb, ${course.color} 14%, transparent)` }}>{course.short}</span>
              {ai ? <span className={`${styles.pill} ${styles.aiPill}`}><Sparkles size={11} /> Harder</span> : mode === "exam" ? <span className={styles.pill}>Exam</span> : item.review ? <span className={styles.pill}>Review</span> : null}
              <span className={styles.topic}>{q.topic}{q.subtopic ? ` · ${q.subtopic}` : ""}</span>
            </div>
            <div className={styles.stem}>{paras(q.stem)}</div>
            <p className={styles.ask}>{q.prompt}</p>
            <div className={styles.choices} role="group" aria-label="Answer choices">
              {q.choices.map((c) => (
                <button key={c.id} className={`${styles.choice} ${c.id === sel ? styles.selected : ""}`} disabled={checked} aria-pressed={c.id === sel}
                  onClick={() => { haptic(); setSel((cur) => (cur === c.id ? null : c.id)); }}>
                  <span className={styles.letter}>{c.id}</span>
                  <span className={styles.choiceText}>{c.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={`${styles.body} ${styles.review} ${anim === "in" ? styles.in : styles.out}`} key={`r-${i}-${q.id}`}>
            <div className={`${styles.verdictCard} ${ok ? styles.vOk : styles.vBad}`}>
              <span className={styles.vBig}>{ok ? <Check size={22} strokeWidth={3} /> : <X size={22} strokeWidth={3} />}</span>
              <div>
                <h2>{ok ? "Correct" : "Not quite"}</h2>
                <span>{ok ? `${right.id} was the answer` : `You chose ${sel} · ${ROLE_LABEL[chosen?.role ?? "average"]}`}</span>
              </div>
            </div>

            <details className={styles.factBox}>
              <summary>
                <span className={styles.factMeta}><i style={{ background: course.color }} />{course.short} · {q.subtopic ?? q.topic}</span>
                <span className={styles.factAsk}>{q.prompt}</span>
                <span className={styles.factToggle}>Fact pattern <ChevronRight size={14} /></span>
              </summary>
              <div className={styles.factStem}>{paras(q.stem)}</div>
            </details>

            {!ok && chosen && (
              <section className={styles.rsec}>
                <span className={`${styles.rLabel} ${styles.rLabelBad}`}>Your answer</span>
                <div className={`${styles.rcard} ${styles.rcardBad}`}>
                  <div className={styles.rHead}><span className={`${styles.letter} ${styles.letterBad}`}>{chosen.id}</span><p className={styles.rText}>{chosen.text}</p></div>
                  <p className={styles.rWhy}>{chosen.why}</p>
                </div>
              </section>
            )}

            <section className={styles.rsec}>
              <span className={`${styles.rLabel} ${styles.rLabelOk}`}>{ok ? "Why it’s right" : "Correct answer"}</span>
              <div className={`${styles.rcard} ${styles.rcardOk}`}>
                <div className={styles.rHead}><span className={`${styles.letter} ${styles.letterOkBig}`}><Check size={15} strokeWidth={3} /></span><p className={styles.rText}>{right.text}</p></div>
                <p className={styles.rWhy}>{right.why}</p>
              </div>
            </section>

            {q.rule && (
              <section className={styles.rsec}>
                <span className={styles.rLabel}>Rule</span>
                <div className={styles.rule}>
                  <p>{q.rule}</p>
                  {q.authority && <small>{q.authority}</small>}
                </div>
              </section>
            )}

            <div className={styles.aiRow}>
              <button className={styles.aiBtn} onClick={() => { haptic(); setAsking(true); }}>
                <MessageCircle size={17} /> Ask about this
              </button>
              {onHarder && (
                <button className={styles.aiBtn} disabled={harder !== "idle"} onClick={makeHarder}>
                  {harder === "busy" ? <span className={styles.dots}><i /><i /><i /></span> : harder === "added" ? <Check size={17} /> : <TrendingUp size={17} />}
                  {harder === "busy" ? "Writing…" : harder === "added" ? "Up next" : "Harder version"}
                </button>
              )}
            </div>

            {others.length > 0 && (
              <section className={styles.rsec}>
                <span className={styles.rLabel}>Other choices</span>
                <div className={styles.otherList}>
                  {others.map((c) => (
                    <details key={c.id} className={styles.other}>
                      <summary>
                        <span className={styles.letterSm}>{c.id}</span>
                        <span className={styles.otherMain}><b>{ROLE_LABEL[c.role]}</b><span>{c.text}</span></span>
                        <ChevronRight size={15} className={styles.otherChev} />
                      </summary>
                      <p className={styles.rWhy}>{c.why}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}

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
        )}
      </div>

      {!done && !reviewing && (
        <div className={`${styles.foot} ${sel && !checked ? styles.footOn : ""}`} aria-hidden={!sel}>
          <div className={styles.footIn}>
            <Button className={`${styles.big} ${styles.cta}`} disabled={!sel || checked} onClick={check}>
              {mode === "exam" ? (i === items.length - 1 ? "Finish" : "Next") : "Check answer"}
            </Button>
          </div>
        </div>
      )}

      {reviewing && (
        <div className={`${styles.foot} ${styles.footOn} ${styles.reviewFoot}`}>
          <div className={`${styles.footIn} ${styles.actions}`}>
            {!ai && (
              <>
                <button className={`${styles.iconBtn} ${p?.starred ? styles.starOn : ""}`} aria-label={p?.starred ? "Unstar" : "Star"} onClick={() => { haptic(); onStar(q, !p?.starred); }}>
                  <Star size={20} fill={p?.starred ? "currentColor" : "none"} />
                </button>
                <button className={`${styles.iconBtn} ${flagged ? styles.flagOn : ""}`} aria-label="Flag a problem" onClick={() => { if (flagged) return; setFlagOpen((v) => !v); setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 60); }}>
                  <Flag size={20} fill={flagged ? "currentColor" : "none"} />
                </button>
                {ok && (
                  <Button variant="secondary" className={styles.guess} disabled={guessed} onClick={() => { haptic(); onGuess(q); setGuessed(true); }}>
                    {guessed ? "Marked as a guess" : "I guessed"}
                  </Button>
                )}
              </>
            )}
            <Button className={`${styles.next} ${styles.cta}`} onClick={() => { haptic(); goNext(); }}>{i === items.length - 1 ? "See results" : "Next question"}</Button>
          </div>
        </div>
      )}

      {asking && !done && <AskPanel question={q} picked={sel} onClose={() => setAsking(false)} />}
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
  const R = 80;
  const circ = 2 * Math.PI * R;
  const [offset, setOffset] = useState(circ);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setOffset(circ * (1 - c / Math.max(n, 1))));
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !c) { setShown(c); return () => cancelAnimationFrame(t); }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 1000);
      setShown(Math.round(c * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(t); cancelAnimationFrame(raf); };
  }, [c, n, circ]);
  useEffect(() => { haptic(); }, []);
  const by: Record<string, { n: number; c: number }> = {};
  items.forEach((it, k) => { const b = (by[it.q.course] ||= { n: 0, c: 0 }); b.n++; if (results[k]) b.c++; });
  const [open, setOpen] = useState<number | null>(null);
  const perfect = n > 0 && c === n;

  return (
    <div className={styles.res}>
      <div className={`${styles.ring} ${perfect ? styles.ringPerfect : ""}`}>
        <svg viewBox="0 0 200 200">
          <defs>
            <linearGradient id="lawstinRing" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--uh-red-light)" }} />
              <stop offset="100%" style={{ stopColor: "var(--uh-red)" }} />
            </linearGradient>
          </defs>
          <circle className={styles.track} cx="100" cy="100" r={R} />
          <circle className={styles.val} cx="100" cy="100" r={R} style={{ strokeDasharray: circ, strokeDashoffset: offset }} />
        </svg>
        <div><b>{shown}<small>/{n}</small></b><span>correct</span></div>
      </div>
      <h1 className={styles.resTitle}>{mode === "exam" ? "Exam complete" : perfect ? "Perfect round" : "Round complete"}</h1>
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
        <Button className={`${styles.big} ${styles.cta}`} onClick={onAnother}>{mode === "exam" ? "New exam" : "Another round"}</Button>
        {missed.length > 0 && (
          <Button variant="secondary" className={styles.big} onClick={() => onRetry(missed.map((it) => ({ q: it.q, review: true })))}>Retry the {missed.length} missed</Button>
        )}
        <Button variant="ghost" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
