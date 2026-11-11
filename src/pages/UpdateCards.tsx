import { Check, Sparkles } from "lucide-react";
import React, { useState } from "react";
import type { QuestionDTO } from "../endpoints/state_GET.schema";
import { haptic } from "../helpers/haptics";
import { COURSES, COURSE_KEYS, type CourseCode } from "../helpers/studyEngine";
import { type StudyMaterial, type StudyRun } from "../helpers/studyMaterials";
import { questionUpdate } from "../helpers/studySession";
import { useLawstinData } from "../helpers/useLawstinData";
import styles from "./_index.module.css";

import { type Engine } from "./StudyParts";

type Run = NonNullable<ReturnType<typeof useLawstinData>["query"]["data"]>["runs"][number];

export function UpdateCard({ e, run, onStudy }: { e: Engine; run: Run; onStudy: (items: QuestionDTO[], course: CourseCode | null) => void }) {
  // Questions written by this update: matched by batch, which update runs stamp with the run date.
  const { added, total } = questionUpdate(e, run);
  const courses = (Object.entries(run.byCourse) as [CourseCode, number][]).filter(([k, n]) => n > 0 && COURSES[k]);
  const rows = courses.map(([k, n]) => {
    const qs = added.filter((q) => q.course === k);
    const left = qs.length ? qs.filter((q) => !e.prog(q.id)?.seen).length : Math.min(n, e.queues(k).fresh.length);
    return { k, n, qs, left };
  });
  const left = rows.reduce((a, r) => a + r.left, 0);
  const doneN = Math.max(0, total - left);
  const circ = 2 * Math.PI * 15;
  const fmtDate = new Date(`${run.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const today = run.date === e.today;
  return (
    <section className={styles.sec}>
      <div className={styles.secH}><h2>{today ? "New today" : "Latest update"}</h2><small>{fmtDate}</small></div>
      <div className={`${styles.card} ${styles.upd}`}>
        <div className={styles.updTop}>
          <span className={styles.updRing}>
            <svg viewBox="0 0 36 36" className={styles.updRingSvg} aria-hidden="true">
              <circle cx="18" cy="18" r="15" className={styles.updTrack} />
              <circle cx="18" cy="18" r="15" className={styles.updVal} style={{ strokeDasharray: circ, strokeDashoffset: circ * (1 - (total ? doneN / total : 0)) }} />
            </svg>
            {left === 0 ? <Check size={16} strokeWidth={3} className={styles.updCheck} /> : <Sparkles size={16} className={styles.updSpark} />}
          </span>
          <div className={styles.updHead}>
            <b>{total} new question{total === 1 ? "" : "s"}</b>
            <span>{left === 0 ? "All studied" : `${left} left to study`}</span>
          </div>
          {left > 0 && (
            <button className={styles.updGo} onClick={() => onStudy(added, null)}>Study</button>
          )}
        </div>
        <div className={styles.updTopics}><TopicBubbles bubbles={topicBubbles(e, run, added)} onStudy={onStudy} /></div>
      </div>
    </section>
  );
}

function whenLabel(date: string, today: string) {
  const days = Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) / 86400000);
  const d = new Date(`${date}T12:00:00`);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Updates shown as a notification stack: the newest on top, earlier ones tucked behind until tapped. */
type FeedEntry = { key: string; date: string; node: (e: Engine) => React.ReactNode };

/** Question updates and study-material updates in one notification feed, newest first. */
export function UpdateFeed({ e, runs: qRuns, studyRuns, materials, onStudy }: { e: Engine; runs: Run[]; studyRuns: StudyRun[]; materials: StudyMaterial[]; onStudy: (items: QuestionDTO[], course: CourseCode | null) => void }) {
  const [open, setOpen] = useState(false);
  const runs: FeedEntry[] = [
    ...qRuns.map((r) => ({ key: `q-${r.date}`, date: r.date, node: (en: Engine) => <UpdateNote e={en} run={r} onStudy={onStudy} /> })),
    ...studyRuns.map((r) => ({ key: `s-${r.id}`, date: r.run_date, node: (en: Engine) => <StudyNote today={en.today} run={r} materials={materials} /> })),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  const earlier = runs.length - 1;
  if (!runs.length) return null;
  return (
    <section className={`${styles.sec} ${styles.fullRow}`}>
      <div className={styles.secH}>
        <h2>Updates</h2>
        {earlier > 0 && <button className={styles.feedToggle} onClick={() => { haptic(); setOpen((v) => !v); }}>{open ? "Show less" : `${earlier} earlier`}</button>}
      </div>
      {(
        <div className={`${styles.feed} ${open ? styles.feedOpen : ""}`}>
          {runs[0].node(e)}
          {!open && earlier > 0 && (
            <button className={styles.feedPeek} aria-label={`Show ${earlier} earlier updates`} onClick={() => { haptic(); setOpen(true); }}>
              <i /><i />
            </button>
          )}
          {open && runs.slice(1).map((r, i) => (
            <div key={r.key} className={styles.feedIn} style={{ animationDelay: `${i * 45}ms` }}>{r.node(e)}</div>
          ))}
        </div>
      )}
    </section>
  );
}

type Bubble = { course: CourseCode; label: string; qs: QuestionDTO[]; n: number; left: number };

/** Topics an update added, grouped by course; falls back to course totals when questions can't be matched by batch. */
function topicBubbles(e: Engine, run: Run, added: QuestionDTO[]): Bubble[] {
  const groups = new Map<string, { course: CourseCode; label: string; qs: QuestionDTO[] }>();
  for (const q of added) {
    if (!COURSES[q.course]) continue;
    const key = `${q.course}|${q.topic}`;
    const g = groups.get(key) ?? { course: q.course, label: q.topic, qs: [] };
    g.qs.push(q);
    groups.set(key, g);
  }
  const bubbles = [...groups.values()].sort((a, b) => COURSE_KEYS.indexOf(a.course) - COURSE_KEYS.indexOf(b.course) || b.qs.length - a.qs.length)
    .map((g) => ({ ...g, n: g.qs.length, left: g.qs.filter((q) => !e.prog(q.id)?.seen).length }));
  if (!bubbles.length) {
    return (Object.entries(run.byCourse) as [CourseCode, number][]).filter(([k, n]) => n > 0 && COURSES[k])
      .map(([k, n]) => ({ course: k, label: COURSES[k].short, qs: [], n, left: n }));
  }
  return bubbles;
}

type Chip = { course: CourseCode; label: string; n: number; left: number; onClick: () => void };
/** Most bubbles shown before the rest collapse into one "+N". */
const BUBBLE_CAP = 6;

/** Topic bubbles, topics with questions left first; past the cap a "+N" bubble reveals the rest in place. */
function BubbleList({ chips }: { chips: Chip[] }) {
  const [all, setAll] = useState(false);
  const sorted = [...chips].sort((a, b) => Number(b.left > 0) - Number(a.left > 0));
  const hidden = all ? 0 : Math.max(0, sorted.length - BUBBLE_CAP);
  return (
    <div className={styles.bubbles}>
      {(hidden ? sorted.slice(0, BUBBLE_CAP) : sorted).map((b) => (
        <button key={`${b.course}|${b.label}`} className={`${styles.bubble} ${b.left === 0 ? styles.bubbleDone : ""}`}
          style={{ "--c": COURSES[b.course].color } as React.CSSProperties} onClick={b.onClick}>
          {b.left === 0 ? <Check size={12} strokeWidth={3} /> : <i />}
          <span>{b.label}</span>
          <small>{b.n}</small>
        </button>
      ))}
      {hidden > 0 && (
        <button className={`${styles.bubble} ${styles.bubbleMore}`} aria-label={`Show ${hidden} more topics`} onClick={() => { haptic(); setAll(true); }}>+{hidden}</button>
      )}
    </div>
  );
}

function TopicBubbles({ bubbles, onStudy }: { bubbles: Bubble[]; onStudy: (items: QuestionDTO[], course: CourseCode | null) => void }) {
  return <BubbleList chips={bubbles.map((b) => ({ course: b.course, label: b.label, n: b.n, left: b.left, onClick: () => onStudy(b.qs, b.course) }))} />;
}

function UpdateNote({ e, run, onStudy }: { e: Engine; run: Run; onStudy: (items: QuestionDTO[], course: CourseCode | null) => void }) {
  const { added, total } = questionUpdate(e, run);
  const bubbles = topicBubbles(e, run, added);
  const left = bubbles.reduce((a, b) => a + b.left, 0);
  return (
    <div className={`${styles.card} ${styles.note}`}>
      <div className={styles.noteTop}>
        <img src="./icon-192.png" alt="" className={styles.noteIcon} />
        <span className={styles.noteApp}>Lawstin</span>
        <span className={styles.noteWhen}>{whenLabel(run.date, e.today)}</span>
      </div>
      <button className={styles.noteMain} onClick={() => onStudy(added, null)}>
        <b>{total} new question{total === 1 ? "" : "s"}</b>
        <span>{left === 0 ? "All studied" : `${left} left to study`}</span>
      </button>
      <TopicBubbles bubbles={bubbles} onStudy={onStudy} />
    </div>
  );
}

const KIND_ONE = { flashcard: "flashcard", flowchart: "flowchart", outline: "rule review", comparison: "comparison", drill: "sorting drill", hypothetical: "hypothetical" };
const KIND_MANY = { flashcard: "flashcards", flowchart: "flowcharts", outline: "rule reviews", comparison: "comparisons", drill: "sorting drills", hypothetical: "hypotheticals" };

function StudyNote({ today, run, materials }: { today: string; run: StudyRun; materials: StudyMaterial[] }) {
  const added = materials.filter((m) => m.batch === run.run_date);
  const groups = new Map<string, { course: CourseCode; label: string; n: number }>();
  for (const m of added) {
    const key = `${m.course}|${m.topic}`;
    const g = groups.get(key) ?? { course: m.course, label: m.topic, n: 0 };
    g.n++; groups.set(key, g);
  }
  let bubbles = [...groups.values()].sort((a, b) => COURSE_KEYS.indexOf(a.course) - COURSE_KEYS.indexOf(b.course) || b.n - a.n);
  if (!bubbles.length) bubbles = (Object.entries(run.by_course) as [CourseCode, number][]).filter(([k, n]) => n > 0 && COURSES[k]).map(([k, n]) => ({ course: k, label: COURSES[k].short, n }));
  const kinds = Object.entries(run.by_kind).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${(n === 1 ? KIND_ONE : KIND_MANY)[k as keyof typeof KIND_ONE] ?? k}`).join(" · ");
  const open = (course?: CourseCode) => { haptic(); window.location.hash = course ? `/courses/${course}` : "/courses"; };
  return (
    <div className={`${styles.card} ${styles.note}`}>
      <div className={styles.noteTop}>
        <img src="./icon-192.png" alt="" className={styles.noteIcon} />
        <span className={styles.noteApp}>Lawstin</span>
        <span className={styles.noteWhen}>{whenLabel(run.run_date, today)}</span>
      </div>
      <button className={styles.noteMain} onClick={() => open()}>
        <b>{run.added} new study material{run.added === 1 ? "" : "s"}</b>
        <span>{kinds}</span>
      </button>
      <BubbleList chips={bubbles.map((b) => ({ course: b.course, label: b.label, n: b.n, left: b.n, onClick: () => open(b.course) }))} />
    </div>
  );
}

