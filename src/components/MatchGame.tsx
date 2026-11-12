import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Check, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { Aura, auraHost } from "./Aura";
import { useModalFocus } from "../helpers/useModalFocus";
import { useBackClose } from "../helpers/useBackClose";
import { haptic } from "../helpers/haptics";
import { COURSES, COURSE_KEYS, type CourseCode } from "../helpers/studyEngine";
import { matchPairs, matchRound, MIN_ROUND, type MatchCourse, type MatchPair, type MatchRound } from "../helpers/matchPairs";
import type { QuestionDTO } from "../endpoints/state_GET.schema";
import styles from "./MatchGame.module.css";

const BEST = "lawstin-match-best";
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const loadBest = (): Record<string, number> => {
  try { const v = JSON.parse(localStorage.getItem(BEST) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
};
const saveBest = (v: Record<string, number>) => { try { localStorage.setItem(BEST, JSON.stringify(v)); } catch { /* storage unavailable */ } };

/** True when the questions hold enough rules and labels to build a round. */
export function canMatch(questions: QuestionDTO[]): boolean {
  return matchPairs(questions, "all").length >= MIN_ROUND;
}

type Props = {
  questions: QuestionDTO[];
  course?: MatchCourse;
  onClose: () => void;
  onRound?: (result: { pairs: number; misses: number; seconds: number }) => void;
};
type Pick = { side: "l" | "r"; id: string };
type Result = { seconds: number; misses: number; best: number | null; isBest: boolean };

function Named({ p, full }: { p: MatchPair; full?: boolean }) {
  return <>
    <span className={styles.name}>{p.name}</span>
    {p.cite && <span className={styles.cite}>{p.cite}</span>}
    {full && <span className={styles.full}>{p.rule}</span>}
  </>;
}

export function MatchGame({ questions, course: openCourse = "all", onClose, onRound }: Props) {
  const modalRef = useModalFocus<HTMLDivElement>();
  const [closing, setClosing] = useState(false);
  const close = () => { setClosing(true); setTimeout(onClose, 360); };
  useBackClose(close);

  // Only courses that can fill a round are offered.
  const options = useMemo(() => {
    const ok = (c: MatchCourse) => matchPairs(questions, c).length >= MIN_ROUND;
    return (["all", ...COURSE_KEYS] as MatchCourse[]).filter(ok);
  }, [questions]);

  const used = useRef(new Set<string>());
  const draw = useCallback((c: MatchCourse): MatchRound | null => {
    const pairs = matchPairs(questions, c);
    let r = matchRound(pairs.filter((p) => !used.current.has(p.id)));
    if (!r) { used.current.clear(); r = matchRound(pairs); }
    r?.pairs.forEach((p) => used.current.add(p.id));
    return r;
  }, [questions]);

  const [course, setCourse] = useState<MatchCourse>(() => (options.includes(openCourse) ? openCourse : options[0] ?? "all"));
  const [round, setRound] = useState<MatchRound | null>(() => draw(course));
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState<Pick | null>(null);
  const [wrong, setWrong] = useState<{ l: string; r: string } | null>(null);
  const [misses, setMisses] = useState(0);
  const [missed, setMissed] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<string[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const timers = useRef<number[]>([]);
  const next = useRef<HTMLButtonElement>(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => { if (!document.hidden) setSeconds((s) => s + 1); }, 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => { if (result) next.current?.focus({ preventScroll: true }); }, [result]);

  const start = (c: MatchCourse) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRound(draw(c));
    setMatched(new Set()); setOrder([]); setMissed(new Set()); setPick(null); setWrong(null); setMisses(0); setSeconds(0); setResult(null); setRunning(true);
  };
  const choose = (c: MatchCourse) => { if (c === course) return; haptic(); used.current.clear(); setCourse(c); start(c); };

  const finish = (took: number, missed: number, size: number) => {
    setRunning(false);
    let best: number | null = null;
    let isBest = false;
    const all = loadBest();
    const prev = all[String(size)];
    best = typeof prev === "number" ? prev : null;
    if (missed === 0 && (best === null || took < best)) { all[String(size)] = took; saveBest(all); best = took; isBest = true; }
    onRound?.({ pairs: size, misses: missed, seconds: took });
    // Let the last match settle before the result takes its place.
    timers.current.push(window.setTimeout(() => setResult({ seconds: took, misses: missed, best, isBest }), 650));
  };

  const tap = (side: "l" | "r", id: string) => {
    if (!round || !running || matched.has(id)) return;
    if (!pick || pick.side === side) {
      haptic();
      setWrong(null);
      setPick(pick && pick.side === side && pick.id === id ? null : { side, id });
      return;
    }
    const l = side === "l" ? id : pick.id;
    const r = side === "r" ? id : pick.id;
    setPick(null);
    if (l === r) {
      haptic();
      setWrong(null);
      const now = new Set(matched).add(l);
      setMatched(now);
      setOrder((o) => [...o, l]);
      if (now.size === round.pairs.length) finish(seconds, misses, round.pairs.length);
    } else {
      setMisses((m) => m + 1);
      setMissed((m) => new Set(m).add(l).add(r));
      setWrong({ l, r });
      timers.current.push(window.setTimeout(() => setWrong((w) => (w && w.l === l && w.r === r ? null : w)), 1600));
    }
  };

  const byId = (id: string) => round?.pairs.find((p) => p.id === id);
  const openTopic = (p: MatchPair) => { haptic(); window.location.hash = `#/tool/Topic/${p.course}/${encodeURIComponent(p.topic)}`; onClose(); };

  const cls = (side: "l" | "r", id: string) => {
    const on = pick && pick.side === side && pick.id === id ? styles.on : "";
    const bad = wrong && wrong[side] === id ? styles.bad : "";
    return `${styles.item} ${side === "l" ? styles.tile : styles.rule} ${on} ${bad}`;
  };

  return (
    <div ref={modalRef} tabIndex={-1} className={`${styles.modal} ${closing ? styles.closing : ""}`} role="dialog" aria-modal="true" aria-label="Match">
      <div className={styles.top}>
        <div className={styles.topIn}>
          <span className={styles.spacer} />
          <span className={styles.topTitle}>Match</span>
          <button className={styles.x} onClick={close} aria-label="Close"><X size={17} strokeWidth={2.4} /></button>
        </div>
      </div>

      <div className={styles.scroll}>
        <div className={styles.body}>
          {round && <span className={styles.clock} role="timer">{clock(result ? result.seconds : seconds)}</span>}
          {!round ? (
            <div className={styles.empty}><h2>No rules to match yet</h2></div>
          ) : (
            <>
              {options.length > 1 && (
                <div className={styles.seg} role="group" aria-label="Course">
                  {options.map((c) => (
                    <button key={c} aria-pressed={course === c} className={course === c ? styles.segOn : ""} onClick={() => choose(c)}>
                      {c === "all" ? "All" : COURSES[c as CourseCode].short}
                    </button>
                  ))}
                </div>
              )}

              {result ? (
                <div className={`${styles.result} finish`}>
                  <h2>Session complete</h2>
                  <div className={`${styles.hero} ${auraHost}`}>
                    <Aura colors={result.isBest ? ["var(--success)", "var(--uh-red)", "var(--success)"] : ["var(--uh-red)", "var(--course-il)", "var(--uh-red-light)"]} />
                    <b>{clock(result.seconds)}</b>
                  </div>
                  <div className={styles.card}>
                    <div className={styles.row}><span>Misses</span><span className={result.misses === 0 ? styles.ok : ""}>{result.misses === 0 ? "Perfect" : result.misses}</span></div>
                    {result.best !== null && (
                      <div className={styles.row}><span>{result.isBest ? "New best" : "Best"}</span><span className={result.isBest ? styles.ok : ""}>{clock(result.best)}</span></div>
                    )}
                  </div>
                  <div className={styles.card}>
                    {[...round.pairs].sort((a, b) => Number(missed.has(b.id)) - Number(missed.has(a.id))).map((p) => (
                      <button key={p.id} className={styles.review} onClick={() => openTopic(p)}>
                        <Named p={p} full />
                        <ChevronRight className={styles.go} size={16} />
                      </button>
                    ))}
                  </div>
                  <div className={styles.actions}>
                    <Button ref={next} className={`${styles.big} ${styles.cta}`} onClick={() => { haptic(); start(course); }}>Next round</Button>
                    <Button variant="secondary" className={styles.big} onClick={() => { haptic(); close(); }}>Done</Button>
                  </div>
                </div>
              ) : (
                <>
                  {order.length > 0 && (
                    <div className={styles.joined}>
                      {order.map((id) => { const p = byId(id)!; return <div key={id} className={`${styles.item} ${styles.pairCard}`}><Check className={styles.check} size={16} strokeWidth={3} /><Named p={p} full /></div>; })}
                    </div>
                  )}
                  <div className={styles.board} role="group" aria-label="Match each rule to its name">
                    <div className={`${styles.col} ${styles.colL}`}>
                      {round.names.filter((p) => !matched.has(p.id)).map((p) => (
                        <button key={p.id} className={cls("l", p.id)} aria-pressed={pick?.side === "l" && pick.id === p.id} onClick={() => tap("l", p.id)}>
                          <span className={styles.text}><Named p={p} /></span>
                        </button>
                      ))}
                    </div>
                    <div className={`${styles.col} ${styles.colR}`}>
                      {round.rules.filter((p) => !matched.has(p.id)).map((p) => (
                        <button key={p.id} className={cls("r", p.id)} aria-pressed={pick?.side === "r" && pick.id === p.id} onClick={() => tap("r", p.id)}>
                          <span className={styles.text}>
                            <span className={styles.sentence}>{p.sentence}</span>
                            {wrong?.r === p.id && <span className={styles.cite}>{p.name}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
