import React, { useEffect, useRef, useState } from "react";
import { useModalFocus } from "../helpers/useModalFocus";
import { X, Check, ChevronRight, ChevronLeft, Target, BookOpen } from "lucide-react";
import { Button } from "./Button";
import IssueSpot from "./tools/IssueSpot";
import { RulesPanel } from "./Rulebook";
import { readCache, writeCache } from "../helpers/offlineCache";
import { Textarea } from "./Textarea";
import { Skeleton } from "./Skeleton";
import { useLawstinAi } from "../helpers/useLawstinAi";
import { type GradeDTO, type SpotterDTO } from "../endpoints/ai_POST.schema";
import { COURSES, EXAMS, type CourseCode } from "../helpers/studyEngine";
import type { Hypothetical } from "../helpers/studyMaterials";
import { readDrafts, saveDraft, removeDraft, draftKey, defaultEssayLength, essayGroups, essayTrend, type SpotEntry, type WrittenDraft, type useWritten, type WrittenEntry } from "../helpers/useWritten";
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
  const saved = useState(() => hypo ? drafts[draftKey(fromHypo(hypo))] : undefined)[0];
  const [course, setCourse] = useState<CourseCode>(hypo?.course ?? (openCourse === "pr" ? "il" : openCourse) ?? saved?.spot.course ?? "il");
  const lastLength = (c: CourseCode) => readCache<Partial<Record<CourseCode, Length>>>("written-length")?.[c] ?? "short";
  const [length, setLength] = useState<Length>(() => full ? "full" : defaultEssayLength(course, lastLength(course)));
  const [attemptOf, setAttemptOf] = useState(saved?.attemptOf);
  const [resultEntry, setResultEntry] = useState<WrittenEntry | null>(null);
  const [spotting, setSpotting] = useState<{ course: CourseCode; hypo?: Hypothetical; entry?: SpotEntry } | null>(null);
  const [rules, setRules] = useState(false);
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
  useEffect(() => { if (spot && !result) keep({ spot, answer, seconds, ready, attemptOf }); }, [spot, answer, result, seconds, ready, attemptOf]);
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
  useBackClose(close, !spotting);
  const modalRef = useModalFocus<HTMLDivElement>(!spotting);

  const resumeDraft = (draft: WrittenDraft) => {
    setAttemptOf(draft.attemptOf); setResultEntry(null); setCourse(draft.spot.course); setSpot(draft.spot); setAnswer(draft.answer); setSeconds(draft.seconds ?? 0); setReady(!!draft.ready); setResult(null); setErr(draft.ready && !navigator.onLine ? savedMessage : null);
  };
  const discard = () => {
    if (!spot) return;
    const previous = { spot, answer, seconds, ready, attemptOf };
    removeDraft(spot); setDrafts(readDrafts()); setSpot(null); setAnswer(""); setReady(false); setErr(null);
    toast("Draft discarded", { action: { label: "Undo", onClick: () => resumeDraft(previous) } });
  };
  /** The next verified hypothetical of this length not yet written: weak topics first, then the newest class. */
  const nextHypo = () => hypos
    .filter((h) => h.course === course && lengthOf(h.minutes) === length && !written.done.has(h.id) && h.id !== spot?.materialId)
    .sort((a, b) => Number(weak.has(`${b.course}|${b.topic}`)) - Number(weak.has(`${a.course}|${a.topic}`)) || b.class_date.localeCompare(a.class_date))[0];
  const newSpot = async () => {
    haptic();
    setErr(null); setResult(null); setResultEntry(null); setAttemptOf(undefined); setAnswer(""); setSeconds(0); setReady(false);
    writeCache("written-length", { ...(readCache("written-length") ?? {}), [course]: length });
    const h = nextHypo();
    setSpot(null);
    if (h) { setSpot({ ...fromHypo(h), minutes: MINUTES[length] }); return; }
    try {
      const r = await spotter.mutateAsync({ course, length });
      setSpot({ ...r.spotter, minutes: r.spotter.minutes ?? MINUTES[length] });
    } catch (e) { setErr(errText(e)); }
  };

  const submit = async () => {
    if (!spot || !answer.trim() || grading) return;
    haptic(); setReady(true); keep({ spot, answer, seconds, ready: true, attemptOf });
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
        facts: spot.facts, call: spot.call, answer, words, seconds, minutes: spot.minutes, grade: r.grade, attemptOf };
      written.add(entry);
      setResultEntry(entry); setResult(r.grade); setReady(false); removeDraft(spot); setDrafts(readDrafts());
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
  const currentEntry = view ?? resultEntry;
  const firstAttempt = currentEntry?.attemptOf ? written.list.find(e => e.id === currentEntry.attemptOf) : undefined;
  const trend = essayTrend(written.list, course);
  const groups = essayGroups(written.list.filter(e => e.course === course));
  const again = () => {
    if (!currentEntry) return;
    const e = currentEntry;
    const prompt: SpotterDTO = { course: e.course, topic: e.topic, facts: e.facts, call: e.call, minutes: e.minutes ?? 15, materialId: e.materialId,
      issues: reference?.map(a => a.issue) ?? [...e.grade.spotted, ...e.grade.missed].map(a => a.issue), reference };
    const first = e.attemptOf ?? groups.find(g => g.some(a => a.id === e.id))?.[0].id ?? e.id;
    const existing = readDrafts()[draftKey(prompt)];
    if (existing) { setView(null); resumeDraft(existing); return; }
    const draft = { spot: prompt, answer: "", seconds: 0, ready: false, attemptOf: first };
    keep(draft); setView(null); resumeDraft(draft); setRules(false); scroll.current?.scrollTo({ top: 0 });
  };
  const home = () => { setView(null); setSpot(null); setResult(null); setResultEntry(null); setRules(false); setErr(null); setAnswer(""); setSeconds(0); };
  const fromSpot = (h: Hypothetical) => {
    const prompt = fromHypo(h);
    setSpotting(null); setView(null); setCourse(h.course); setResult(null); setResultEntry(null); setAttemptOf(undefined); setRules(false);
    resumeDraft(readDrafts()[draftKey(prompt)] ?? { spot: prompt, answer: "", seconds: 0, ready: false });
  };
  const tone = (n: number) => (n >= 8 ? styles.scoreOk : n >= 6 ? styles.scoreMid : styles.scoreBad);

  if (spotting) return <IssueSpot course={spotting.course} hypo={spotting.hypo} entry={spotting.entry} onClose={() => setSpotting(null)} onWrite={fromSpot} />;
  return (
    <div ref={modalRef} tabIndex={-1} className={`${styles.modal} ${closing ? styles.closing : ""} ${className ?? ""}`} role="dialog" aria-modal="true" aria-label="Written practice">
      <div className={styles.top}>
        <div className={styles.topIn}>
          {cur ? <button className={styles.x} aria-label="Back to essays" disabled={grading} onClick={home}><ChevronLeft size={18} /></button> : <span className={styles.spacer} />}
          <span className={styles.topTitle}>Written practice</span>
          <button className={styles.x} onClick={close} aria-label="Close"><X size={17} strokeWidth={2.4} /></button>
        </div>
      </div>

      <div className={`${styles.workspace} ${rules ? styles.withRules : ""}`}><div className={styles.scroll} ref={scroll}>
        <div className={styles.body}>
          {!cur && !spotter.isPending && (
            <>
              <div className={styles.startGrid}>
                <div className={styles.start}>
                  <h1 className={styles.startTitle}>Written practice</h1>
                  {Object.values(drafts).filter(d => d.spot.course === course).map(d => <Button key={draftKey(d.spot)} variant="secondary" className={styles.big} onClick={() => resumeDraft(d)}>Continue your draft<span className={styles.draftTopic}>{d.spot.topic}</span></Button>)}
                  <div className={styles.seg} role="group" aria-label="Course">
                    {(["il", "asy"] as const).map(k => <button key={k} aria-pressed={course === k} className={course === k ? styles.segOn : ""} onClick={() => { haptic(); setCourse(k); setLength(defaultEssayLength(k, lastLength(k))); }}>{COURSES[k].short}</button>)}
                  </div>
                  <Button className={`${styles.big} ${styles.cta}`} disabled={!hypos.some(h => h.course === course)} onClick={() => setSpotting({ course })}>Spot the issues · 3 min</Button>
                  <div className={styles.essayChoice}>
                    <div className={styles.seg} role="group" aria-label="Length">{(["short", "full"] as const).map(k => <button key={k} aria-pressed={length === k} className={length === k ? styles.segOn : ""} onClick={() => { haptic(); setLength(k); writeCache("written-length", { ...(readCache("written-length") ?? {}), [course]: k }); }}>{MINUTES[k]} minutes</button>)}</div>
                    <Button variant="secondary" className={styles.big} onClick={newSpot}>Write an essay</Button>
                  </div>
                </div>
                <section className={styles.history}>
                  {!!trend.essays.length && <section className={styles.sec}><h2 className={styles.histH}>Your trend</h2>
                    <div className={styles.card}>
                      <div className={styles.trendScroll}><div className={styles.trend} style={{ minWidth: Math.max(260, trend.essays.length * 48) }} aria-label="Essay scores">
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={trend.essays.map((e, i, all) => `${all.length === 1 ? 50 : 10 + i / (all.length - 1) * 80},${90 - e.grade.score * 8}`).join(" ")} /></svg>
                        {trend.essays.map((e, i, all) => <button key={e.id} style={{ left: `${all.length === 1 ? 50 : 10 + i / (all.length - 1) * 80}%`, top: `${90 - e.grade.score * 8}%` }} aria-label={`Essay ${fmtDay(e.day)}, ${e.grade.score} of 10`} onClick={() => { setView(e); scroll.current?.scrollTo({ top: 0 }); }}><span /><b>{e.grade.score}</b></button>)}
                      </div></div>
                      <div className={styles.bars}>{(["issues", "rules", "application"] as const).map(part => trend.rubric[part] !== null && <div key={part} className={styles.barRow}><span>{part[0].toUpperCase() + part.slice(1)}</span><i><b style={{ width: `${trend.rubric[part]! * 10}%` }} /></i><span>{trend.rubric[part]!.toFixed(1)}</span></div>)}</div>
                    </div>
                  </section>}
                  {(groups.length > 0 || written.spots.some(e => e.course === course)) && <section className={styles.sec}><h2 className={styles.histH}>Your essays</h2>
                    {[...groups.map(attempts => ({ at: attempts[attempts.length - 1].at, attempts })), ...written.spots.filter(e => e.course === course).map(entry => ({ at: entry.at, entry }))].sort((a, b) => b.at.localeCompare(a.at)).map(item => "attempts" in item ? <div key={item.attempts[0].id} className={styles.card}>
                      <h3 className={styles.groupTitle}>{hypos.find(h => h.id === item.attempts[0].materialId)?.title ?? item.attempts[0].topic}</h3>
                      {item.attempts.map((e, i) => <button key={e.id} className={styles.hist} onClick={() => { haptic(); setView(e); scroll.current?.scrollTo({ top: 0 }); }}>
                        <span className={`${styles.score} ${tone(e.grade.score)}`}>{e.grade.score}</span><span className={styles.histMain}><b>{item.attempts.length > 1 ? `Attempt ${i + 1}` : e.topic}</b><span>{fmtDay(e.day)} · {e.words} words · {clock(e.seconds)}</span></span><ChevronRight size={16} />
                      </button>)}
                    </div> : <button key={`spot:${item.entry.id}`} className={`${styles.card} ${styles.hist}`} onClick={() => setSpotting({ course, entry: item.entry })}>
                      <span className={styles.histMain}><b>{item.entry.caught} of {item.entry.total} issues</b><span>{hypos.find(h => h.id === item.entry.id)?.title ?? item.entry.topic} · {fmtDay(item.entry.day)}</span></span><ChevronRight size={16} />
                    </button>)}
                  </section>}
                </section>
              </div>
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
              <div className={styles.writingTools}><span className={`${styles.clock} ${!shown && time > limit ? styles.clockOver : ""}`} role="timer">{clock(time)}</span><Button variant="secondary" onClick={() => setRules(true)} aria-expanded={rules}><BookOpen size={18} />Rules</Button></div>
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
                  <Textarea className={styles.answer} value={answer} onChange={(e) => { setAnswer(e.target.value); if (spot) keep({ spot, answer: e.target.value, seconds, ready, attemptOf }); }} aria-label="Your answer" placeholder="Your answer" disabled={grading} />
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

                  {firstAttempt && currentEntry && <section className={styles.sec}><h2 className={styles.histH}>Your attempts</h2><div className={styles.attempts}>
                    {[firstAttempt, currentEntry].map((e, i) => <div key={e.id} className={`${styles.card} ${styles.bars}`}><h3>{i ? "This attempt" : "First attempt"}</h3><strong>{e.grade.score}/10 {i ? `(${e.grade.score - firstAttempt.grade.score >= 0 ? "+" : ""}${e.grade.score - firstAttempt.grade.score})` : ""}</strong>
                      {(["issues", "rules", "application"] as const).map(part => <div key={part} className={styles.attemptPart}><span>{part[0].toUpperCase() + part.slice(1)}</span><b>{e.grade.rubric?.[part] ?? "Unscored"}{i && e.grade.rubric && firstAttempt.grade.rubric ? ` (${e.grade.rubric[part] - firstAttempt.grade.rubric[part] >= 0 ? "+" : ""}${e.grade.rubric[part] - firstAttempt.grade.rubric[part]})` : ""}</b></div>)}
                    </div>)}
                  </div></section>}
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
      {rules && cur && <RulesPanel course={cur.course} topic={cur.topic} onClose={() => setRules(false)} />}
      </div>

      {cur && (
        <div className={styles.foot}>
          <div className={styles.footIn}><div className={styles.footRow}>
            {view ? (
              <><Button variant="secondary" className={styles.side} onClick={home}>Back</Button><Button className={`${styles.big} ${styles.cta}`} onClick={again}>Write it again</Button></>
            ) : !result ? (
              <>
                <Button variant="secondary" className={styles.side} disabled={grading} onClick={() => { setSpot(null); setErr(null); }}>New</Button>
                <Button variant="secondary" className={styles.side} disabled={grading} onClick={discard}>Discard</Button>
                <Button className={`${styles.big} ${styles.cta}`} disabled={!answer.trim() || grading} onClick={submit}>{grading ? "Grading…" : ready && online ? "Grade now" : "Grade my answer"}</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" className={styles.side} onClick={home}>Essays</Button>
                <Button className={`${styles.big} ${styles.cta}`} onClick={again}>Write it again</Button>
                <Button variant="secondary" className={styles.big} onClick={newSpot}>New fact pattern</Button>
              </>
            )}
          </div></div>
        </div>
      )}
    </div>
  );
}
