import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { haptic } from "../helpers/haptics";
import { COURSES, COURSE_KEYS, STATUS_LABEL, type CourseCode, type Syllabus } from "../helpers/studyEngine";
import { type StudyMaterial } from "../helpers/studyMaterials";
import { useWide } from "../helpers/useWide";
import styles from "./_index.module.css";

import { Num, STATUS_COLOR, pct, upcomingFinals, type Engine } from "./StudyParts";

const OPEN_KEY = "lawstin-progress-open";
const readOpen = (): Partial<Record<CourseCode, boolean>> => {
  try { const o = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; }
};

export function ProgressView({ e, syllabus, materials, onTopic, onHow }: { onHow: () => void; e: Engine; syllabus: Syllabus; materials: StudyMaterial[]; onTopic: (c: CourseCode, t: string) => void }) {
  const wide = useWide();
  const m = e.missProfile();
  const misses = m.sneaky + m.average + m.bad;
  // On phones only the course with the nearest final starts open; what you open or close is remembered.
  const nearest = (upcomingFinals()[0]?.k ?? COURSE_KEYS[0]) as CourseCode;
  const [stored, setStored] = useState(readOpen);
  const isOpen = (k: CourseCode) => wide || (stored[k] ?? k === nearest);
  const toggle = (k: CourseCode) => {
    haptic();
    const next = { ...stored, [k]: !isOpen(k) };
    setStored(next);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  const byTopic = new Map<string, number>();
  for (const x of materials) byTopic.set(`${x.course}|${x.topic}`, (byTopic.get(`${x.course}|${x.topic}`) ?? 0) + 1);
  const roleRow = (label: string, n: number, color: string) => (
    <div className={styles.row}>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{label}</span>
        <span className={styles.meter}><i style={{ width: `${pct(n, misses)}%`, background: color }} /></span>
      </span>
      <span className={styles.rowEnd}><b>{n}</b></span>
    </div>
  );
  return (
    <>
      <div className={styles.tiles}>
        <div className={`${styles.card} ${styles.tile}`}><b>{m.correct + m.wrong ? <Num v={pct(m.correct, m.correct + m.wrong)} suffix="%" /> : "—"}</b><span>Correct overall</span></div>
        <div className={`${styles.card} ${styles.tile}`}><b><Num v={m.correct + m.wrong} /></b><span>Answers given</span></div>
        <div className={`${styles.card} ${styles.tile}`}><b><Num v={m.seen} /></b><span>Questions seen</span></div>
      </div>
      <section className={`${styles.sec} ${styles.fullRow}`}>
        <div className={styles.secH}><h2>Which wrong answers catch you</h2><button className={styles.feedToggle} onClick={onHow}>How this works</button></div>
        <div className={`${styles.card} ${styles.list} ${styles.flat} ${styles.missGrid}`}>
          {roleRow("Sneaky distractor", m.sneaky, "var(--course-pr)")}
          {roleRow("Average distractor", m.average, "var(--course-il)")}
          {roleRow("Really bad answer", m.bad, "var(--error)")}
          {roleRow("Correct but guessed", m.guessed, "var(--faint-foreground)")}
        </div>
      </section>
      {COURSE_KEYS.map((k) => {
        // The course as taught, in class order: what is covered, and how well each unit is known.
        const rows = e.coverage(k, syllabus[k], byTopic);
        if (!rows.length) return null;
        const c = COURSES[k];
        const covered = rows.filter((r) => r.n > 0).length;
        const open = isOpen(k);
        const head = (
          <>
            <span className={styles.dot} style={{ background: c.color }}>{c.short[0]}</span>
            <span className={styles.rowMain}>
              <span className={styles.rowTitle}>{c.name}</span>
              <span className={styles.rowSub}>{covered} of {rows.length} covered</span>
              <span className={styles.segBar} aria-hidden="true">{rows.map((r) => <i key={r.topic} style={{ background: STATUS_COLOR[r.status] }} />)}</span>
            </span>
            {!wide && <ChevronRight size={18} className={`${styles.chev} ${styles.courseChev} ${open ? styles.courseChevOn : ""}`} />}
          </>
        );
        return (
          <section key={k} className={styles.sec}>
            <div className={`${styles.card} ${styles.course}`}>
              {wide
                ? <div className={`${styles.row} ${styles.courseHead}`}>{head}</div>
                : <button className={`${styles.row} ${styles.courseHead}`} aria-expanded={open} onClick={() => toggle(k)}>{head}</button>}
              {open && <div className={`${styles.list} ${styles.flat} ${styles.courseBody}`}>
                {rows.map((t) => {
                  const a = t.c + t.w, acc = pct(t.c, a), col = STATUS_COLOR[t.status];
                  const body = (
                    <>
                      <span className={styles.rowMain}>
                        <span className={`${styles.rowTitle} ${styles.wrap}`}>{t.topic}</span>
                        <span className={styles.rowSub}>{t.n ? `${t.seen} of ${t.n} seen${a ? ` · ${acc}%` : ""}` : t.materials ? `${t.materials} materials` : "No questions"}</span>
                        <span className={styles.meter}><i style={{ width: `${t.n ? pct(t.seen, t.n) : 0}%`, background: col }} /></span>
                      </span>
                      <span className={`${styles.status} ${t.status === "none" ? styles.statusNone : ""}`} style={{ color: col, background: `color-mix(in srgb, ${col} 13%, transparent)` }}>{STATUS_LABEL[t.status]}</span>
                      {t.n > 0 && <ChevronRight size={18} className={styles.chev} />}
                    </>
                  );
                  return t.n > 0
                    ? <button key={t.topic} className={styles.row} onClick={() => onTopic(k, t.topics[0])}>{body}</button>
                    : <div key={t.topic} className={styles.row}>{body}</div>;
                })}
              </div>}
            </div>
          </section>
        );
      })}
    </>
  );
}

