import React, { useEffect, useState } from "react";
import { X, Check, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { Textarea } from "./Textarea";
import { Skeleton } from "./Skeleton";
import { useLawstinAi } from "../helpers/useLawstinAi";
import { type GradeDTO, type SpotterDTO } from "../endpoints/ai_POST.schema";
import { COURSES, type CourseCode } from "../helpers/studyEngine";
import { haptic } from "../helpers/haptics";
import { useBackClose } from "../helpers/useBackClose";
import { toast } from "../helpers/toast";
import styles from "./WrittenPractice.module.css";

const STORE = "lawstin-written";
type Saved = { spot: SpotterDTO; answer: string; grade: GradeDTO | null };
const load = (): Saved | null => { try { const v = localStorage.getItem(STORE); return v ? (JSON.parse(v) as Saved) : null; } catch { return null; } };
const save = (v: Saved | null) => { try { if (v) localStorage.setItem(STORE, JSON.stringify(v)); else localStorage.removeItem(STORE); } catch { /* storage unavailable */ } };

const errText = (e: unknown) => (e as Error)?.message || "Something went wrong. Try again.";

export function WrittenPractice({ onClose, className }: { onClose: () => void; className?: string }) {
  const { spotter, grade } = useLawstinAi();
  const saved = useState(load)[0];
  const [course, setCourse] = useState<CourseCode>(saved?.spot.course ?? "pr");
  const [spot, setSpot] = useState<SpotterDTO | null>(saved?.spot ?? null);
  const [answer, setAnswer] = useState(saved?.answer ?? "");
  const [result, setResult] = useState<GradeDTO | null>(saved?.grade ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [ring, setRing] = useState(0);

  useEffect(() => { save(spot ? { spot, answer, grade: result } : null); }, [spot, answer, result]);
  useEffect(() => {
    if (!result) { setRing(0); return; }
    const t = requestAnimationFrame(() => setRing(result.score / 10));
    return () => cancelAnimationFrame(t);
  }, [result]);

  const close = () => { setClosing(true); setTimeout(onClose, 360); };
  useBackClose(close);

  // Starting over keeps an Undo for a few seconds when an ungraded answer would be thrown away.
  const discard = () => {
    if (!spot || !answer.trim() || result) return;
    const prev = { spot, answer };
    toast("Answer cleared", { action: { label: "Undo", onClick: () => { setSpot(prev.spot); setAnswer(prev.answer); setResult(null); } } });
  };
  const newSpot = async () => {
    haptic();
    discard();
    setErr(null); setResult(null); setAnswer(""); setSpot(null);
    try {
      const r = await spotter.mutateAsync({ course });
      setSpot(r.spotter);
    } catch (e) { setErr(errText(e)); }
  };

  const submit = async () => {
    if (!spot || !answer.trim()) return;
    haptic();
    setErr(null);
    try {
      const r = await grade.mutateAsync({ course: spot.course, topic: spot.topic, facts: spot.facts, call: spot.call, issues: spot.issues, answer });
      setResult(r.grade);
    } catch (e) { setErr(errText(e)); }
  };

  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const circ = 2 * Math.PI * 40;
  const c = spot ? COURSES[spot.course] : COURSES[course];

  return (
    <div className={`${styles.modal} ${closing ? styles.closing : ""} ${className ?? ""}`} role="dialog" aria-modal="true" aria-label="Written practice">
      <div className={styles.top}>
        <div className={styles.topIn}>
          <span className={styles.spacer} />
          <span className={styles.topTitle}>Written practice</span>
          <button className={styles.x} onClick={close} aria-label="Close"><X size={17} strokeWidth={2.4} /></button>
        </div>
      </div>

      <div className={styles.scroll}>
        <div className={styles.body}>
          {!spot && !spotter.isPending && (
            <div className={styles.start}>
              <h1 className={styles.startTitle}>Issue spotter</h1>
              <div className={styles.seg} role="group" aria-label="Course">
                {(["pr", "il", "asy"] as const).map((k) => (
                  <button key={k} aria-pressed={course === k} className={course === k ? styles.segOn : ""} onClick={() => { haptic(); setCourse(k); }}>{COURSES[k].short}</button>
                ))}
              </div>
              <Button className={`${styles.big} ${styles.cta}`} onClick={newSpot}>Get a fact pattern</Button>
            </div>
          )}

          {spotter.isPending && (
            <div className={styles.loading} aria-busy="true">
              <Skeleton style={{ height: 14, width: "40%", borderRadius: 6 }} />
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} style={{ height: 16, width: i === 6 ? "60%" : "100%", borderRadius: 6 }} />)}
            </div>
          )}

          {spot && (
            <>
              <div className={styles.meta}>
                <span className={styles.chip} style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 14%, transparent)` }}>{c.short}</span>
                <span className={styles.topic}>{spot.topic}</span>
              </div>
              <div className={styles.facts}>{spot.facts.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</div>
              <p className={styles.call}>{spot.call}</p>

              {!result ? (
                <div className={styles.answerBox}>
                  <Textarea className={styles.answer} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" disabled={grade.isPending} />
                  <span className={styles.count}>{words} {words === 1 ? "word" : "words"}</span>
                </div>
              ) : (
                <div className={styles.result}>
                  <div className={styles.scoreRow}>
                    <div className={styles.ring}>
                      <svg viewBox="0 0 96 96"><circle className={styles.track} cx="48" cy="48" r="40" /><circle className={styles.val} cx="48" cy="48" r="40" style={{ strokeDasharray: circ, strokeDashoffset: circ * (1 - ring) }} /></svg>
                      <div><b>{result.score}</b><span>/10</span></div>
                    </div>
                    <p className={styles.summary}>{result.summary}</p>
                  </div>

                  {result.spotted.length > 0 && (
                    <section className={styles.sec}>
                      <h3 className={styles.okH}>Spotted</h3>
                      <div className={styles.card}>
                        {result.spotted.map((s, i) => (
                          <div key={i} className={styles.item}><span className={`${styles.mark} ${styles.markOk}`}><Check size={12} strokeWidth={3} /></span><div><b>{s.issue}</b><p>{s.comment}</p></div></div>
                        ))}
                      </div>
                    </section>
                  )}
                  {result.missed.length > 0 && (
                    <section className={styles.sec}>
                      <h3 className={styles.badH}>Missed</h3>
                      <div className={styles.card}>
                        {result.missed.map((s, i) => (
                          <div key={i} className={styles.item}><span className={`${styles.mark} ${styles.markBad}`}><X size={12} strokeWidth={3} /></span><div><b>{s.issue}</b><p className={styles.rule}>{s.rule}</p></div></div>
                        ))}
                      </div>
                    </section>
                  )}
                  {result.errors.length > 0 && (
                    <section className={styles.sec}>
                      <h3 className={styles.badH}>Misstatements</h3>
                      <div className={styles.card}>{result.errors.map((s, i) => <div key={i} className={styles.item}><div><p>{s}</p></div></div>)}</div>
                    </section>
                  )}
                  <details className={styles.model}>
                    <summary>Model answer <ChevronRight size={14} /></summary>
                    <div className={styles.modelBody}>{result.modelAnswer.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</div>
                  </details>
                  <details className={styles.model}>
                    <summary>Your answer <ChevronRight size={14} /></summary>
                    <div className={styles.modelBody}>{answer.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</div>
                  </details>
                </div>
              )}
            </>
          )}
          {err && <p className={styles.err}>{err}</p>}
        </div>
      </div>

      {spot && (
        <div className={styles.foot}>
          <div className={styles.footIn}>
            {!result ? (
              <>
                <Button variant="secondary" className={styles.side} disabled={grade.isPending} onClick={newSpot}>New</Button>
                <Button className={`${styles.big} ${styles.cta}`} disabled={!answer.trim() || grade.isPending} onClick={submit}>{grade.isPending ? "Grading…" : "Grade my answer"}</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" className={styles.side} onClick={() => { discard(); setSpot(null); setResult(null); setAnswer(""); }}>Course</Button>
                <Button className={`${styles.big} ${styles.cta}`} onClick={newSpot}>New fact pattern</Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
