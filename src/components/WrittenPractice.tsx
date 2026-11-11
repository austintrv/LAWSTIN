import React, { useEffect, useRef, useState } from "react";
import { useModalFocus } from "../helpers/useModalFocus";
import { X, Check, ChevronRight, Target } from "lucide-react";
import { Button } from "./Button";
import { Textarea } from "./Textarea";
import { Skeleton } from "./Skeleton";
import { useLawstinAi } from "../helpers/useLawstinAi";
import { type GradeDTO, type SpotterDTO } from "../endpoints/ai_POST.schema";
import { COURSES, EXAMS, type CourseCode } from "../helpers/studyEngine";
import type { Hypothetical } from "../helpers/studyMaterials";
import { readDrafts, saveDraft, removeDraft, draftKey, type WrittenDraft, type useWritten, type WrittenEntry } from "../helpers/useWritten";
import { dateKey } from "../helpers/dateKey";
import { haptic } from "../helpers/haptics";
import { useBackClose } from "../helpers/useBackClose";
import { toast } from "../helpers/toast";
import styles from "./WrittenPractice.module.css";

type Length = "short" | "full";
const savedMessage = "Saved. Grade it when you’re back online.";
const errText = (e: unknown) => (e as Error)?.message || "Something went wrong. Try again.";
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const MINUTES: Record<Length, number> = { short: 15, full: 45 };
/** A hypothetical is exam length when it was built for half an hour or more. */
const lengthOf = (minutes?: number): Length => ((minutes ?? MINUTES.short) >= 30 ? "full" : "short");
const fromHypo = (h: Hypothetical): SpotterDTO => ({
  course: h.course, topic: h.topic, facts: h.facts, call: h.prompt, issues: h.answer.map((a) => a.issue),
  reference: h.answer, materialId: h.id, minutes: h.minutes ?? MINUTES.short,
});
const paras = (t: string) => t.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>);

type Props = {
  onClose: () => void;
  /** Opens on this course, at exam length when `full`. */
  course?: CourseCode; full?: boolean;
  /** Opens straight on this verified hypothetical. */
  hypo?: Hypothetical;
  /** Verified hypotheticals; ones not yet written are used before the tutor writes a new prompt. */
  hypos: Hypothetical[];
  weak: Set<string>;
  written: ReturnType<typeof useWritten>;
  /** A graded essay, to count toward the day. */
  onGraded: (entry: WrittenEntry, length: Length) => void;
  onTopic: (course: CourseCode, topic: string) => void;
  className?: string;
};

export function WrittenPractice({ onClose, course: openCourse, full, hypo, hypos, weak, written, onGraded, onTopic, className }: Props) {
  const { spotter, grade } = useLawstinAi();
  const [drafts, setDrafts] = useState(readDrafts);
  const saved = useState(() => hypo ? drafts[draftKey(fromHypo(hypo))] : !openCourse ? Object.values(drafts).slice(-1)[0] : undefined)[0];
  const [course, setCourse] = useState<CourseCode>(hypo?.course ?? (openCourse === "pr" ? "il" : openCourse) ?? saved?.spot.course ?? "il");
  const [length, setLength] = useState<Length>(full ? "full" : "short");
  const [spot, setSpot] = useState<SpotterDTO | null>(saved?.spot ?? (hypo ? fromHypo(hypo) : null));
  const [answer, setAnswer] = useState(saved?.answer ?? "");
  const [result, setResult] = useState<GradeDTO | null>(null);
  const [seconds, setSeconds] = useState(saved?.seconds ?? 0);
  const [ready, setReady] = useState(saved?.ready ?? false);
  const [online, setOnline] = useState(navigator.onLine);
  const [grading, setGrading] = useState(false);
  const request = useRef(0);
  const [view, setView] = useState<WrittenEntry | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [ring, setRing] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const keep = (draft: WrittenDraft) => {
    try { saveDraft(draft); setDrafts(readDrafts()); }
    catch { toast.error("Couldn’t save your draft on this device"); }
  };
  useEffect(() => { if (spot && !result) keep({ spot, answer, seconds, ready }); }, [spot, answer, result, seconds, ready]);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener("online", change); window.addEventListener("offline", change);
    return () => { request.current++; window.removeEventListener("online", change); window.removeEventListener("offline", change); };
  }, []);
  // The clock runs while a prompt is open and unanswered, and pauses when the app is in the background.
  const writing = !!spot && !result && !grading && !view;
  useEffect(() => {
    if (!writing) return;
    const t = setInterval(() => { if (!document.hidden) setSeconds((s) => s + 1); }, 1000);
    return () => clearInterval(t);
  }, [writing]);

  const shown = view ? view.grade : result;
  useEffect(() => {
    if (!shown) { setRing(0); return; }
    const t = requestAnimationFrame(() => setRing(shown.score / 10));
    return () => cancelAnimationFrame(t);
  }, [shown]);

  const close = () => { setClosing(true); setTimeout(onClose, 360); };
  useBackClose(close);
  const modalRef = useModalFocus<HTMLDivElement>();

  const resumeDraft = (draft: WrittenDraft) => {
    setSpot(draft.spot); setAnswer(draft.answer); setSeconds(draft.seconds ?? 0); setReady(!!draft.ready); setResult(null); setErr(draft.ready && !navigator.onLine ? savedMessage : null);
  };
  const discard = () => {
    if (!spot) return;
    const previous = { spot, answer, seconds, ready };
    removeDraft(spot); setDrafts(readDrafts()); setSpot(null); setAnswer(""); setReady(false); setErr(null);
    toast("Draft discarded", { action: { label: "Undo", onClick: () => resumeDraft(previous) } });
  };
  /** The next verified hypothetical of this length not yet written: weak topics first, then the newest class. */
  const nextHypo = () => hypos
    .filter((h) => h.course === course && lengthOf(h.minutes) === length && !written.done.has(h.id) && h.id !== spot?.materialId)
    .sort((a, b) => Number(weak.has(`${b.course}|${b.topic}`)) - Number(weak.has(`${a.course}|${a.topic}`)) || b.class_date.localeCompare(a.class_date))[0];
  const newSpot = async () => {
    haptic();
    setErr(null); setResult(null); setAnswer(""); setSeconds(0); setReady(false);
    const h = nextHypo();
    setSpot(null);
    if (h) { setSpot(fromHypo(h)); return; }
    try {
      const r = await spotter.mutateAsync({ course, length });
      setSpot({ ...r.spotter, minutes: r.spotter.minutes ?? MINUTES[length] });
    } catch (e) { setErr(errText(e)); }
  };

  const submit = async () => {
    if (!spot || !answer.trim() || grading) return;
    haptic(); setReady(true); keep({ spot, answer, seconds, ready: true });
    if (!navigator.onLine) { setErr(savedMessage); return; }
    const token = ++request.current;
    setErr(null); setGrading(true);
    const len = lengthOf(spot.minutes);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let offline: () => void = () => {};
    try {
      const unavailable = new Promise<never>((_, reject) => {
        offline = () => reject(new Error(savedMessage));
        timer = setTimeout(offline, 15000); window.addEventListener("offline", offline, { once: true });
      });
      const r = await Promise.race([grade.mutateAsync({ course: spot.course, topic: spot.topic, facts: spot.facts, call: spot.call, issues: spot.issues, answer,
        reference: spot.reference, openNote: EXAMS[spot.course].notes === "open", length: len }), unavailable]);
      if (token !== request.current) return;
      scroll.current?.scrollTo({ top: 0 });
      const at = new Date().toISOString();
      const entry: WrittenEntry = { id: crypto.randomUUID(), at, day: dateKey.today(), course: spot.course, topic: spot.topic, materialId: spot.materialId,
        facts: spot.facts, call: spot.call, answer, words, seconds, minutes: spot.minutes, grade: r.grade };
      written.add(entry);
      setResult(r.grade); setReady(false); removeDraft(spot); setDrafts(readDrafts());
      onGraded(entry, len);
    } catch (e) { if (token === request.current) setErr(errText(e)); }
    finally { clearTimeout(timer); window.removeEventListener("offline", offline); if (token === request.current) setGrading(false); }
  };

  const cur = view ? { course: view.course, topic: view.topic, facts: view.facts, call: view.call, minutes: view.minutes } : spot;
  const text = view ? view.answer : answer;
  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const circ = 2 * Math.PI * 40;
  const c = cur ? COURSES[cur.course] : COURSES[course];
  const limit = (cur?.minutes ?? MINUTES.short) * 60;
  const time = view ? view.seconds : seconds;
  // A verified hypothetical is read against its own checked analysis, not one the tutor wrote.
  const reference = view ? hypos.find((h) => h.id === view.materialId)?.answer : spot?.reference;
  const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const tone = (n: number) => (n >= 8 ? styles.scoreOk : n >= 6 ? styles.scoreMid : styles.scoreBad);

  return (
    <div ref={modalRef} tabIndex={-1} className={`${styles.modal} ${closing ? styles.closing : ""} ${className ?? ""}`} role="dialog" aria-modal="true" aria-label="Written practice">
      <div className={styles.top}>
        <div className={styles.topIn}>
          {cur ? <span className={`${styles.clock} ${!shown && time > limit ? styles.clockOver : ""}`} role="timer">{clock(time)}</span> : <span className={styles.spacer} />}
          <span className={styles.topTitle}>Written practice</span>
          <button className={styles.x} onClick={close} aria-label="Close"><X size={17} strokeWidth={2.4} /></button>
        </div>
      </div>

      <div className={styles.scroll} ref={scroll}>
        <div className={styles.body}>
          {!cur && !spotter.isPending && (
            <>
              <div className={styles.start}>
                <h1 className={styles.startTitle}>Issue spotter</h1>
                <div className={styles.seg} role="group" aria-label="Course">
                  {(["il", "asy"] as const).map((k) => (
                    <button key={k} aria-pressed={course === k} className={course === k ? styles.segOn : ""} onClick={() => { haptic(); setCourse(k); }}>{COURSES[k].short}</button>
                  ))}
                </div>
                <div className={styles.seg} role="group" aria-label="Length">
                  {(["short", "full"] as const).map((k) => (
                    <button key={k} aria-pressed={length === k} className={length === k ? styles.segOn : ""} onClick={() => { haptic(); setLength(k); }}>{MINUTES[k]} minutes</button>
                  ))}
                </div>
                {Object.values(drafts).filter(d => d.spot.course === course).map(d => <Button key={draftKey(d.spot)} variant="secondary" className={styles.big} onClick={() => resumeDraft(d)}>Continue your draft<span className={styles.draftTopic}>{d.spot.topic}</span></Button>)}
                <Button className={`${styles.big} ${styles.cta}`} onClick={newSpot}>Get a fact pattern</Button>
              </div>
              {written.list.length > 0 && (
                <section className={styles.sec}>
                  <h3 className={styles.histH}>Your essays</h3>
                  <div className={styles.card}>
                    {written.list.slice(0, 30).map((e) => (
                      <button key={e.id} className={styles.hist} onClick={() => { haptic(); setView(e); scroll.current?.scrollTo({ top: 0 }); }}>
                        <span className={`${styles.score} ${tone(e.grade.score)}`}>{e.grade.score}</span>
                        <span className={styles.histMain}><b>{e.topic}</b><span>{COURSES[e.course].short} · {fmtDay(e.day)} · {e.words} words · {clock(e.seconds)}</span></span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {spotter.isPending && (
            <div className={styles.loading} aria-busy="true">
              <Skeleton style={{ height: 14, width: "40%", borderRadius: 6 }} />
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} style={{ height: 16, width: i === 6 ? "60%" : "100%", borderRadius: 6 }} />)}
            </div>
          )}

          {cur && (
            <div className={styles.spot}>
              <div className={styles.paneL}>
              <div className={styles.meta}>
                <span className={styles.chip} style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 14%, transparent)` }}>{c.short}</span>
                <span className={styles.topic}>{cur.topic}</span>
              </div>
              <div className={styles.facts}>{paras(cur.facts)}</div>
              <p className={styles.call}>{cur.call}</p>
              </div>

              <div className={styles.paneR}>
              {!shown ? (
                <div className={styles.answerBox}>
                  <Textarea className={styles.answer} value={answer} onChange={(e) => { setAnswer(e.target.value); if (spot) keep({ spot, answer: e.target.value, seconds, ready }); }} placeholder="Your answer" disabled={grading} />
                  <span className={styles.count}>{words} {words === 1 ? "word" : "words"}</span>
                </div>
              ) : (
                <div className={styles.result}>
                  <div className={styles.scoreRow}>
                    <div className={styles.ring}>
                      <svg viewBox="0 0 96 96"><circle className={styles.track} cx="48" cy="48" r="40" /><circle className={styles.val} cx="48" cy="48" r="40" style={{ strokeDasharray: circ, strokeDashoffset: circ * (1 - ring) }} /></svg>
                      <div><b>{shown.score}</b><span>/10</span></div>
                    </div>
                    <p className={styles.summary}>{shown.summary}</p>
                  </div>

                  {shown.rubric && (
                    <div className={`${styles.card} ${styles.bars}`}>
                      {([["Issues", shown.rubric.issues], ["Rules", shown.rubric.rules], ["Application", shown.rubric.application]] as const).map(([label, n]) => (
                        <div key={label} className={styles.barRow}><span>{label}</span><i><b style={{ width: `${n * 10}%` }} /></i><span>{n}</span></div>
                      ))}
                    </div>
                  )}

                  {shown.spotted.length > 0 && (
                    <section className={styles.sec}>
                      <h3 className={styles.okH}>Spotted</h3>
                      <div className={styles.card}>
                        {shown.spotted.map((s, i) => (
                          <div key={i} className={styles.item}><span className={`${styles.mark} ${styles.markOk}`}><Check size={12} strokeWidth={3} /></span><div><b>{s.issue}</b><p>{s.comment}</p></div></div>
                        ))}
                      </div>
                    </section>
                  )}
                  {shown.missed.length > 0 && (
                    <section className={styles.sec}>
                      <h3 className={styles.badH}>Missed</h3>
                      <div className={styles.card}>
                        {shown.missed.map((s, i) => (
                          <div key={i} className={styles.item}><span className={`${styles.mark} ${styles.markBad}`}><X size={12} strokeWidth={3} /></span><div><b>{s.issue}</b><p className={styles.rule}>{s.rule}</p></div></div>
                        ))}
                      </div>
                    </section>
                  )}
                  {shown.errors.length > 0 && (
                    <section className={styles.sec}>
                      <h3 className={styles.badH}>Misstatements</h3>
                      <div className={styles.card}>{shown.errors.map((s, i) => <div key={i} className={styles.item}><div><p>{s}</p></div></div>)}</div>
                    </section>
                  )}
                  <details className={styles.model}>
                    <summary>Model answer <ChevronRight size={14} /></summary>
                    <div className={styles.modelBody}>
                      {reference ? reference.map((a, i) => <p key={i}><b>{a.issue}.</b> {a.analysis} <span className={styles.cite}>{a.authority}</span></p>) : paras(shown.modelAnswer)}
                    </div>
                  </details>
                  <details className={styles.model}>
                    <summary>Your answer <ChevronRight size={14} /></summary>
                    <div className={styles.modelBody}>{paras(text)}</div>
                  </details>
                  <button className={`${styles.card} ${styles.hist}`} onClick={() => { haptic(); onTopic(cur.course, cur.topic); }}>
                    <span className={styles.score} style={{ background: c.color }}><Target size={15} /></span>
                    <span className={styles.histMain}><b>Practice {cur.topic}</b></span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
              </div>
            </div>
          )}
          {err && <p role="status" className={styles.err}>{err}</p>}
        </div>
      </div>

      {cur && (
        <div className={styles.foot}>
          <div className={styles.footIn}><div className={styles.footRow}>
            {view ? (
              <Button variant="secondary" className={styles.big} onClick={() => { haptic(); setView(null); }}>Back</Button>
            ) : !result ? (
              <>
                <Button variant="secondary" className={styles.side} disabled={grading} onClick={() => { setSpot(null); setErr(null); }}>New</Button>
                <Button variant="secondary" className={styles.side} disabled={grading} onClick={discard}>Discard</Button>
                <Button className={`${styles.big} ${styles.cta}`} disabled={!answer.trim() || grading} onClick={submit}>{grading ? "Grading…" : ready && online ? "Grade now" : "Grade my answer"}</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" className={styles.side} onClick={() => { setSpot(null); setResult(null); setAnswer(""); setSeconds(0); }}>Essays</Button>
                <Button className={`${styles.big} ${styles.cta}`} onClick={newSpot}>New fact pattern</Button>
              </>
            )}
          </div></div>
        </div>
      )}
    </div>
  );
}
