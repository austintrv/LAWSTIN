import { ChevronRight, GraduationCap } from "lucide-react";
import { useState } from "react";
import { Aura, auraHost } from "../components/Aura";
import { BottomSheet } from "../components/BottomSheet";
import { Button } from "../components/Button";
import toolStyles from "../components/ExamTools.module.css";
import type { QuestionDTO, OutputType as QuestionState } from "../endpoints/state_GET.schema";
import { dateKey } from "../helpers/dateKey";
import { haptic } from "../helpers/haptics";
import { ANSWER_LABEL, missedRules, queuedRuleAnswers, useRuleAnswers, type RuleAnswer } from "../helpers/missedRules";
import { COURSES, COURSE_KEYS, STATUS_LABEL, type CourseCode, type Syllabus } from "../helpers/studyEngine";
import { type StudyMaterial } from "../helpers/studyMaterials";
import { useExams } from "../helpers/useExams";
import { useStudyLibrary } from "../helpers/useStudyLibrary";
import { afterOverlayClose } from "../helpers/useBackClose";
import { useWide } from "../helpers/useWide";
import styles from "./_index.module.css";
import { Num, STATUS_COLOR, pct, upcomingFinals, type Engine, type MissedTopic } from "./StudyParts";
import { UpdateFeed } from "./UpdateCards";

const OPEN_KEY = "lawstin-progress-open";
const readOpen = (): Partial<Record<CourseCode, boolean>> => {
  try {
    const o = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
};

const fmtDay = (d: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, o);
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const dayLevel = (n: number) => (n <= 0 ? 0 : n < 10 ? 1 : n < 20 ? 2 : n < 40 ? 3 : 4);

/** Missed topics from Activity folded in, worst first. */
function MissedTopics({
  topics,
  onLesson,
}: {
  topics: MissedTopic[];
  onLesson: (topics: MissedTopic[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const mix = topics.slice(0, 4);
  const count = mix.reduce((a, t) => a + Math.min(3, t.items.length), 0);
  const more = topics.length - 4;
  return (
    <section className={`${styles.sec} ${styles.fullRow}`}>
      <div className={styles.secH}>
        <h2>Missed topics</h2>
        {more > 0 && (
          <button
            className={styles.feedToggle}
            aria-expanded={open}
            onClick={() => {
              haptic();
              setOpen((v) => !v);
            }}
          >
            {open ? "Show less" : `${more} more`}
          </button>
        )}
      </div>
      {topics.length > 1 && (
        <button
          className={`${styles.card} ${styles.lessonHero} ${auraHost}`}
          onClick={() => onLesson(topics)}
        >
          <Aura colors={[COURSES[mix[0].course].color, "var(--uh-red)", COURSES[mix[1].course].color]} />
          <span className={styles.lessonIcon}>
            <GraduationCap size={22} />
          </span>
          <span className={styles.rowMain}>
            <span className={styles.rowTitle}>Missed topics</span>
            <span className={styles.rowSub}>
              {mix.length} topics · {count} questions
            </span>
          </span>
          <ChevronRight size={18} className={styles.chev} />
        </button>
      )}
      <div className={`${styles.card} ${styles.list}`}>
        {(open ? topics : topics.slice(0, 4)).map((t) => {
          const c = COURSES[t.course];
          const still = t.items.filter((it) => it.p.lastCorrect === false).length;
          return (
            <button
              key={`${t.course}|${t.topic}`}
              className={styles.row}
              onClick={() => onLesson([t])}
            >
              <span className={styles.dot} style={{ background: c.color }}>
                {c.short[0]}
              </span>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{t.topic}</span>
                <span className={styles.rowSub}>
                  {still ? `${still} still missed` : `${t.items.length} to revisit`}
                  {t.c + t.w ? ` · ${pct(t.c, t.c + t.w)}% correct` : ""}
                </span>
              </span>
              <ChevronRight size={18} className={styles.chev} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** The last five weeks: darker green for more answers; tap a day for its numbers. */
function StudyCalendar({
  days,
}: {
  days: { date: string; answered: number; correct: number }[];
}) {
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
        <small>
          {cur?.answered
            ? `${cur.answered} answered · ${pct(cur.correct, cur.answered)}%`
            : fmtDay(sel, { month: "short", day: "numeric" })}
        </small>
      </div>
      <div className={`${styles.card} ${styles.cal}`}>
        <div className={styles.calGrid} aria-hidden="true">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className={styles.calHead}>
              {w}
            </span>
          ))}
        </div>
        <div className={styles.calGrid}>
          {cells.map((d) => {
            if (d > today)
              return (
                <span
                  key={d}
                  className={`${styles.calDay} ${styles.calFuture}`}
                  aria-hidden="true"
                />
              );
            const n = byDate.get(d)?.answered ?? 0;
            return (
              <button
                key={d}
                aria-pressed={sel === d}
                aria-label={`${fmtDay(d, { month: "short", day: "numeric" })}: ${n} answered`}
                className={`${styles.calDay} ${styles[`calL${dayLevel(n)}`]} ${
                  d === today ? styles.calToday : ""
                } ${sel === d ? styles.calSel : ""}`}
                onClick={() => {
                  if (sel !== d) haptic();
                  setSel(d);
                }}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ProgressView({
  onHow,
  e,
  state,
  syllabus,
  materials,
  onTopic,
  onLesson,
  onStudy,
}: {
  onHow?: () => void;
  e: Engine;
  state?: QuestionState;
  syllabus: Syllabus;
  materials: StudyMaterial[];
  onTopic: (c: CourseCode, t: string) => void;
  onLesson: (topics: MissedTopic[]) => void;
  onStudy: (items: QuestionDTO[], course: CourseCode | null) => void;
}) {
  const wide = useWide();
  const exams = useExams();
  const library = useStudyLibrary();
  const progress = e.questions.flatMap((q) => {
    const p = e.prog(q.id);
    return p ? [p] : [];
  });
  const history = useRuleAnswers(progress);
  const answers = [...(history.data ?? []), ...queuedRuleAnswers(e.questions)];
  const rules = missedRules(e.questions, progress, answers);
  const [role, setRole] = useState<string | null>(null);

  const ownAnswers: RuleAnswer[] =
    role === "guessed"
      ? progress
          .filter((p) => p.guessed > 0 && p.box === 1 && p.lastCorrect === true)
          .flatMap((p) => {
            const q = e.questions.find((q) => q.id === p.questionId);
            const choice = q?.choices.find((c) => c.id === p.lastChoice);
            return q && choice && p.lastAt
              ? [
                  {
                    question_id: q.id,
                    choice: choice.id,
                    is_correct: true,
                    role: choice.role,
                    local_date: p.lastAt.slice(0, 10),
                    answered_at: p.lastAt,
                  },
                ]
              : [];
          })
      : answers.filter((a) => a.role === role && !a.is_correct);

  const go = (hash: string) => {
    setRole(null);
    afterOverlayClose(() => {
      window.location.hash = hash;
    });
  };

  const m = e.missProfile();
  const misses = m.sneaky + m.average + m.bad;

  const nearest = (upcomingFinals()[0]?.k ?? COURSE_KEYS[0]) as CourseCode;
  const [stored, setStored] = useState(readOpen);
  const isOpen = (k: CourseCode) => wide || (stored[k] ?? k === nearest);
  const toggle = (k: CourseCode) => {
    haptic();
    const next = { ...stored, [k]: !isOpen(k) };
    setStored(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const byTopic = new Map<string, number>();
  for (const x of materials)
    byTopic.set(`${x.course}|${x.topic}`, (byTopic.get(`${x.course}|${x.topic}`) ?? 0) + 1);

  const roleRow = (kind: string, n: number, color: string) => n > 0 && (
    <button className={styles.row} onClick={() => setRole(kind)}>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{ANSWER_LABEL[kind]}</span>
        <span className={styles.meter}>
          <i style={{ width: `${pct(n, misses)}%`, background: color }} />
        </span>
      </span>
      <span className={styles.rowEnd}>
        <b>{n}</b>
      </span>
      <ChevronRight size={16} className={styles.chev} />
    </button>
  );

  const days14 = e.lastNDays(14);
  const max14 = Math.max(10, ...days14.map((d) => d.answered));
  const total14 = days14.reduce((a, d) => a + d.answered, 0);
  const missedTopicsList = e.missedTopics();

  // Component sections
  const tilesSection = e.totalAnswers > 0 && (
    <div className={styles.tiles}>
      <div className={`${styles.card} ${styles.tile}`}>
        <b>{m.correct + m.wrong ? <Num v={pct(m.correct, m.correct + m.wrong)} suffix="%" /> : "—"}</b>
        <span>Correct overall</span>
      </div>
      <div className={`${styles.card} ${styles.tile}`}>
        <b>
          <Num v={e.totalAnswers} />
        </b>
        <span>Answers given</span>
      </div>
      <div className={`${styles.card} ${styles.tile}`}>
        <b>
          <Num v={m.seen} />
        </b>
        <span>Questions seen</span>
      </div>
    </div>
  );

  const calendarSection = state?.days ? (
    <>
      <StudyCalendar days={state.days} />
      {total14 > 0 && (
        <section className={styles.sec}>
          <div className={styles.secH}>
            <h2>Last 14 days</h2>
            <small>{total14} answers</small>
          </div>
          <div className={`${styles.card} ${styles.bars}`}>
            <div className={styles.barsRow}>
              {days14.map((d) => (
                <div
                  key={d.date}
                  className={styles.bar}
                  style={{ height: `${Math.max(3, (d.answered / max14) * 100)}%` }}
                  title={`${fmtDay(d.date, { month: "short", day: "numeric" })}: ${d.answered} answered`}
                >
                  <i
                    style={{
                      height: `${d.answered ? (d.correct / d.answered) * 100 : 0}%`,
                      background: "var(--success)",
                    }}
                  />
                  <i
                    style={{
                      height: `${d.answered ? ((d.answered - d.correct) / d.answered) * 100 : 0}%`,
                      background: "var(--error)",
                      opacity: 0.75,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className={styles.barsX}>
              {days14.map((d, i) => (
                <span key={d.date}>{i % 2 ? "" : Number(d.date.slice(8))}</span>
              ))}
            </div>
            <div className={styles.legend}>
              <span>
                <i style={{ background: "var(--success)" }} />
                Correct
              </span>
              <span>
                <i style={{ background: "var(--error)", opacity: 0.75 }} />
                Missed
              </span>
            </div>
          </div>
        </section>
      )}
    </>
  ) : null;

  const missedSection =
    missedTopicsList.length > 0 ? (
      <MissedTopics topics={missedTopicsList} onLesson={onLesson} />
    ) : null;

  const howMissSection = misses + m.guessed > 0 && (
    <section className={`${styles.sec} ${styles.fullRow}`}>
      <div className={styles.secH}>
        <h2>How you miss</h2>
      </div>
      <div className={`${styles.card} ${styles.list} ${styles.flat} ${styles.missGrid}`}>
        {roleRow("sneaky", m.sneaky, "var(--course-pr)")}
        {roleRow("average", m.average, "var(--course-il)")}
        {roleRow("bad", m.bad, "var(--error)")}
        {m.guessed > 0 && <button className={styles.row} onClick={() => setRole("guessed")}>
          <span className={styles.rowMain}>
            <span className={styles.rowTitle}>Right, but guessed</span>
          </span>
          <span className={styles.rowEnd}>
            <b>{m.guessed}</b>
          </span>
          <ChevronRight size={16} className={styles.chev} />
        </button>}
      </div>
    </section>
  );

  const coverageSection = (
    <>
      {COURSE_KEYS.map((k) => {
        const rows = e.coverage(k, syllabus[k], byTopic);
        if (!rows.length) return null;
        const c = COURSES[k];
        const covered = rows.filter((r) => r.n > 0).length;
        const open = isOpen(k);
        const head = (
          <>
            <span className={styles.dot} style={{ background: c.color }}>
              {c.short[0]}
            </span>
            <span className={styles.rowMain}>
              <span className={styles.rowTitle}>{c.name}</span>
              <span className={styles.rowSub}>
                {covered} of {rows.length} covered
              </span>
              <span className={styles.segBar} aria-hidden="true">
                {rows.map((r) => (
                  <i key={r.topic} style={{ background: STATUS_COLOR[r.status] }} />
                ))}
              </span>
            </span>
            {!wide && (
              <ChevronRight
                size={18}
                className={`${styles.chev} ${styles.courseChev} ${open ? styles.courseChevOn : ""}`}
              />
            )}
          </>
        );
        return (
          <section key={k} className={styles.sec}>
            <div className={`${styles.card} ${styles.course}`}>
              {wide ? (
                <div className={`${styles.row} ${styles.courseHead}`}>{head}</div>
              ) : (
                <button
                  className={`${styles.row} ${styles.courseHead}`}
                  aria-expanded={open}
                  onClick={() => toggle(k)}
                >
                  {head}
                </button>
              )}
              {open && (
                <div className={`${styles.list} ${styles.flat} ${styles.courseBody}`}>
                  {rows.map((t) => {
                    const a = t.c + t.w;
                    const acc = pct(t.c, a);
                    const col = STATUS_COLOR[t.status];
                    const body = (
                      <>
                        <span className={styles.rowMain}>
                          <span className={`${styles.rowTitle} ${styles.wrap}`}>{t.topic}</span>
                          <span className={styles.rowSub}>
                            {t.n
                              ? `${t.seen} of ${t.n} seen${a ? ` · ${acc}%` : ""}`
                              : t.materials
                              ? `${t.materials} materials`
                              : "No questions"}
                          </span>
                          <span className={styles.meter}>
                            <i style={{ width: `${t.n ? pct(t.seen, t.n) : 0}%`, background: col }} />
                          </span>
                        </span>
                        <span
                          className={`${styles.status} ${t.status === "none" ? styles.statusNone : ""}`}
                          style={{
                            color: col,
                            background: `color-mix(in srgb, ${col} 13%, transparent)`,
                          }}
                        >
                          {STATUS_LABEL[t.status]}
                        </span>
                        {t.n > 0 && <ChevronRight size={18} className={styles.chev} />}
                      </>
                    );
                    return t.n > 0 ? (
                      <button
                        key={t.topic}
                        className={styles.row}
                        onClick={() => onTopic(k, t.topics[0])}
                      >
                        {body}
                      </button>
                    ) : (
                      <div key={t.topic} className={styles.row}>
                        {body}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </>
  );

  const examsSection = (
    <section className={styles.sec}>
      <div className={styles.card}>
        {exams.list.length > 0 && (
          <button
            className={styles.row}
            onClick={() => {
              window.location.hash = "#/tool/ExamHistory";
            }}
          >
            <span className={styles.rowMain}>
              <span className={styles.rowTitle}>Practice exams</span>
              <span
                className={toolStyles.progressDots}
                role="img"
                aria-label={exams.list
                  .slice(0, 5)
                  .reverse()
                  .map((e) => `${e.score} of ${e.total}`)
                  .join(", ")}
              >
                {exams.list
                  .slice(0, 5)
                  .reverse()
                  .map((e) => (
                    <i key={e.at} style={{ opacity: 0.25 + (e.score / e.total) * 0.75 }} />
                  ))}
              </span>
            </span>
            <ChevronRight size={18} className={styles.chev} />
          </button>
        )}
        <button
          className={styles.row}
          onClick={() => {
            window.location.hash = "#/tool/MissedRules";
          }}
        >
          <span className={styles.rowMain}>
            <span className={styles.rowTitle}>Rules you miss</span>
          </span>
          <span className={styles.rowEnd}>
            <b>{rules.length}</b>
          </span>
          <ChevronRight size={18} className={styles.chev} />
        </button>
      </div>
    </section>
  );

  const updatesSection = state?.runs ? (
    <UpdateFeed
      e={e}
      runs={state.runs.slice(0, 20)}
      studyRuns={library.data?.runs.slice(0, 20) ?? []}
      materials={library.data?.materials ?? []}
      onStudy={onStudy}
    />
  ) : null;

  return (
    <>
      {wide ? (
        <div className={styles.progressDashboard}>
          <div className={styles.progressMainCol}>{coverageSection}</div>
          <div className={styles.progressSideCol}>
            {tilesSection}
            {calendarSection}
            {missedSection}
            {howMissSection}
            {examsSection}
            {updatesSection}
          </div>
        </div>
      ) : (
        <>
          {tilesSection}
          {calendarSection}
          {missedSection}
          {howMissSection}
          {coverageSection}
          {examsSection}
          {updatesSection}
        </>
      )}

      {role && (
        <BottomSheet title={ANSWER_LABEL[role]} onClose={() => setRole(null)}>
          <div className={toolStyles.stack}>
            {role === "sneaky" && (
              <Button
                className={`${styles.big} ${styles.cta}`}
                onClick={() => go("#/tool/CloseCalls")}
              >
                Practice close calls
              </Button>
            )}
            <div className={toolStyles.card}>
              {ownAnswers
                .sort((a, b) => b.answered_at.localeCompare(a.answered_at))
                .map((a, i) => {
                  const q = e.questions.find((q) => q.id === a.question_id);
                  const picked = q?.choices.find((c) => c.id === a.choice);
                  const right = q?.choices.find((c) => c.id === q.answer);
                  return q && picked && right ? (
                    <button
                      key={`${a.answered_at}-${i}`}
                      className={toolStyles.row}
                      onClick={() => go(`#/q/${q.id}`)}
                    >
                      <span className={toolStyles.main}>
                        <span className={toolStyles.title}>{q.prompt}</span>
                        <span className={toolStyles.muted}>Your answer · {picked.text}</span>
                        <span>Correct answer · {right.text}</span>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ) : null;
                })}
            </div>
            {!ownAnswers.length && (
              <div className={`${toolStyles.card} ${toolStyles.empty}`}>
                <button className={toolStyles.row} onClick={() => go("#/study")}>Start studying<ChevronRight size={18}/></button>
              </div>
            )}
          </div>
        </BottomSheet>
      )}
    </>
  );
}
