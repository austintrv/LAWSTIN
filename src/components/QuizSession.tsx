import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Star, Flag, ChevronLeft, ChevronRight, Check, MessageCircle, TrendingUp, Sparkles } from "lucide-react";
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
  /** Practice sessions keep going: returns more questions, skipping ones already in this session. */
  onMore?: (exclude: Set<string>) => RoundItem[];
  onAnother: () => void;
  onRetry: (items: RoundItem[]) => void;
  onClose: () => void;
  /** Writes a harder version of the question with AI; it is inserted right after the current one. */
  onHarder?: (q: QuestionDTO) => Promise<QuestionDTO | null>;
  className?: string;
};

const paras = (t: string) => t.split(/\n\s*\n/).map((p, i) => <p key={i}>{p.trim()}</p>);
const isAi = (q: QuestionDTO) => q.id.startsWith("ai-");

export function QuizSession({ items: initial, mode, getProgress, onAnswer, onStar, onGuess, onFlag, onMore, onAnother, onRetry, onClose, onHarder, className }: Props) {
  const [items, setItems] = useState(initial);
  const [i, setI] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  // Per-position answers, so going back shows that question's review exactly as it was.
  const [results, setResults] = useState<(boolean | undefined)[]>([]);
  const [picks, setPicks] = useState<(string | undefined)[]>([]);
  const [done, setDone] = useState(false);
  const [anim, setAnim] = useState<"in" | "out" | "back">("in");
  const [closing, setClosing] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagNote, setFlagNote] = useState("");
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState(false);
  const [harder, setHarder] = useState<Record<string, "busy" | "added">>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const item = items[Math.min(i, items.length - 1)];
  const q = item.q;
  const picked = picks[i];
  const checked = picked !== undefined;
  const answered = results.filter((r) => r !== undefined).length;
  const right = results.filter(Boolean).length;

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 380);
  }, [onClose]);

  const goTo = useCallback((n: number, dir: "out" | "back" = "out") => {
    setAnim(dir);
    setTimeout(() => {
      setI(n);
      setSel(null);
      setFlagOpen(false);
      setFlagNote("");
      setAsking(false);
      setAnim(dir === "back" ? "back" : "in");
      scrollRef.current?.scrollTo({ top: 0 });
    }, 170);
  }, []);

  const goNext = useCallback(() => {
    if (i + 1 < items.length) return goTo(i + 1);
    const more = mode === "practice" && onMore ? onMore(new Set(items.map((it) => it.q.id))) : [];
    if (more.length) {
      setItems((list) => [...list, ...more]);
      goTo(i + 1);
    } else {
      setAnim("out");
      setTimeout(() => { setDone(true); setAnim("in"); scrollRef.current?.scrollTo({ top: 0 }); }, 170);
    }
  }, [i, items, mode, onMore, goTo]);

  const goBack = useCallback(() => { if (i > 0) { haptic(); goTo(i - 1, "back"); } }, [i, goTo]);

  const check = useCallback(async () => {
    if (!sel || checked) return;
    const local = sel === q.answer;
    if (mode === "practice") haptic();
    const at = i;
    setResults((r) => { const n = [...r]; n[at] = local; return n; });
    setPicks((p) => { const n = [...p]; n[at] = sel; return n; });
    if (mode === "practice") {
      // Slide over to the review screen while the answer saves.
      setAnim("out");
      setTimeout(() => { setAnim("in"); scrollRef.current?.scrollTo({ top: 0 }); }, 170);
    }
    try { await onAnswer(q, sel); } catch { /* the toast in the parent reports it */ }
    if (mode === "exam") goNext();
  }, [sel, checked, q, i, mode, onAnswer, goNext]);

  const makeHarder = async () => {
    if (!onHarder || harder[q.id]) return;
    haptic();
    setHarder((h) => ({ ...h, [q.id]: "busy" }));
    const nq = await onHarder(q);
    if (!nq) { setHarder((h) => { const n = { ...h }; delete n[q.id]; return n; }); return; }
    setItems((list) => [...list.slice(0, i + 1), { q: nq, review: false }, ...list.slice(i + 1)]);
    setHarder((h) => ({ ...h, [q.id]: "added" }));
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
      } else if (e.key === "ArrowLeft" && !done && mode === "practice") goBack();
      else if (e.key === "ArrowRight" && !done && checked && mode === "practice") goNext();
      else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, checked, check, goNext, goBack, close, mode, asking]);

  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current; touch.current = null;
    if (!t || mode !== "practice" || done) return;
    const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dy) > 50) return;
    if (checked && dx < -70) goNext();
    else if (dx > 70) goBack();
  };
  const onTopTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current; touch.current = null;
    if (t && e.changedTouches[0].clientY - t.y > 70) close();
  };

  const p = getProgress(q.id);
  const shownPick = checked ? picked : sel;
  const chosen = q.choices.find((c) => c.id === picked);
  const answer = q.choices.find((c) => c.id === q.answer)!;
  const ok = picked === q.answer;
  const course = COURSES[q.course];
  const reviewing = checked && mode === "practice" && !done;
  const ai = isAi(q);
  const others = q.choices.filter((c) => c.id !== q.answer && c.id !== picked);
  const isGuess = guessed.has(q.id), isFlagged = flagged.has(q.id);
  const animCls = anim === "in" ? styles.in : anim === "back" ? styles.inBack : styles.out;

  return (
    <div className={`${styles.modal} ${closing ? styles.closing : ""} ${className ?? ""}`} role="dialog" aria-modal="true" aria-label={mode === "exam" ? "Practice exam" : "Practice"}>
      <div className={styles.top} onTouchStart={onTouchStart} onTouchEnd={onTopTouchEnd}>
        <div className={styles.topIn}>
          <button className={styles.x} onClick={close} aria-label="Close"><X size={16} strokeWidth={2.4} /></button>
          {mode === "exam" ? (
            <>
              <div className={styles.prog}>
                {items.map((_, k) => <i key={k} className={results[k] !== undefined ? styles.done : k === i ? styles.cur : ""} />)}
              </div>
              <span className={styles.count}>{done ? "" : `${i + 1} of ${items.length}`}</span>
            </>
          ) : (
            <>
              <button className={styles.x} onClick={goBack} disabled={i === 0 || done} aria-label="Previous question"><ChevronLeft size={18} strokeWidth={2.4} /></button>
              <div className={styles.tally} aria-live="polite">
                {answered > 0 && <><span className={styles.tallyOk}><Check size={13} strokeWidth={3} />{right}</span><span className={styles.tallyBad}><X size={13} strokeWidth={3} />{answered - right}</span></>}
              </div>
            </>
          )}
        </div>
      </div>

      <div className={styles.scroll} ref={scrollRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {done ? (
          <Results items={items} results={results} picks={picks} mode={mode} onAnother={onAnother} onRetry={onRetry} onClose={close} />
        ) : !reviewing ? (
          <div className={`${styles.body} ${animCls}`} key={`q-${i}-${q.id}`}>
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
                <button key={c.id} className={`${styles.choice} ${c.id === shownPick ? styles.selected : ""}`} disabled={checked} aria-pressed={c.id === shownPick}
                  onClick={() => { haptic(); setSel((cur) => (cur === c.id ? null : c.id)); }}>
                  <span className={styles.letter}>{c.id}</span>
                  <span className={styles.choiceText}>{c.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={`${styles.body} ${styles.review} ${animCls}`} key={`r-${i}-${q.id}`}>
            <header className={styles.verdict}>
              <span className={`${styles.vBig} ${ok ? styles.vOk : styles.vBad}`}>{ok ? <Check size={20} strokeWidth={3} /> : <X size={20} strokeWidth={3} />}</span>
              <div>
                <h2>{ok ? "Correct" : "Not quite"}</h2>
                <span>{ok ? `${answer.id} was the answer` : `You chose ${picked}`}</span>
              </div>
            </header>

            <details className={styles.rc}>
              <summary className={styles.factHead}>
                <span className={styles.label}><i style={{ background: course.color }} />{course.short} · {q.subtopic ?? q.topic}</span>
                <span className={styles.strong}>{q.prompt}</span>
                <span className={styles.factToggle}>Fact pattern <ChevronRight size={15} /></span>
              </summary>
              <div className={styles.factStem}>{paras(q.stem)}</div>
            </details>

            {!ok && chosen && (
              <section className={`${styles.rc} ${styles.answerCard}`}>
                <span className={`${styles.label} ${styles.labelBad}`}><span className={`${styles.letterSm} ${styles.letterBad}`}>{chosen.id}</span>Your answer · {ROLE_LABEL[chosen.role]}</span>
                <p className={styles.strong}>{chosen.text}</p>
                <p className={styles.bodyText}>{chosen.why}</p>
              </section>
            )}

            <section className={`${styles.rc} ${styles.answerCard}`}>
              <span className={`${styles.label} ${styles.labelOk}`}><span className={`${styles.letterSm} ${styles.letterOk}`}>{answer.id}</span>{ok ? "Why it’s right" : "Correct answer"}</span>
              <p className={styles.strong}>{answer.text}</p>
              <p className={styles.bodyText}>{answer.why}</p>
            </section>

            {q.rule && (
              <section className={`${styles.rc} ${styles.answerCard}`}>
                <span className={styles.label}>Rule</span>
                <p className={styles.bodyText}>{q.rule}</p>
                {q.authority && <span className={styles.authority}>{q.authority}</span>}
              </section>
            )}

            {others.length > 0 && (
              <section className={`${styles.rc} ${styles.listCard}`}>
                {others.map((c) => (
                  <details key={c.id} className={styles.other}>
                    <summary>
                      <span className={styles.letterSm}>{c.id}</span>
                      <span className={styles.otherMain}><span className={styles.label}>{ROLE_LABEL[c.role]}</span><span className={styles.bodyText}>{c.text}</span></span>
                      <ChevronRight size={16} className={styles.otherChev} />
                    </summary>
                    <p className={`${styles.bodyText} ${styles.otherWhy}`}>{c.why}</p>
                  </details>
                ))}
              </section>
            )}

            <section className={`${styles.rc} ${styles.listCard}`}>
              <button className={styles.listRow} onClick={() => { haptic(); setAsking(true); }}>
                <span className={styles.rowIcon}><MessageCircle size={17} /></span><span className={styles.strong}>Ask about this</span><ChevronRight size={16} className={styles.otherChev} />
              </button>
              {onHarder && (
                <button className={styles.listRow} disabled={!!harder[q.id]} onClick={makeHarder}>
                  <span className={styles.rowIcon}>{harder[q.id] === "busy" ? <span className={styles.dots}><i /><i /><i /></span> : harder[q.id] === "added" ? <Check size={17} /> : <TrendingUp size={17} />}</span>
                  <span className={styles.strong}>{harder[q.id] === "busy" ? "Writing a harder version…" : harder[q.id] === "added" ? "Harder version is up next" : "Harder version"}</span>
                  {!harder[q.id] && <ChevronRight size={16} className={styles.otherChev} />}
                </button>
              )}
            </section>

            {p && p.seen > 1 && (
              <p className={styles.history}>Seen {p.seen} times · {p.correct} right · {p.wrong} missed</p>
            )}
            {flagOpen && !isFlagged && (
              <div className={styles.flagBox}>
                <Textarea value={flagNote} onChange={(e) => setFlagNote(e.target.value)} placeholder="What’s wrong with this question?" autoFocus />
                <Button variant="secondary" onClick={() => { onFlag(q, flagNote); setFlagged((f) => new Set(f).add(q.id)); setFlagOpen(false); }}>Send flag</Button>
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
                <button className={`${styles.iconBtn} ${isFlagged ? styles.flagOn : ""}`} aria-label="Flag a problem" onClick={() => { if (isFlagged) return; setFlagOpen((v) => !v); setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 60); }}>
                  <Flag size={20} fill={isFlagged ? "currentColor" : "none"} />
                </button>
                {ok && (
                  <Button variant="secondary" className={styles.guess} disabled={isGuess} onClick={() => { haptic(); onGuess(q); setGuessed((g) => new Set(g).add(q.id)); }}>
                    {isGuess ? "Marked as a guess" : "I guessed"}
                  </Button>
                )}
              </>
            )}
            <Button className={`${styles.next} ${styles.cta}`} onClick={() => { haptic(); goNext(); }}>Next question</Button>
          </div>
        </div>
      )}

      {asking && !done && <AskPanel question={q} picked={picked ?? null} onClose={() => setAsking(false)} />}
    </div>
  );
}

function Results({ items: all, results, picks, mode, onAnother, onRetry, onClose }: {
  items: RoundItem[]; results: (boolean | undefined)[]; picks: (string | undefined)[]; mode: QuizMode;
  onAnother: () => void; onRetry: (items: RoundItem[]) => void; onClose: () => void;
}) {
  // Only answered questions count; a practice session can end anywhere.
  const items = mode === "exam" ? all : all.filter((_, k) => results[k] !== undefined);
  const res = mode === "exam" ? results : results.filter((r) => r !== undefined);
  const n = items.length;
  const c = res.filter(Boolean).length;
  const missed = items.filter((_, k) => res[k] === false);
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
  items.forEach((it, k) => { const b = (by[it.q.course] ||= { n: 0, c: 0 }); b.n++; if (res[k]) b.c++; });
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
      <h1 className={styles.resTitle}>{mode === "exam" ? "Exam complete" : "All caught up"}</h1>
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
        {mode === "exam" && <Button className={`${styles.big} ${styles.cta}`} onClick={onAnother}>New exam</Button>}
        {missed.length > 0 && (
          <Button variant="secondary" className={styles.big} onClick={() => onRetry(missed.map((it) => ({ q: it.q, review: true })))}>Retry the {missed.length} missed</Button>
        )}
        <Button variant="ghost" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
