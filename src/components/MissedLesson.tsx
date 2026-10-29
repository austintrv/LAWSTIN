import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "./Button";
import { COURSES, ROLE_LABEL, type CourseCode } from "../helpers/studyEngine";
import type { ProgressDTO, QuestionDTO } from "../endpoints/state_GET.schema";
import { haptic } from "../helpers/haptics";
import { useBackClose } from "../helpers/useBackClose";
import { useModalFocus } from "../helpers/useModalFocus";
import { useWide } from "../helpers/useWide";
import q from "./QuizSession.module.css";
import styles from "./MissedLesson.module.css";

export type LessonTopic = {
  course: CourseCode;
  topic: string;
  rules: { subtopic: string; rule: string; authority: string | null }[];
  items: { q: QuestionDTO; p: ProgressDTO }[];
  /** The question to try at the end of the topic: another one from it when there is one. */
  check: QuestionDTO;
};

type Step =
  | { kind: "rule"; t: LessonTopic }
  | { kind: "slip"; t: LessonTopic; q: QuestionDTO; p: ProgressDTO; n: number; of: number }
  | { kind: "check"; t: LessonTopic; q: QuestionDTO }
  | { kind: "end" };

const paras = (t: string) => t.split(/\n\s*\n/).map((p, i) => <p key={i}>{p.trim()}</p>);

/**
 * A short lesson on topics with missed questions, built from those questions' own rules and
 * explanations: the rule, where each miss went wrong, then one question to try again.
 */
export function MissedLesson({ topics, onAnswer, onDrill, onClose, tools }: {
  topics: LessonTopic[];
  onAnswer: (q: QuestionDTO, choice: string) => Promise<boolean>;
  onDrill: (questions: QuestionDTO[]) => void;
  onClose: () => void;
  /** Links to the topic's study materials. */
  tools?: (course: CourseCode, topic: string) => React.ReactNode;
}) {
  const steps = useMemo<Step[]>(() => {
    const out: Step[] = [];
    for (const t of topics) {
      if (t.rules.length) out.push({ kind: "rule", t });
      const slips = t.items.slice(0, 3);
      slips.forEach((it, k) => out.push({ kind: "slip", t, q: it.q, p: it.p, n: k + 1, of: slips.length }));
      out.push({ kind: "check", t, q: t.check });
    }
    out.push({ kind: "end" });
    return out;
  }, [topics]);

  const [at, setAt] = useState(0);
  const wide = useWide();
  const [dir, setDir] = useState<"in" | "back">("in");
  const [closing, setClosing] = useState(false);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [right, setRight] = useState<Record<number, boolean>>({});
  const scroll = useRef<HTMLDivElement>(null);
  const modalRef = useModalFocus<HTMLDivElement>();
  const step = steps[at];

  const close = useCallback(() => { setClosing(true); setTimeout(onClose, 380); }, [onClose]);
  useBackClose(close);
  const go = useCallback((n: number) => {
    if (n < 0 || n >= steps.length) return;
    haptic();
    setDir(n < at ? "back" : "in");
    setAt(n);
    setSel(null);
    scroll.current?.scrollTo({ top: 0 });
  }, [at, steps.length]);

  const checked = step.kind === "check" && picks[at] !== undefined;
  const check = async () => {
    if (step.kind !== "check" || !sel || checked) return;
    haptic();
    const at0 = at, ok = sel === step.q.answer;
    setPicks((p) => ({ ...p, [at0]: sel }));
    setRight((r) => ({ ...r, [at0]: ok }));
    try { await onAnswer(step.q, sel); } catch { /* the app reports save errors */ }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") go(at - 1);
      else if (e.key === "ArrowRight" && !(step.kind === "check" && !checked)) go(at + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, step, checked, close, go]);

  const checks = steps.map((s, k) => (s.kind === "check" ? k : -1)).filter((k) => k >= 0);
  const fixed = checks.filter((k) => right[k]).length;
  const allMissed = topics.flatMap((t) => t.items.map((it) => it.q));
  const label = (t: LessonTopic) => {
    const c = COURSES[t.course];
    return <span className={q.label}><i style={{ background: c.color }} />{c.short} · {t.topic}</span>;
  };

  return (
    <div ref={modalRef} tabIndex={-1} className={`${q.modal} ${closing ? q.closing : ""}`} role="dialog" aria-modal="true" aria-label="Missed topics lesson">
      <div className={q.top}>
        <div className={q.topIn}>
          <button className={q.x} onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous step"><ChevronLeft size={18} strokeWidth={2.4} /></button>
          <div className={q.prog} aria-hidden="true">{steps.map((_, k) => <i key={k} className={k < at ? q.done : k === at ? q.cur : ""} />)}</div>
          <button className={q.x} onClick={close} aria-label="Close"><X size={17} strokeWidth={2.4} /></button>
        </div>
      </div>

      <div className={q.scroll} ref={scroll}>
        <div className={`${q.body} ${step.kind === "slip" || step.kind === "check" ? q.split : ""} ${dir === "back" ? q.inBack : q.in}`} key={at}>
          {step.kind === "rule" && <>
            <div className={styles.head}>{label(step.t)}<h2>The rule</h2></div>
            <div className={styles.rules}>
              {step.t.rules.map((r, k) => (
                <section key={k} className={`${q.rc} ${q.answerCard}`}>
                  <span className={q.label}>{r.subtopic}</span>
                  <p className={styles.rule}>{r.rule}</p>
                  {r.authority && <span className={q.authority}>{r.authority}</span>}
                </section>
              ))}
            </div>
            {tools?.(step.t.course, step.t.topic)}
          </>}

          {step.kind === "slip" && (() => {
            const { q: qq, p } = step;
            const answer = qq.choices.find((c) => c.id === qq.answer)!;
            const chosen = p.lastCorrect === false ? qq.choices.find((c) => c.id === p.lastChoice && c.id !== qq.answer) : undefined;
            return <>
              <div className={styles.head}>{label(step.t)}<h2>Where you slipped{step.of > 1 ? ` · ${step.n} of ${step.of}` : ""}</h2>
                {!chosen && <span className={styles.note}>{p.lastCorrect ? "Missed before, right last time" : "Marked as a guess"}</span>}</div>
              <div className={q.paneL}>
              <details className={q.rc} open={wide}>
                <summary className={q.factHead}>
                  <span className={q.strong}>{qq.prompt}</span>
                  <span className={q.factToggle}>Fact pattern <ChevronRight size={15} /></span>
                </summary>
                <div className={q.factStem}>{paras(qq.stem)}</div>
              </details>
              </div>
              <div className={q.paneR}>
              {chosen && (
                <section className={`${q.rc} ${q.answerCard}`}>
                  <span className={`${q.label} ${q.labelBad}`}><span className={`${q.letterSm} ${q.letterBad}`}>{chosen.id}</span>Your answer · {ROLE_LABEL[chosen.role]}</span>
                  <p className={q.strong}>{chosen.text}</p>
                  <p className={q.bodyText}>{chosen.why}</p>
                </section>
              )}
              <section className={`${q.rc} ${q.answerCard}`}>
                <span className={`${q.label} ${q.labelOk}`}><span className={`${q.letterSm} ${q.letterOk}`}>{answer.id}</span>Correct answer</span>
                <p className={q.strong}>{answer.text}</p>
                <p className={q.bodyText}>{answer.why}</p>
              </section>
              </div>
            </>;
          })()}

          {step.kind === "check" && (() => {
            const qq = step.q, picked = picks[at], shown = picked ?? sel;
            const answer = qq.choices.find((c) => c.id === qq.answer)!;
            return <>
              <div className={styles.head}>{label(step.t)}<h2>Check yourself</h2></div>
              <div className={q.paneL}><div className={q.stem}>{paras(qq.stem)}</div></div>
              <div className={q.paneR}>
              <p className={q.ask}>{qq.prompt}</p>
              <div className={q.choices} role="group" aria-label="Answer choices">
                {qq.choices.map((c) => {
                  const state = picked === undefined ? undefined : c.id === qq.answer ? "right" : c.id === picked ? "wrong" : "other";
                  return (
                    <button key={c.id} className={`${q.choice} ${styles.pick} ${c.id === shown && !picked ? q.selected : ""}`} data-state={state} disabled={picked !== undefined}
                      aria-pressed={c.id === shown} onClick={() => { haptic(); setSel((s) => (s === c.id ? null : c.id)); }}>
                      <span className={q.letter}>{state === "right" ? <Check size={15} strokeWidth={3} /> : state === "wrong" ? <X size={15} strokeWidth={3} /> : c.id}</span>
                      <span className={q.choiceText}>{c.text}</span>
                    </button>
                  );
                })}
              </div>
              {picked !== undefined && (
                <section className={`${q.rc} ${q.answerCard}`} role="status">
                  <span className={`${q.label} ${right[at] ? q.labelOk : q.labelBad}`}>{right[at] ? "Correct" : `Answer: ${answer.id}`}</span>
                  <p className={q.bodyText}>{answer.why}</p>
                </section>
              )}
              </div>
            </>;
          })()}

          {step.kind === "end" && (
            <div className={styles.end}>
              <span className={styles.endMark}><Check size={34} strokeWidth={2.6} /></span>
              <h2>Lesson done</h2>
              {checks.length > 0 && <p>{fixed} of {checks.length} correct</p>}
              <div className={styles.endTopics}>
                {topics.map((t) => <span key={`${t.course}|${t.topic}`} style={{ "--course-color": COURSES[t.course].color } as React.CSSProperties}><i />{t.topic}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={`${q.foot} ${q.footOn}`}>
        <div className={q.footIn}>
          {step.kind === "check" && !checked
            ? <Button className={`${q.big} ${q.cta}`} disabled={!sel} onClick={check}>Check answer</Button>
            : step.kind === "end"
              ? <div className={styles.endActions}>
                  <Button className={`${q.big} ${q.cta}`} onClick={() => { onDrill(allMissed); }}>Drill these questions</Button>
                  <Button variant="ghost" onClick={close}>Done</Button>
                </div>
              : <Button className={`${q.big} ${q.cta}`} onClick={() => go(at + 1)}>Next</Button>}
        </div>
      </div>
    </div>
  );
}
