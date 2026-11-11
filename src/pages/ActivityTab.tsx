import { ChevronRight, GraduationCap } from "lucide-react";
import { useState } from "react";
import { Aura, auraHost } from "../components/Aura";
import type { QuestionDTO } from "../endpoints/state_GET.schema";
import { dateKey } from "../helpers/dateKey";
import { haptic } from "../helpers/haptics";
import { COURSES, type CourseCode } from "../helpers/studyEngine";
import { useLawstinData } from "../helpers/useLawstinData";
import { useStudyLibrary } from "../helpers/useStudyLibrary";
import styles from "./_index.module.css";

import { pct, type Engine, type MissedTopic } from "./StudyParts";
import { UpdateFeed } from "./UpdateCards";

/** Topics with misses, worst first, each opening a short lesson; the top row mixes the weakest few. */
function MissedTopics({ topics, onLesson }: { topics: MissedTopic[]; onLesson: (topics: MissedTopic[]) => void }) {
  const [open, setOpen] = useState(false);
  const mix = topics.slice(0, 4);
  const count = mix.reduce((a, t) => a + Math.min(3, t.items.length), 0);
  const more = topics.length - 4;
  return (
    <section className={`${styles.sec} ${styles.fullRow}`}>
      <div className={styles.secH}>
        <h2>Missed topics</h2>
        {more > 0 && <button className={styles.feedToggle} aria-expanded={open} onClick={() => { haptic(); setOpen((v) => !v); }}>{open ? "Show less" : `${more} more`}</button>}
      </div>
      {topics.length > 1 && (
        <button className={`${styles.card} ${styles.lessonHero} ${auraHost}`} onClick={() => onLesson(mix)}>
          <Aura colors={[COURSES[mix[0].course].color, "var(--uh-red)", COURSES[mix[1].course].color]} />
          <span className={styles.lessonIcon}><GraduationCap size={22} /></span>
          <span className={styles.rowMain}><span className={styles.rowTitle}>Mixed lesson</span><span className={styles.rowSub}>{mix.length} topics · {count} questions</span></span>
          <ChevronRight size={18} className={styles.chev} />
        </button>
      )}
      <div className={`${styles.card} ${styles.list}`}>
        {(open ? topics : topics.slice(0, 4)).map((t) => {
          const c = COURSES[t.course], still = t.items.filter((it) => it.p.lastCorrect === false).length;
          return (
            <button key={`${t.course}|${t.topic}`} className={styles.row} onClick={() => onLesson([t])}>
              <span className={styles.dot} style={{ background: c.color }}>{c.short[0]}</span>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{t.topic}</span>
                <span className={styles.rowSub}>{still ? `${still} still missed` : `${t.items.length} to revisit`}{t.c + t.w ? ` · ${pct(t.c, t.c + t.w)}% correct` : ""}</span>
              </span>
              <ChevronRight size={18} className={styles.chev} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

const fmtDay = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, o);
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
/** Fill step for a day: 0 is the empty track, 1 to 4 get darker with more answers. */
const dayLevel = (n: number) => (n <= 0 ? 0 : n < 10 ? 1 : n < 20 ? 2 : n < 40 ? 3 : 4);

/** The last five weeks (Sunday first, ending with this week): darker green for more answers; tap a day for its numbers. */
function StudyCalendar({ days }: { days: { date: string; answered: number; correct: number }[] }) {
  const today = dateKey.today();
  const [sel, setSel] = useState(today);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const dow = new Date(`${today}T12:00:00`).getDay();
  const start = dateKey.addDays(today, -dow - 28);
  const cells = Array.from({ length: 35 }, (_, i) => dateKey.addDays(start, i));
  const cur = byDate.get(sel);
  return (
    <section className={styles.sec}>
      <div className={styles.secH}>
        <h2>Study calendar</h2>
        <small>{cur?.answered ? `${cur.answered} answered · ${pct(cur.correct, cur.answered)}%` : fmtDay(sel, { month: "short", day: "numeric" })}</small>
      </div>
      <div className={`${styles.card} ${styles.cal}`}>
        <div className={styles.calGrid} aria-hidden="true">{WEEKDAYS.map((w, i) => <span key={i} className={styles.calHead}>{w}</span>)}</div>
        <div className={styles.calGrid}>
          {cells.map((d) => {
            if (d > today) return <span key={d} className={`${styles.calDay} ${styles.calFuture}`} aria-hidden="true" />;
            const n = byDate.get(d)?.answered ?? 0;
            return (
              <button key={d} aria-pressed={sel === d} aria-label={`${fmtDay(d, { month: "short", day: "numeric" })}: ${n} answered`}
                className={`${styles.calDay} ${styles[`calL${dayLevel(n)}`]} ${d === today ? styles.calToday : ""} ${sel === d ? styles.calSel : ""}`}
                onClick={() => { if (sel !== d) haptic(); setSel(d); }}>{Number(d.slice(8))}</button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ActivityView({ e, state, onStudy, onLesson }: { e: Engine; state: NonNullable<ReturnType<typeof useLawstinData>["query"]["data"]>; onStudy: (items: QuestionDTO[], course: CourseCode | null) => void; onLesson: (topics: MissedTopic[]) => void }) {
  const days = e.lastNDays(14);
  const max = Math.max(10, ...days.map((d) => d.answered));
  const fmt = fmtDay;
  const library = useStudyLibrary();
  const total = days.reduce((a, d) => a + d.answered, 0);
  const missed = e.missedTopics();
  return (
    <>
      {missed.length > 0 && <MissedTopics topics={missed} onLesson={onLesson} />}
      <StudyCalendar days={state.days} />
      {total > 0 && <section className={styles.sec}>
        <div className={styles.secH}><h2>Last 14 days</h2><small>{total} answers</small></div>
        <div className={`${styles.card} ${styles.bars}`}>
          <div className={styles.barsRow}>
            {days.map((d) => (
              <div key={d.date} className={styles.bar} style={{ height: `${Math.max(3, (d.answered / max) * 100)}%` }} title={`${fmt(d.date, { month: "short", day: "numeric" })}: ${d.answered} answered`}>
                <i style={{ height: `${d.answered ? (d.correct / d.answered) * 100 : 0}%`, background: "var(--success)" }} />
                <i style={{ height: `${d.answered ? ((d.answered - d.correct) / d.answered) * 100 : 0}%`, background: "var(--error)", opacity: 0.75 }} />
              </div>
            ))}
          </div>
          <div className={styles.barsX}>{days.map((d, i) => <span key={d.date}>{i % 2 ? "" : Number(d.date.slice(8))}</span>)}</div>
          <div className={styles.legend}><span><i style={{ background: "var(--success)" }} />Correct</span><span><i style={{ background: "var(--error)", opacity: 0.75 }} />Missed</span></div>
        </div>
      </section>}
      <UpdateFeed e={e} runs={state.runs.slice(0, 20)} studyRuns={library.data?.runs.slice(0, 20) ?? []} materials={library.data?.materials ?? []} onStudy={onStudy} />
    </>
  );
}

