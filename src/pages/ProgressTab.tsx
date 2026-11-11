import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { haptic } from "../helpers/haptics";
import { COURSES, COURSE_KEYS, STATUS_LABEL, type CourseCode, type Syllabus } from "../helpers/studyEngine";
import { ANSWER_LABEL, missedRules, queuedRuleAnswers, useRuleAnswers, type RuleAnswer } from "../helpers/missedRules";
import { useExams } from "../helpers/useExams";
import { BottomSheet } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { afterOverlayClose } from "../helpers/useBackClose";
import toolStyles from "../components/ExamTools.module.css";
import { type StudyMaterial } from "../helpers/studyMaterials";
import { useWide } from "../helpers/useWide";
import styles from "./_index.module.css";

import { Num, STATUS_COLOR, pct, upcomingFinals, type Engine } from "./StudyParts";

const OPEN_KEY = "lawstin-progress-open";
const readOpen = (): Partial<Record<CourseCode, boolean>> => {
  try { const o = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; }
};

export function ProgressView({ e, syllabus, materials, onTopic }: { onHow: () => void; e: Engine; syllabus: Syllabus; materials: StudyMaterial[]; onTopic: (c: CourseCode, t: string) => void }) {
  const wide = useWide();
  const exams = useExams();
  const progress = e.questions.flatMap(q => { const p = e.prog(q.id); return p ? [p] : []; });
  const history = useRuleAnswers(progress);
  const answers = [...(history.data ?? []), ...queuedRuleAnswers(e.questions)];
  const rules = missedRules(e.questions, progress, answers);
  const [role, setRole] = useState<string | null>(null);
  const ownAnswers: RuleAnswer[] = role === "guessed" ? progress.filter(p => p.guessed > 0 && p.box === 1 && p.lastCorrect === true).flatMap(p => {
    const q = e.questions.find(q => q.id === p.questionId), choice = q?.choices.find(c => c.id === p.lastChoice);
    return q && choice && p.lastAt ? [{ question_id: q.id, choice: choice.id, is_correct: true, role: choice.role, local_date: p.lastAt.slice(0, 10), answered_at: p.lastAt }] : [];
  }) : answers.filter(a => a.role === role && !a.is_correct);
  const go = (hash: string) => { setRole(null); afterOverlayClose(() => { window.location.hash = hash; }); };
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
  const roleRow = (kind: string, n: number, color: string) => (
    <button className={styles.row} onClick={() => setRole(kind)}>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{ANSWER_LABEL[kind]}</span>
        <span className={styles.meter}><i style={{ width: `${pct(n, misses)}%`, background: color }} /></span>
      </span>
      <span className={styles.rowEnd}><b>{n}</b></span>
      <ChevronRight size={16} className={styles.chev} />
    </button>
  );
  return (
    <>
      <div className={styles.tiles}>
        <div className={`${styles.card} ${styles.tile}`}><b>{m.correct + m.wrong ? <Num v={pct(m.correct, m.correct + m.wrong)} suffix="%" /> : "—"}</b><span>Correct overall</span></div>
        <div className={`${styles.card} ${styles.tile}`}><b><Num v={e.totalAnswers} /></b><span>Answers given</span></div>
        <div className={`${styles.card} ${styles.tile}`}><b><Num v={m.seen} /></b><span>Questions seen</span></div>
      </div>
      <section className={`${styles.sec} ${styles.fullRow}`}>
        <div className={styles.secH}><h2>How you miss</h2></div>
        <div className={`${styles.card} ${styles.list} ${styles.flat} ${styles.missGrid}`}>
          {roleRow("sneaky", m.sneaky, "var(--course-pr)")}
          {roleRow("average", m.average, "var(--course-il)")}
          {roleRow("bad", m.bad, "var(--error)")}
          <button className={styles.row} onClick={() => setRole("guessed")}>
            <span className={styles.rowMain}><span className={styles.rowTitle}>Right, but guessed</span></span>
            <span className={styles.rowEnd}><b>{m.guessed}</b></span>
            <ChevronRight size={16} className={styles.chev} />
          </button>
        </div>
      </section>
      <section className={styles.sec}><div className={styles.card}>
        {exams.list.length > 0 && <button className={styles.row} onClick={() => { window.location.hash = "#/tool/ExamHistory"; }}>
          <span className={styles.rowMain}><span className={styles.rowTitle}>Practice exams</span><span className={toolStyles.progressDots} role="img" aria-label={exams.list.slice(0, 5).reverse().map(e => `${e.score} of ${e.total}`).join(", ")}>{exams.list.slice(0, 5).reverse().map(e => <i key={e.at} style={{ opacity: 0.25 + e.score / e.total * 0.75 }} />)}</span></span><ChevronRight size={18} className={styles.chev} />
        </button>}
        <button className={styles.row} onClick={() => { window.location.hash = "#/tool/MissedRules"; }}><span className={styles.rowMain}><span className={styles.rowTitle}>Rules you miss</span></span><span className={styles.rowEnd}><b>{rules.length}</b></span><ChevronRight size={18} className={styles.chev} /></button>
      </div></section>
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
      {role && <BottomSheet title={ANSWER_LABEL[role]} onClose={() => setRole(null)}>
        <div className={toolStyles.stack}>
          {role === "sneaky" && <Button className={`${styles.big} ${styles.cta}`} onClick={() => go("#/tool/CloseCalls")}>Practice close calls</Button>}
          <div className={toolStyles.card}>{ownAnswers.sort((a, b) => b.answered_at.localeCompare(a.answered_at)).map((a, i) => {
            const q = e.questions.find(q => q.id === a.question_id), picked = q?.choices.find(c => c.id === a.choice), right = q?.choices.find(c => c.id === q.answer);
            return q && picked && right ? <button key={`${a.answered_at}-${i}`} className={toolStyles.row} onClick={() => go(`#/q/${q.id}`)}><span className={toolStyles.main}><span className={toolStyles.title}>{q.prompt}</span><span className={toolStyles.muted}>Your answer · {picked.text}</span><span>Correct answer · {right.text}</span></span><ChevronRight size={18} /></button> : null;
          })}</div>
          {!ownAnswers.length && <div className={`${toolStyles.card} ${toolStyles.empty}`}><h2>{history.isFetching ? "Loading answers…" : "No answers yet"}</h2></div>}
        </div>
      </BottomSheet>}
    </>
  );
}

