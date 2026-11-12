import { answerFeedback, confirmFeedback } from "../helpers/feedback";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Aura, auraHost } from "./Aura";
import { useModalFocus } from "../helpers/useModalFocus";
import { X, Star, Flag, Grid2X2, CircleHelp, ChevronLeft, ChevronRight, Check, MessageCircle, TrendingUp, Sparkles, RotateCcw, Minus, CalendarDays, Flame } from "lucide-react";
import { Button } from "./Button";
import { Textarea } from "./Textarea";
import { AskPanel } from "./AskPanel";
import type { QuestionDTO, ProgressDTO } from "../endpoints/state_GET.schema";
import type { ExplainDTO } from "../endpoints/ai_POST.schema";
import { COURSES, FINALS, examDue, itemCourse, itemId, itemTopic, type RoundItem, type SessionCard } from "../helpers/studyEngine";
import { dateKey } from "../helpers/dateKey";
import { reviewSchedule } from "../helpers/reviewSchedule";
import { haptic } from "../helpers/haptics";
import { afterOverlayClose, useBackClose } from "../helpers/useBackClose";
import { BottomSheet } from "./BottomSheet";
import { ANSWER_LABEL } from "../helpers/missedRules";
import { writeCache } from "../helpers/offlineCache";
import { examSummary, takeExamResume, clearExamResume, useExams, examDate, type ActiveExam, type ExamEntry } from "../helpers/useExams";
import { toast } from "../helpers/toast";
import { useLawstinData } from "../helpers/useLawstinData";
import styles from "./QuizSession.module.css";

export type QuizMode = "practice" | "exam";

type Props = {
  items: RoundItem[];
  mode: QuizMode;
  getProgress: (id: string) => ProgressDTO | undefined;
  onAnswer: (q: QuestionDTO, choice: string) => Promise<boolean>;
  /** A recall card graded: moves its review date and counts toward the day. */
  onCard: (card: SessionCard, correct: boolean) => void;
  /** Checks a typed explanation of a card against its answer. Null when the tutor is unavailable. */
  onExplain?: (card: SessionCard, answer: string) => Promise<ExplainDTO | null>;
  /** Practice asks for an answer in your own words before the choices appear. */
  recallFirst?: boolean;
  /** Exam time limit in seconds. */
  seconds?: number;
  /** Offered on the results screen, such as an essay due today. */
  after?: { label: string; onGo: () => void }[];
  onStar: (q: QuestionDTO, starred: boolean) => void;
  onGuess: (q: QuestionDTO) => void;
  onFlag: (q: QuestionDTO, note: string) => void;
  /** Practice sessions keep going: returns more items, skipping ones already in this session. */
  onMore?: (exclude: Set<string>) => RoundItem[];
  onAnother: () => void;
  onRetry: (items: RoundItem[]) => void;
  /** Gets where the session stood (unless it was finished), so reopening it can pick up there. */
  onClose: (snapshot?: QuizSnapshot) => void;
  /** A session closed earlier, reopened where it left off. */
  resume?: QuizSnapshot;
  onCheckpoint?: (snapshot?: QuizSnapshot) => void;
  /** Writes a harder version of the question with AI; it is inserted right after the current one. */
  onHarder?: (q: QuestionDTO) => Promise<QuestionDTO | null>;
  /** Practice: today's live counts from the parent, drawn as a goal bar and a compact count. */
  day?: { answered: number; goal: number };
  className?: string;
};

export type QuizSnapshot = { items: RoundItem[]; i: number; picks: (string | undefined)[]; results: (boolean | undefined)[]; shown?: (boolean | undefined)[]; typed?: (string | undefined)[] };

const paras = (t: string) => t.split(/\n\s*\n/).map((p, i) => <p key={i}>{p.trim()}</p>);
const isAi = (q: QuestionDTO) => q.id.startsWith("ai-");
const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
/** Consecutive correct results in position order (a miss resets): the run now and the longest. */
const runsOf = (results: (boolean | undefined)[]) => {
  let cur = 0, best = 0;
  for (const r of results) {
    if (r === undefined) continue;
    cur = r ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return { cur, best };
};
/** Why a question is showing: built from its progress before this answer. */
function whyPill(p: ProgressDTO | undefined, guessed: boolean): { text: string; tone: "new" | "bad" | "ok" } {
  if (!p || !p.seen || !p.lastAt) return { text: "New", tone: "new" };
  const today = dateKey.today();
  const day = dateKey.today(new Date(p.lastAt));
  const n = dateKey.diff(day, today);
  const when = n <= 0 ? "today" : n === 1 ? "yesterday" : n < 7 ? `${n} days ago` : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (p.lastCorrect === false) return { text: `Missed ${when}`, tone: "bad" };
  if (guessed) return { text: "Guessed last time", tone: "ok" };
  return { text: `Right ${when}`, tone: "ok" };
}
const VERDICT: Record<ExplainDTO["verdict"], string> = { solid: "Solid", partial: "Partly there", off: "Not yet" };

export function QuizSession(props: Props) {
  return props.mode === "exam" ? <ExamSession {...props} /> : <PracticeSession {...props} />;
}

function PracticeSession({ items: initial, getProgress, onAnswer, onCard, onExplain, recallFirst, after, onStar, onGuess, onFlag, onMore, onAnother, onRetry, onClose, onHarder, resume, onCheckpoint, day, className }: Props) {
  const [items, setItems] = useState(resume?.items ?? initial);
  const [i, setI] = useState(resume?.i ?? 0);
  const [sel, setSel] = useState<string | null>(null);
  // Per-position answers, so going back shows that item's review exactly as it was.
  const [results, setResults] = useState<(boolean | undefined)[]>(resume?.results ?? []);
  const [picks, setPicks] = useState<(string | undefined)[]>(resume?.picks ?? []);
  const recorded = useRef(new Set((resume?.items ?? []).filter((_, k) => resume?.picks[k] != null).map(itemId)));
  // Per position: choices (or a card's answer) revealed, and what was typed before revealing.
  const [shown, setShown] = useState<(boolean | undefined)[]>(resume?.shown ?? []);
  const [typed, setTyped] = useState<(string | undefined)[]>(resume?.typed ?? []);
  const [feedback, setFeedback] = useState<Record<number, ExplainDTO>>({});
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const moving = useRef(false);
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
  const modalRef = useModalFocus<HTMLDivElement>();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const item = items[Math.min(i, items.length - 1)];
  const card = item.card;
  const q = item.q;
  const picked = picks[i];
  const checked = picked !== undefined;
  const answered = results.filter((r) => r !== undefined).length;
  const right = results.filter(Boolean).length;
  const { cur: run } = runsOf(results);
  const prevRun = useRef(run);
  useEffect(() => {
    if (run > prevRun.current && (run === 5 || run === 10)) haptic();
    prevRun.current = run;
  }, [run]);
  const goalOn = !!day && day.goal > 0;
  const goalMet = goalOn && day!.answered >= day!.goal;
  const before = useRef<Record<string, ProgressDTO | undefined>>({});
  if (item.q && !checked && !(item.q.id in before.current)) before.current[item.q.id] = getProgress(item.q.id);
  const mine = typed[i]?.trim() ?? "";
  // A card is in review once its answer is showing; a question once it has been answered.
  const revealed = !!shown[i] || checked;
  const hidden = !!recallFirst && !!q && !revealed;
  const reviewing = !done && (card ? revealed : checked);

  const snapshot = useRef<QuizSnapshot | undefined>(undefined);
  snapshot.current = done ? undefined : { items, i, picks, results, shown, typed };
  const checkpoint = useRef(onCheckpoint);
  checkpoint.current = onCheckpoint;
  useEffect(() => { checkpoint.current?.(snapshot.current); }, [items, i, picks, results, shown, typed, done]);
  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => onClose(snapshot.current), 380);
  }, [onClose]);
  useBackClose(close);

  const goTo = useCallback((n: number, dir: "out" | "back" = "out") => {
    if (moving.current || submitting.current) return;
    moving.current = true;
    setAnim(dir);
    setTimeout(() => {
      setI(n);
      setSel(null);
      setFlagOpen(false);
      setFlagNote("");
      setAsking(false);
      setAnim(dir === "back" ? "back" : "in");
      scrollRef.current?.scrollTo({ top: 0 });
      moving.current = false;
    }, 170);
  }, []);

  const goNext = useCallback(() => {
    if (moving.current || submitting.current) return;
    if (i + 1 < items.length) return goTo(i + 1);
    const more = onMore ? onMore(new Set(items.map(itemId))) : [];
    if (more.length) {
      setItems((list) => [...list, ...more]);
      goTo(i + 1);
    } else {
      moving.current = true;
      setAnim("out");
      setTimeout(() => { setDone(true); setAnim("in"); moving.current = false; scrollRef.current?.scrollTo({ top: 0 }); }, 170);
    }
  }, [i, items, onMore, goTo]);

  const goBack = useCallback(() => {
    if (done) { haptic(); setAnim("back"); setDone(false); return; }
    if (i > 0) { haptic(); goTo(i - 1, "back"); }
  }, [i, done, goTo]);
  const reopen = useCallback((k: number) => { haptic(); setDone(false); setI(k); setAnim("back"); scrollRef.current?.scrollTo({ top: 0 }); }, []);

  const slide = () => { setAnim("out"); setTimeout(() => { setAnim("in"); scrollRef.current?.scrollTo({ top: 0 }); }, 170); };

  // Shows a question's choices, or a card's answer. A typed explanation of a card is checked first.
  const reveal = useCallback(async () => {
    if (revealed || checking) return;
    haptic();
    const at = i;
    if (card && mine && onExplain) {
      setChecking(true);
      const fb = await onExplain(card, mine);
      setChecking(false);
      if (fb) setFeedback((f) => ({ ...f, [at]: fb }));
    }
    setShown((v) => { const n = [...v]; n[at] = true; return n; });
    if (card) slide();
  }, [revealed, checking, i, card, mine, onExplain]);

  const gradeCard = useCallback(async (ok: boolean) => {
    if (!card || checked || moving.current || recorded.current.has(card.id)) return;
    recorded.current.add(card.id);
    haptic();
    const at = i;
    await confirmFeedback(modalRef.current?.querySelector("[data-card-feedback]"));
    setResults((r) => { const n = [...r]; n[at] = ok; return n; });
    setPicks((p) => { const n = [...p]; n[at] = ok ? "Y" : "N"; return n; });
    onCard(card, ok);
    goNext();
  }, [card, checked, i, onCard, goNext]);

  const check = useCallback(async () => {
    if (!q || !sel || checked || submitting.current || moving.current || recorded.current.has(q.id)) return;
    submitting.current = true;
    setSaving(true);
    haptic();
    const at = i;
    try {
      const correct = await onAnswer(q, sel);
      await answerFeedback(modalRef.current, sel, q.answer);
      recorded.current.add(q.id);
      setResults((r) => { const n = [...r]; n[at] = correct; return n; });
      setPicks((p) => { const n = [...p]; n[at] = sel; return n; });
      submitting.current = false;
      slide();
    } catch { /* The parent reports the error. Keep this question open for a retry. */ }
    finally { submitting.current = false; setSaving(false); }
  }, [sel, checked, q, i, onAnswer]);

  const makeHarder = async () => {
    if (!q || !onHarder || harder[q.id]) return;
    haptic();
    setHarder((h) => ({ ...h, [q.id]: "busy" }));
    const nq = await onHarder(q);
    if (!nq) { setHarder((h) => { const n = { ...h }; delete n[q.id]; return n; }); return; }
    setItems((list) => [...list.slice(0, i + 1), { q: nq, review: false }, ...list.slice(i + 1)]);
    // This can be requested from a previous review; preserve every later item's own answers.
    setPicks((v) => { const n = [...v]; n.splice(i + 1, 0, undefined); return n; });
    setResults((v) => { const n = [...v]; n.splice(i + 1, 0, undefined); return n; });
    setShown((v) => { const n = [...v]; n.splice(i + 1, 0, undefined); return n; });
    setTyped((v) => { const n = [...v]; n.splice(i + 1, 0, undefined); return n; });
    setFeedback((v) => Object.fromEntries(Object.entries(v).map(([k, fb]) => [Number(k) > i ? Number(k) + 1 : Number(k), fb])));
    setHarder((h) => ({ ...h, [q.id]: "added" }));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (asking) return;
      if (submitting.current || moving.current || e.repeat) return;
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const k = e.key.toUpperCase();
      if (done) { if (e.key === "ArrowLeft") goBack(); return; }
      if (e.key === "ArrowLeft") { goBack(); return; }
      if (card) {
        if (!revealed) { if (e.key === "Enter" || e.code === "Space") { e.preventDefault(); void reveal(); } return; }
        if (!checked) { if (k === "1") gradeCard(false); else if (k === "2" || e.key === "Enter") { e.preventDefault(); gradeCard(true); } return; }
        if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); goNext(); }
        return;
      }
      if (hidden) { if (e.key === "Enter" || e.code === "Space") { e.preventDefault(); void reveal(); } return; }
      if (!checked && ["A", "B", "C", "D", "1", "2", "3", "4"].includes(k)) {
        const pick = "ABCD"["1234".includes(k) ? Number(k) - 1 : "ABCD".indexOf(k)];
        setSel((cur) => (cur === pick ? null : pick));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (!checked) void check(); else goNext();
      } else if (e.key === "ArrowRight" && checked) goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, checked, check, goNext, goBack, asking, card, revealed, hidden, reveal, gradeCard]);

  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current; touch.current = null;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dy) > 50) return;
    if (done) { if (dx > 70) goBack(); return; }
    if (checked && dx < -70) goNext();
    else if (dx > 70) goBack();
  };
  const onTopTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current; touch.current = null;
    if (t && e.changedTouches[0].clientY - t.y > 70) close();
  };

  const p = q ? getProgress(q.id) : undefined;
  const shownPick = checked ? picked : sel;
  const chosen = q?.choices.find((c) => c.id === picked);
  const answer = q?.choices.find((c) => c.id === q.answer);
  const ok = card ? results[i] === true : picked === q!.answer;
  const course = COURSES[itemCourse(item)];
  const ai = !!q && isAi(q);
  const others = q ? q.choices.filter((c) => c.id !== q.answer && c.id !== picked) : [];
  const isGuess = !!q && (guessed.has(q.id) || !!p && p.guessed > 0 && p.box === 1 && p.lastCorrect === true);
  const isFlagged = !!q && (flagged.has(q.id) || !!p?.flagged);
  const nextDue = p?.due ? examDue(p.due, p.lastAt ? dateKey.today(new Date(p.lastAt)) : null, q ? FINALS[q.course] : undefined, dateKey.today()) : null;
  const animCls = anim === "in" ? styles.in : anim === "back" ? styles.inBack : styles.out;
  const fb = feedback[i];
  const setMine = (value: string) => setTyped((v) => { const n = [...v]; n[i] = value; return n; });
  const chip = <span className={styles.chip} style={{ color: course.color, background: `color-mix(in srgb, ${course.color} 14%, transparent)` }}>{course.short}</span>;

  return (
    <div ref={modalRef} tabIndex={-1} className={`${styles.modal} ${closing ? styles.closing : ""} ${className ?? ""}`} role="dialog" aria-modal="true" aria-label="Practice">
      <div className={styles.top} onTouchStart={onTouchStart} onTouchEnd={onTopTouchEnd}>
        <div className={`${styles.topIn} ${styles.practiceTop}`}>
              <div style={{display:"flex",gap:8}}><button className={styles.x} onClick={goBack} disabled={i === 0 && !done} aria-label="Previous"><ChevronLeft size={18} strokeWidth={2.4} /></button>{reviewing && q && !ai && <button className={`${styles.iconBtn} ${p?.starred ? styles.starOn : ""}`} aria-label={p?.starred ? "Unstar" : "Star"} onClick={() => { haptic(); onStar(q, !p?.starred); }}>
                  <Star size={20} fill={p?.starred ? "currentColor" : "none"} />
                </button>}</div>
              <span className={styles.practiceTitle}>{done ? "Results" : reviewing ? "Review" : "Practice"}</span>
              <button className={styles.x} onClick={close} aria-label="Close"><X size={16} strokeWidth={2.4} /></button>

        </div>
        <div className={styles.tally} aria-live="polite">
                {answered > 0 && <><span className={styles.tallyOk}><Check size={13} strokeWidth={3} />{right}</span><span className={styles.tallyBad}><X size={13} strokeWidth={3} />{answered - right}</span></>}
                {run >= 3 && <span key={run} className={`${styles.streak} ${[3,5,10].includes(run) ? styles.milestone : ""}`} role="img" aria-label={`${run} correct in a row`}><Flame size={14} strokeWidth={2.4} />{run}</span>}
                {goalOn && <span className={`${styles.dayCount} ${goalMet ? styles.dayMet : ""}`} aria-hidden="true">{goalMet && <Check size={13} strokeWidth={3} />}{goalMet ? day!.answered : `${day!.answered}/${day!.goal}`}</span>}
              </div>
        {goalOn && (
          <div className={styles.goalBar} role="progressbar" aria-label="Today’s goal" aria-valuemin={0} aria-valuemax={day!.goal} aria-valuenow={Math.min(day!.answered, day!.goal)}>
            <i className={goalMet ? styles.goalMet : ""} style={{ width: `${Math.min(1, day!.answered / day!.goal) * 100}%` }} />
          </div>
        )}
      </div>

      <div className={styles.scroll} ref={scrollRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {done ? (
          <Results items={items} results={results} picks={picks} mode="practice" after={after} onAnother={onAnother} onRetry={onRetry} onClose={close} onOpen={reopen} />
        ) : card && !reviewing ? (
          <div className={`${styles.body} ${styles.split} ${animCls}`} key={`c-${i}-${card.id}`} data-card-feedback>
            <span className={styles.courseLine} style={{ background: course.color }} aria-hidden="true" />
            <div className={styles.meta}>
              {chip}
              <span className={styles.pill}>{card.rule ? "Rule" : item.review ? "Review" : "Card"}</span>
              <span className={styles.topic}>{card.topic}</span>
            </div>
            <div className={styles.paneL}>
              <div className={styles.cardFront}>
                {card.rule && <span className={styles.label}>State the rule</span>}
                <h2>{card.front}</h2>
              </div>
            </div>
            <div className={styles.paneR}>
              <Textarea className={styles.recall} value={typed[i] ?? ""} onChange={(e) => setMine(e.target.value)} placeholder="Explain it in your own words" disabled={checking} />
            </div>
          </div>
        ) : card ? (
          <div className={`${styles.body} ${styles.review} ${styles.split} ${animCls}`} key={`cr-${i}-${card.id}`}>
            {(checked || fb) && (
              <header className={styles.verdict}>
                {checked
                  ? <span className={`${styles.vBig} ${ok ? styles.vOk : styles.vBad}`}>{ok ? <Check size={20} strokeWidth={3} /> : <RotateCcw size={18} strokeWidth={3} />}</span>
                  : <span className={`${styles.vBig} ${fb!.verdict === "solid" ? styles.vOk : fb!.verdict === "partial" ? styles.vMid : styles.vBad}`}>{fb!.verdict === "solid" ? <Check size={20} strokeWidth={3} /> : fb!.verdict === "partial" ? <Minus size={20} strokeWidth={3} /> : <X size={20} strokeWidth={3} />}</span>}
                <div><h2>{checked ? (ok ? "Got it" : "Back tomorrow") : VERDICT[fb!.verdict]}</h2></div>
              </header>
            )}
            <div className={styles.paneL}>
              <section className={`${styles.rc} ${styles.answerCard}`}>
                <span className={styles.label}><i style={{ background: course.color }} />{course.short} · {card.topic}</span>
                <p className={styles.strong}>{card.front}</p>
              </section>
            </div>
            <div className={styles.paneR}>
              {mine && (
                <section className={`${styles.rc} ${styles.answerCard}`}>
                  <span className={styles.label}>Your answer</span>
                  <p className={styles.bodyText}>{mine}</p>
                </section>
              )}
              <section className={`${styles.rc} ${styles.answerCard}`}>
                <span className={`${styles.label} ${styles.labelOk}`}>{card.rule ? "Rule" : "Answer"}</span>
                <p className={card.reason ? styles.strong : styles.bodyText}>{card.back}</p>
                {card.reason && <p className={styles.bodyText}>{card.reason}</p>}
                {card.authority && <span className={styles.authority}>{card.authority}</span>}
              </section>
              {fb && (fb.got.length > 0 || fb.gaps.length > 0 || fb.note) && (
                <section className={`${styles.rc} ${styles.answerCard}`}>
                  <span className={styles.label}>Feedback</span>
                  {fb.got.map((t, k) => <p key={`g${k}`} className={`${styles.bodyText} ${styles.fb}`}><span className={`${styles.mark} ${styles.markOk}`}><Check size={12} strokeWidth={3} /></span>{t}</p>)}
                  {fb.gaps.map((t, k) => <p key={`m${k}`} className={`${styles.bodyText} ${styles.fb}`}><span className={`${styles.mark} ${styles.markBad}`}><X size={12} strokeWidth={3} /></span>{t}</p>)}
                  {fb.note && <p className={styles.bodyText}>{fb.note}</p>}
                </section>
              )}
            </div>
          </div>
        ) : q && !reviewing ? (
          <div className={`${styles.body} ${styles.split} ${animCls}`} key={`q-${i}-${q.id}`}>
            <span className={styles.courseLine} style={{ background: course.color }} aria-hidden="true" />
            <div className={styles.meta}>
              {chip}
              {ai ? <span className={`${styles.pill} ${styles.aiPill}`}><Sparkles size={11} /> Harder</span> : (() => {
                const bp = before.current[q.id];
                const w = whyPill(bp, !!bp && bp.guessed > 0 && bp.box === 1 && bp.lastCorrect === true);
                return <details><summary className={`${styles.pill} ${w.tone === "bad" ? styles.pillBad : w.tone === "ok" ? styles.pillOk : ""}`}>{w.text}</summary>{bp && bp.seen > 0 && <span className={styles.authority}>Seen {bp.seen === 1 ? "once" : `${bp.seen} times`} · {bp.correct} right · {bp.wrong} missed</span>}</details>;
              })()}
              <span className={styles.topic}>{q.topic}{q.subtopic ? ` · ${q.subtopic}` : ""}</span>
            </div>
            <div className={styles.paneL}><div className={styles.stem}>{paras(q.stem)}</div></div>
            <div className={styles.paneR}>
              <p className={styles.ask}>{q.prompt}</p>
              {hidden ? (
                <Textarea className={styles.recall} value={typed[i] ?? ""} onChange={(e) => setMine(e.target.value)} placeholder="Your answer, before the choices" />
              ) : (
                <div className={styles.choices} role="group" aria-label="Answer choices">
                  {q.choices.map((c) => (
                    <button data-choice={c.id} key={c.id} className={`${styles.choice} ${c.id === shownPick ? styles.selected : ""}`} disabled={checked} aria-pressed={c.id === shownPick}
                      onClick={() => { if (submitting.current) return; haptic(); setSel((cur) => (cur === c.id ? null : c.id)); }}>
                      <span className={styles.letter}>{c.id}</span>
                      <span className={styles.choiceText}>{c.text}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : q && answer ? (
          <div className={`${styles.body} ${styles.review} ${styles.split} ${animCls}`} key={`r-${i}-${q.id}`}>
            <header className={styles.verdict}>
              <span className={`${styles.vBig} ${ok ? styles.vOk : styles.vBad}`}>{ok ? <Check size={20} strokeWidth={3} /> : <X size={20} strokeWidth={3} />}</span>
              <div>
                <h2>{ok ? "Correct" : "Not quite"}</h2>
                <span>{ok ? `${answer.id} was the answer` : `You chose ${picked}`}</span>
              </div>
            </header>

            <div className={styles.paneL}>
            <details className={styles.rc}>
              <summary className={styles.factHead}>
                <span className={styles.label}><i style={{ background: course.color }} />{course.short} · {q.subtopic ?? q.topic}</span>
                <span className={styles.strong}>{q.prompt}</span>
                <span className={styles.factToggle}>Fact pattern <ChevronRight size={15} /></span>
              </summary>
              <div className={styles.factStem}>{paras(q.stem)}</div>
            </details>
            {q.rule && (
              <section className={`${styles.rc} ${styles.answerCard}`}>
                <span className={styles.label}>Rule</span>
                <p className={styles.bodyText}>{q.rule}</p>
                {q.authority && <span className={styles.authority}>{q.authority}</span>}
              </section>
            )}
<button className={styles.listRow} onClick={() => { history.replaceState(history.state, "", `#/tool/Topic/${q.course}/${encodeURIComponent(q.topic)}`); window.dispatchEvent(new HashChangeEvent("hashchange")); }}>{q.topic}<ChevronRight size={16}/></button>
<section className={styles.rc}>              {!ai && nextDue && <div className={`${styles.listRow} ${styles.scheduleRow}`} role="status">
                <span className={styles.rowIcon}><CalendarDays size={17} /></span>
                <span className={styles.strong}>Next review</span>
                {p && p.box >= 1 && p.box <= 5 && (
                  <span className={styles.ladder} role="img" aria-label={`Step ${p.box} of 5`}>
                    {reviewSchedule.intervals.slice(1).map((d, k) => (
                      <span key={d} className={`${styles.step} ${k + 1 <= p.box ? (p.lastCorrect === false ? styles.stepBad : styles.stepOn) : ""} ${k + 1 === p.box ? styles.stepCur : ""}`}><i />{d}d</span>
                    ))}
                  </span>
                )}
                <span className={styles.scheduleDate}>{dateKey.diff(dateKey.today(), nextDue) === 1 ? "Tomorrow" : new Date(`${nextDue}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </div>}</section>
            </div>
            <div className={styles.paneR}>

            {mine && (
              <section className={`${styles.rc} ${styles.answerCard}`}>
                <span className={styles.label}>Your first answer</span>
                <p className={styles.bodyText}>{mine}</p>
              </section>
            )}

            {!ok && chosen && (
              <section className={`${styles.rc} ${styles.answerCard}`}>
                <span className={`${styles.label} ${styles.labelBad}`}><span className={`${styles.letterSm} ${styles.letterBad}`}>{chosen.id}</span>Your answer · {ANSWER_LABEL[chosen.role]}</span>
                <p className={styles.strong}>{chosen.text}</p>
                <p className={styles.bodyText}>{chosen.why}</p>
              </section>
            )}

            <section className={`${styles.rc} ${styles.answerCard}`}>
              <span className={`${styles.label} ${styles.labelOk}`}><span className={`${styles.letterSm} ${styles.letterOk}`}>{answer.id}</span>{ok ? "Why it’s right" : "Correct answer"}</span>
              <p className={styles.strong}>{answer.text}</p>
              <p className={styles.bodyText}>{answer.why}</p>
            </section>



            {others.length > 0 && (
              <section className={`${styles.rc} ${styles.listCard}`}>
                {others.map((c) => (
                  <details key={c.id} className={styles.other}>
                    <summary>
                      <span className={styles.letterSm}>{c.id}</span>
                      <span className={styles.otherMain}><span className={styles.label}>{ANSWER_LABEL[c.role]}</span><span className={styles.bodyText}>{c.text}</span></span>
                      <ChevronRight size={16} className={styles.otherChev} />
                    </summary>
                    <p className={`${styles.bodyText} ${styles.otherWhy}`}>{c.why}</p>
                  </details>
                ))}
              </section>
            )}

            <section className={`${styles.rc} ${styles.listCard}`}>

              {ok && !ai && (
                <button className={styles.listRow} disabled={isGuess} onClick={() => { haptic(); onGuess(q); setGuessed((g) => new Set(g).add(q.id)); }}>
                  <span className={styles.rowIcon}>{isGuess ? <Check size={17} /> : <CircleHelp size={17} />}</span>
                  <span className={styles.strong}>{isGuess ? "Marked as a guess" : "I guessed"}</span>
                </button>
              )}
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

            {flagOpen && !isFlagged && (
              <div className={styles.flagBox}>
                <Textarea value={flagNote} onChange={(e) => setFlagNote(e.target.value)} placeholder="What’s wrong with this question?" autoFocus />
                <Button variant="secondary" onClick={() => { onFlag(q, flagNote); setFlagged((f) => new Set(f).add(q.id)); setFlagOpen(false); }}>Send flag</Button>
              </div>
            )}
            </div>
          </div>
        ) : null}
      </div>

      {!done && !reviewing && (card || hidden) && (
        <div className={`${styles.foot} ${styles.footOn}`}>
          <div className={styles.footIn}>
            <Button className={`${styles.big} ${styles.cta}`} disabled={checking} onClick={() => void reveal()}>
              {checking ? "Checking…" : card ? (mine && onExplain ? "Check my answer" : "Reveal answer") : "Show choices"}
            </Button>
          </div>
        </div>
      )}

      {!done && !reviewing && q && !hidden && (
        <div className={`${styles.foot} ${sel && !checked ? styles.footOn : ""}`} aria-hidden={!sel}>
          <div className={styles.footIn}>
            <Button className={`${styles.big} ${styles.cta}`} disabled={!sel || checked || saving} onClick={check}>
              {saving ? "Saving…" : "Check answer"}
            </Button>
          </div>
        </div>
      )}

      {reviewing && card && (
        <div className={`${styles.foot} ${styles.footOn} ${styles.reviewFoot}`}>
          <div className={styles.footIn}><div className={styles.actions}>
            {checked ? <Button className={`${styles.next} ${styles.cta}`} onClick={() => { haptic(); goNext(); }}>Next</Button> : (
              <>
                <Button variant="secondary" className={styles.next} onClick={() => gradeCard(false)}>Review tomorrow</Button>
                <Button className={`${styles.next} ${styles.cta}`} onClick={() => gradeCard(true)}>Got it</Button>
              </>
            )}
          </div></div>
        </div>
      )}

      {reviewing && q && (
        <div className={`${styles.foot} ${styles.footOn} ${styles.reviewFoot}`}>
          <div className={styles.footIn}><div className={styles.actions}>
            {!ai && (
              <>

                <button className={`${styles.iconBtn} ${isFlagged ? styles.flagOn : ""}`} aria-label="Flag a problem" onClick={() => { if (isFlagged) return; setFlagOpen((v) => !v); setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }), 60); }}>
                  <Flag size={20} fill={isFlagged ? "currentColor" : "none"} />
                </button>
              </>
            )}
            <Button className={`${styles.next} ${styles.cta}`} onClick={() => { haptic(); goNext(); }}>Next question</Button>
          </div></div>
        </div>
      )}

      {asking && !done && q && <AskPanel question={q} picked={(picked as "A" | "B" | "C" | "D" | undefined) ?? null} onClose={() => setAsking(false)} />}
    </div>
  );
}

function Results({ items: all, results, picks, mode, used, after, onAnother, onRetry, onClose, onOpen, entry, previous }: {
  items: RoundItem[]; results: (boolean | undefined)[]; picks: (string | undefined)[]; mode: QuizMode;
  /** Seconds a timed exam took. */
  used?: number; after?: { label: string; onGo: () => void }[];
  onAnother: () => void; onRetry: (items: RoundItem[]) => void; onClose: () => void; onOpen: (index: number) => void;
  entry?: ExamEntry; previous?: ExamEntry;
}) {
  // Only answered questions count; practice and an exam ended early can stop anywhere.
  const idx = all.map((_, k) => k).filter((k) => mode === "exam" || results[k] !== undefined);
  const items = idx.map((k) => all[k]);
  const res = idx.map((k) => results[k]);
  const pk = idx.map((k) => picks[k]);
  const n = items.length;
  const c = res.filter(Boolean).length;
  const missed = items.filter((_, k) => res[k] !== true);
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
  items.forEach((it, k) => { const b = (by[itemCourse(it)] ||= { n: 0, c: 0 }); b.n++; if (res[k]) b.c++; });
  // An exam also breaks the score down by topic, weakest first.
  const topics = new Map<string, { n: number; c: number }>();
  if (mode === "exam") items.forEach((it, k) => { const t = topics.get(itemTopic(it)) ?? { n: 0, c: 0 }; t.n++; if (res[k]) t.c++; topics.set(itemTopic(it), t); });
  const topicRows = [...topics].sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n);
  const [open, setOpen] = useState<number | null>(null);
  const longest = runsOf(results).best;
  const perfect = n > 0 && c === n;

  return (
    <div className={styles.res}>
      <div className={`${styles.ring} ${perfect ? styles.ringPerfect : ""} ${auraHost}`}>
        <Aura className={styles.ringAura} colors={perfect ? ["var(--success)", "var(--uh-red)", "var(--success)"] : ["var(--uh-red)", "var(--course-il)", "var(--uh-red-light)"]} />
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
      <h1 className={styles.resTitle}>{mode === "exam" ? "Exam complete" : "Session complete"}</h1>
      {entry && previous && entry.total === previous.total && <span className={styles.compare}>{entry.score - previous.score >= 0 ? "+" : ""}{entry.score - previous.score} since {examDate(previous.at)}</span>}
      {used !== undefined && n > 0 && (
        <div className={styles.card}>
          <div className={styles.row}><span className={styles.rowTitle}>Time</span><span className={styles.rowEnd}>{clock(used)}</span></div>
          <div className={styles.row}><span className={styles.rowTitle}>Per question</span><span className={styles.rowEnd}>{clock(Math.round(used / n))}</span></div>
        </div>
      )}
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
        {mode === "practice" && longest >= 3 && (
          <div className={styles.row}>
            <span className={`${styles.dot} ${styles.dotFlame}`}><Flame size={13} strokeWidth={2.4} /></span>
            <span className={styles.rowTitle}>Longest run</span>
            <span className={styles.rowEnd}>{longest}</span>
          </div>
        )}
      </div>
      {topicRows.length > 1 && (
        <div className={styles.card}>
          {topicRows.map(([topic, t]) => (
            <div key={topic} className={styles.row}>
              <span className={`${styles.mark} ${t.c === t.n ? styles.markOk : styles.markBad}`}>{t.c === t.n ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}</span>
              <span className={styles.rowTitle}>{topic}</span>
              <span className={styles.rowEnd}>{t.c} of {t.n}</span>
            </div>
          ))}
        </div>
      )}
      {mode === "exam" ? (
        <div className={`${styles.card} ${styles.resList}`}>
          {items.map((it, k) => {
            if (!it.q) return null;
            const pick = it.q.choices.find((x) => x.id === pk[k]);
            const right = it.q.choices.find((x) => x.id === it.q.answer)!;
            const isOpen = open === k;
            return (
              <div key={k} className={styles.reviewItem}>
                <button className={styles.reviewHead} onClick={() => setOpen(isOpen ? null : k)} aria-expanded={isOpen}>
                  <span className={`${styles.mark} ${res[k] ? styles.markOk : styles.markBad}`}>{res[k] ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}</span>
                  <span className={styles.rowMain}><span className={styles.rowTitle}>{it.q.subtopic ?? it.q.topic}</span><span className={styles.rowSub}>{it.q.prompt}</span></span>
                  <ChevronRight size={16} className={`${styles.chev} ${isOpen ? styles.chevOpen : ""}`} />
                </button>
                {isOpen && (
                  <div className={styles.reviewBody}>
                    {!pick && <span className={styles.pill}>Unanswered</span>}
                    {pick && <p><b>You chose {pick.id} · {ANSWER_LABEL[pick.role]}.</b> {pick.text} {pick.why}</p>}
                    <p><b>The answer is {right.id}.</b> {right.text} {right.why}</p>
                    {it.q.rule && <p className={styles.reviewRule}>{it.q.rule}</p>}
                    {it.q.authority && <span className={styles.authority}>{it.q.authority}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : missed.length > 0 ? (
        <div className={`${styles.card} ${styles.resList}`}>
          {missed.map((it) => (
            <button key={itemId(it)} className={`${styles.row} ${styles.rowBtn}`} onClick={() => onOpen(all.indexOf(it))}>
              <span className={`${styles.mark} ${styles.markBad}`}><X size={13} strokeWidth={3} /></span>
              <span className={styles.rowMain}><span className={styles.rowTitle}>{it.card ? it.card.topic : it.q.subtopic ?? it.q.topic}</span><span className={styles.rowSub}>{it.card ? it.card.front : it.q.prompt}</span></span>
              <ChevronRight size={16} className={styles.chev} />
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.btns}>
        {mode === "exam" && <Button className={`${styles.big} ${styles.cta}`} onClick={onAnother}>New exam</Button>}
        {mode === "exam" && <Button variant="secondary" className={styles.big} onClick={() => { onClose(); afterOverlayClose(() => { window.location.hash = "#/tool/ExamHistory"; }); }}>Practice exams</Button>}
        {missed.length > 0 && (
          <Button variant="secondary" className={styles.big} onClick={() => onRetry(missed.map((it) => ({ ...it, review: true })))}>Retry the {missed.length} missed</Button>
        )}
        {after?.map((a) => <Button key={a.label} variant="secondary" className={styles.big} onClick={a.onGo}>{a.label}</Button>)}
        <Button variant="secondary" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

function ExamSession({ items, seconds, onAnother, onRetry, onClose, className }: Props) {
  const { list, add } = useExams();
  const { queueAnswer, flush } = useLawstinData();
  const [exam, setExam] = useState<ActiveExam>(() => takeExamResume() ?? {
    id: new Date().toISOString(), at: Date.now(), questions: [...new Map(items.flatMap(it => it.q ? [[it.q.id, it.q] as const] : [])).values()],
    i: 0, picks: {}, flagged: [], seconds: 0, limit: seconds, submitted: [],
  });
  useEffect(clearExamResume, []);
  const [entry, setEntry] = useState<ExamEntry | null>(() => exam.finishing ? examSummary(exam.questions, exam.picks, exam.flagged, exam.seconds, !!exam.limit, exam.id) : null);
  const [mapOpen, setMapOpen] = useState(false);
  const [confirm, setConfirm] = useState<"finish" | "pause" | null>(null);
  const ref = useModalFocus<HTMLDivElement>();
  const current = useRef(exam); current.current = exam;
  const finished = useRef(!!entry);
  const checkpoint = (x: ActiveExam) => {
    writeCache("exam-active", x.finishing && x.questions.every(q => !x.picks[q.id] || x.submitted.includes(q.id)) ? null : { ...x, at: Date.now() });
  };
  // Saved on every answer, move or flag, and every 15 seconds of the clock, not every tick.
  useEffect(() => { checkpoint(current.current); }, [exam.i, exam.picks, exam.flagged, exam.submitted, exam.finishing, Math.floor(exam.seconds / 15)]);
  useEffect(() => { const save = () => checkpoint(current.current); window.addEventListener("pagehide", save); return () => window.removeEventListener("pagehide", save); }, []);
  useEffect(() => {
    const save = () => checkpoint(current.current);
    window.addEventListener("pagehide", save);
    return () => { save(); window.removeEventListener("pagehide", save); };
  }, []);
  const finish = useCallback(() => {
    if (finished.current) return;
    const x = current.current;
    const summary = examSummary(x.questions, x.picks, x.flagged, x.limit ? Math.min(x.seconds, x.limit) : x.seconds, !!x.limit, x.id);
    try { add(summary); }
    catch { toast.error("Couldn’t save the exam on this device"); return; }
    finished.current = true; setConfirm(null); setMapOpen(false); setEntry(summary);
    setExam(v => ({ ...v, finishing: true })); haptic();
  }, [add]);
  useEffect(() => {
    if (entry) return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now(), delta = Math.max(0, Math.floor((now - last) / 1000));
      if (delta) { last += delta * 1000; setExam(x => ({ ...x, seconds: x.limit ? Math.min(x.limit, x.seconds + delta) : x.seconds + delta })); }
    }, 1000);
    return () => clearInterval(timer);
  }, [entry]);
  useEffect(() => { if (!entry && exam.limit && exam.seconds >= exam.limit) finish(); }, [exam.seconds, exam.limit, entry, finish]);
  useEffect(() => {
    if (!entry) return;
    let x = current.current;
    for (const q of x.questions) {
      const choice = x.picks[q.id];
      if (!choice || x.submitted.includes(q.id)) continue;
      queueAnswer({ questionId: q.id, choice: choice as "A" | "B" | "C" | "D", localDate: dateKey.today() }, choice === q.answer);
      x = { ...x, submitted: [...x.submitted, q.id] }; current.current = x; checkpoint(x);
    }
    setExam(x); void flush(true);
  }, [entry, queueAnswer, flush]);
  const close = () => { checkpoint(current.current); onClose(); };
  const exit = () => { if (entry) close(); else setConfirm("pause"); };
  useBackClose(() => { exit(); if (!entry) return false; });
  const move = (n: number) => { if (n < 0 || n >= exam.questions.length) return; setExam(x => ({ ...x, i: n })); haptic(); };
  const pick = (id: string) => setExam(x => {
    const picks = { ...x.picks }, q = x.questions[x.i];
    if (picks[q.id] === id) delete picks[q.id]; else picks[q.id] = id;
    return { ...x, picks };
  });
  const flag = () => setExam(x => { const id = x.questions[x.i].id; return { ...x, flagged: x.flagged.includes(id) ? x.flagged.filter(k => k !== id) : [...x.flagged, id] }; });
  const askFinish = () => { if (exam.questions.some(q => !exam.picks[q.id]) || exam.flagged.length) setConfirm("finish"); else finish(); };
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if (entry || confirm || mapOpen || ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey || (ev.target as HTMLElement)?.matches("input,textarea,[contenteditable=true]")) return;
      const k = ev.key.toUpperCase();
      if (["A", "B", "C", "D", "1", "2", "3", "4"].includes(k)) { ev.preventDefault(); pick("1234".includes(k) ? "ABCD"[Number(k) - 1] : k); }
      else if (ev.key === "ArrowLeft") { ev.preventDefault(); move(exam.i - 1); }
      else if (ev.key === "ArrowRight") { ev.preventDefault(); move(exam.i + 1); }
      else if (k === "F") { ev.preventDefault(); flag(); }
      else if (k === "M") { ev.preventDefault(); setMapOpen(true); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [exam, entry, confirm, mapOpen]);
  const q = exam.questions[exam.i];
  const questionMap = (jump: (n: number) => void) => <div className={styles.examMap} role="group" aria-label="Question map">{exam.questions.map((q, n) => <button key={q.id}
    aria-label={`Question ${n + 1}, ${exam.picks[q.id] ? "answered" : "unanswered"}${exam.flagged.includes(q.id) ? ", flagged" : ""}`}
    aria-current={n === exam.i ? "step" : undefined} data-answered={!!exam.picks[q.id]} data-flagged={exam.flagged.includes(q.id)}
    onClick={() => jump(n)}>{n + 1}{exam.flagged.includes(q.id) && <Flag size={10} fill="currentColor" />}</button>)}</div>;
  const previous = entry ? list.find(e => e.at < entry.at && e.course === entry.course) : undefined;
  return <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Practice exam" className={`${styles.modal} ${className ?? ""}`}>
    <div className={styles.top}><div className={`${styles.topIn} ${styles.examTop}`}>
      <div className={styles.examLeft}>{!entry && <><button className={styles.x} aria-label="Question map" onClick={() => setMapOpen(true)}><Grid2X2 size={18} /></button>{exam.limit && <span className={`${styles.count} ${exam.limit - exam.seconds < 60 ? styles.countLow : ""}`} role="timer">{clock(exam.limit - exam.seconds)}</span>}</>}</div>
      <span className={styles.examTitle}>{entry ? "Practice exam" : `Question ${exam.i + 1} of ${exam.questions.length}`}</span>
      <button className={styles.x} aria-label="Close" onClick={exit}><X size={16} strokeWidth={2.4} /></button>
    </div></div>
    <div className={styles.scroll}>
      {entry ? <>
        <Results items={exam.questions.map(q => ({ q, review: false }))} results={exam.questions.map(q => exam.picks[q.id] === q.answer)} picks={exam.questions.map(q => exam.picks[q.id])}
          mode="exam" used={entry.seconds} entry={entry} previous={previous} onAnother={onAnother} onRetry={onRetry} onClose={close} onOpen={() => {}} />
      </> : <div className={`${styles.body} ${styles.split}`} key={q.id}>
        <div className={styles.meta}><span className={styles.chip} style={{ color: COURSES[q.course].color }}>{COURSES[q.course].short}</span><span className={styles.topic}>{q.topic}</span></div>
        <div className={styles.paneL}><div className={styles.stem}>{paras(q.stem)}</div></div>
        <div className={styles.paneR}>
          <div className={styles.desktopMap}>{questionMap(move)}</div>
          <p className={styles.ask}>{q.prompt}</p>
          <div className={styles.choices} role="group" aria-label="Answer choices">{q.choices.map(c => <button key={c.id} aria-pressed={exam.picks[q.id] === c.id} className={`${styles.choice} ${exam.picks[q.id] === c.id ? styles.selected : ""}`} onClick={() => pick(c.id)}><span className={styles.letter}>{c.id}</span><span className={styles.choiceText}>{c.text}</span></button>)}</div>
          <button className={styles.examFlag} aria-pressed={exam.flagged.includes(q.id)} onClick={flag}><Flag size={18} fill={exam.flagged.includes(q.id) ? "currentColor" : "none"} />{exam.flagged.includes(q.id) ? "Flagged" : "Flag question"}</button>
        </div>
      </div>}
    </div>
    {!entry && <div className={`${styles.foot} ${styles.footOn}`}><div className={styles.footIn}><div className={styles.actions}>
      <Button variant="secondary" className={styles.next} disabled={exam.i === 0} onClick={() => move(exam.i - 1)}>Previous</Button>
      {exam.i < exam.questions.length - 1 && <Button variant="secondary" className={styles.next} onClick={() => move(exam.i + 1)}>Next</Button>}
      <Button className={`${styles.next} ${styles.cta}`} onClick={askFinish}>Finish</Button>
    </div></div></div>}
    {mapOpen && <BottomSheet title="Question map" onClose={() => setMapOpen(false)}>{questionMap(n => { move(n); setMapOpen(false); })}</BottomSheet>}
    {confirm && <ExamConfirm title={confirm === "pause" ? "Leave exam?" : "Finish exam?"} onBack={() => setConfirm(null)} action={confirm === "pause" ? "Leave" : "Finish"} onAction={confirm === "pause" ? close : finish}>
      {confirm === "finish" && <div className={styles.examWarnings}>
        {exam.questions.some(q => !exam.picks[q.id]) && <span className={styles.pill}>{exam.questions.filter(q => !exam.picks[q.id]).length} unanswered</span>}
        {exam.flagged.length > 0 && <span className={styles.pill}>{exam.flagged.length} flagged</span>}
      </div>}
    </ExamConfirm>}
  </div>;
}

function ExamConfirm({ title, action, onBack, onAction, children }: { title: string; action: string; onBack: () => void; onAction: () => void; children?: React.ReactNode }) {
  const ref = useModalFocus<HTMLDivElement>();
  useBackClose(() => { onBack(); return false; });
  return <div className={styles.confirmBackdrop}><div ref={ref} tabIndex={-1} role="alertdialog" aria-modal="true" aria-label={title} className={styles.confirm}>
    <h2>{title}</h2>{children}<Button className={styles.cta} onClick={onAction}>{action}</Button><Button variant="secondary" onClick={onBack}>Go back</Button>
  </div></div>;
}
