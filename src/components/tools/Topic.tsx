import { NoteEditor } from "../NoteEditor";
import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X, Layers, PenLine, ArrowDown, RotateCcw, ArrowRight } from "lucide-react";
import { useModalFocus } from "../../helpers/useModalFocus";
import { useBackClose } from "../../helpers/useBackClose";
import { COURSES, EXAMS, STATUS_LABEL, type SyllabusUnit } from "../../helpers/studyEngine";
import { STATUS_COLOR } from "../../pages/StudyParts";
import { useSyllabus } from "../../helpers/useSyllabus";
import { useLawstinData } from "../../helpers/useLawstinData";
import { noteUnits, useNotes, assembleTopicData } from "../../helpers/useNotes";
import { describeAuthority, firstSentence, isBareCitation } from "../../helpers/plainName";
import { useAuthorityIndex } from "../../helpers/useAuthorityIndex";
import { useWritten } from "../../helpers/useWritten";
import { useStudyLibrary } from "../../helpers/useStudyLibrary";
import { useLogStudy } from "../../helpers/useLogStudy";
import { dateKey } from "../../helpers/dateKey";
import { PracticeSet, QuestionReview, type ToolProps } from "../ExamTools";
import IssueSpot from "./IssueSpot";
import CloseCalls from "./CloseCalls";
import { WrittenPractice } from "../WrittenPractice";
import type { QuestionDTO } from "../../endpoints/state_GET.schema";
import type { Flowchart, Hypothetical, Flashcard } from "../../helpers/studyMaterials";
import quiz from "../QuizSession.module.css";
import styles from "./Topic.module.css";

const formatDate = (d: string) => {
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return d;
  }
};

export default function Topic({ course = "il", arg, onClose }: ToolProps) {
  const syllabus = useSyllabus();
  const { query } = useLawstinData();
  const written = useWritten();
  const library = useStudyLibrary();
  const log = useLogStudy();
  const authorityIndex = useAuthorityIndex();
  const { getNote, saveNote, flush } = useNotes(course);

  // Units in class order
  const units = useMemo(() => noteUnits(syllabus[course], query.data?.questions ?? [], course), [syllabus, course, query.data?.questions]);

  // Current unit matching arg or first unit
  const currentUnitIndex = useMemo(() => {
    if (!units.length) return -1;
    if (!arg) return 0;
    const idx = units.findIndex(
      (u) => u.topic === arg || (u.also && u.also.includes(arg))
    );
    return idx >= 0 ? idx : 0;
  }, [units, arg]);

  const currentUnit: SyllabusUnit = useMemo(() => {
    if (currentUnitIndex >= 0 && units[currentUnitIndex]) {
      return units[currentUnitIndex];
    }
    return { topic: arg ?? "Topic", dates: [] };
  }, [units, currentUnitIndex, arg]);

  const prevUnit = currentUnitIndex > 0 ? units[currentUnitIndex - 1] : null;
  const nextUnit = currentUnitIndex >= 0 && currentUnitIndex < units.length - 1 ? units[currentUnitIndex + 1] : null;

  const goToUnit = (u: SyllabusUnit) => {
    // Stepping between units replaces the entry, so Close returns to where he came from.
    history.replaceState(history.state, "", `#/tool/Topic/${course}/${encodeURIComponent(u.topic)}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  // Assembled data for this unit
  const data = useMemo(() => {
    return assembleTopicData({
      course,
      unit: currentUnit,
      questions: query.data?.questions ?? [],
      progress: query.data?.progress ?? [],
      materials: (library.data?.materials ?? []),
      today: dateKey.today(),
    });
  }, [course, currentUnit, query.data?.questions, query.data?.progress, (library.data?.materials ?? [])]);

  // Filter by selected authority
  const [selectedAuth, setSelectedAuth] = useState<string | null>(null);

  // Interactive practice modes
  const [practiceQuestions, setPracticeQuestions] = useState<QuestionDTO[] | null>(null);
  const [spotting, setSpotting] = useState(false);
  const [writing, setWriting] = useState(false);
  const [closeCalls, setCloseCalls] = useState(false);
  const [deck, setDeck] = useState<Flashcard[] | null>(null);

  // Ref & focus
  const ref = useModalFocus<HTMLDivElement>();
  useBackClose(onClose);

  // Filtered rules by authority if selected
  const displayedRulesBySubtopic = useMemo(() => {
    if (!selectedAuth) return data.rulesBySubtopic;
    return data.rulesBySubtopic
      .map((group) => ({
        ...group,
        rules: group.rules.filter((r) => r.authority === selectedAuth),
      }))
      .filter((g) => g.rules.length > 0);
  }, [data.rulesBySubtopic, selectedAuth]);

  // Filtered materials by authority if selected
  const displayedFlowcharts = useMemo(() => {
    if (!selectedAuth) return data.flowcharts;
    return data.flowcharts.filter(
      (fc) => fc.authority === selectedAuth || fc.nodes.some((n) => n.authority === selectedAuth)
    );
  }, [data.flowcharts, selectedAuth]);

  const displayedOutlines = useMemo(() => {
    if (!selectedAuth) return data.outlines;
    return data.outlines.filter(
      (o) => o.authority === selectedAuth || o.sections.some((s) => s.authority === selectedAuth)
    );
  }, [data.outlines, selectedAuth]);

  const displayedComparisons = useMemo(() => {
    if (!selectedAuth) return data.comparisons;
    return data.comparisons.filter(
      (c) => c.authority === selectedAuth || c.rows.some((r) => r.authority === selectedAuth)
    );
  }, [data.comparisons, selectedAuth]);

  // Sub-screens
  if (practiceQuestions) {
    return <PracticeSet questions={practiceQuestions} onClose={() => setPracticeQuestions(null)} />;
  }
  if (spotting && data.hypo) {
    return (
      <IssueSpot
        course={course}
        hypo={data.hypo}
        onClose={() => setSpotting(false)}
        onWrite={(h) => {
          setSpotting(false);
          setWriting(true);
        }}
      />
    );
  }
  if (writing && data.hypo) {
    const hypos = (library.data?.materials ?? []).filter(
      (m): m is Hypothetical => m.kind === "hypothetical" && m.course !== "pr"
    );
    const weak = new Set(written.weak);
    return (
      <WrittenPractice
        hypo={data.hypo}
        hypos={hypos}
        weak={weak}
        written={written}
        onClose={() => setWriting(false)}
        onGraded={(e, length) => {
          const n = length === "full" ? 10 : 5;
          log("written", e.id, e.grade.score >= 7, n, Math.round((e.grade.score / 10) * n));
        }}
        onTopic={(c) => {
          setWriting(false);
          window.location.hash = `#/courses/${c}`;
        }}
      />
    );
  }
  if (closeCalls) {
    return <CloseCalls course="pr" onClose={() => setCloseCalls(false)} />;
  }

  // Cards due count
  const cards = data.materials.filter((m): m is Flashcard => m.kind === "flashcard");

  const hasFramework =
    displayedFlowcharts.length > 0 ||
    displayedOutlines.length > 0 ||
    displayedComparisons.length > 0;

  const examFormat = EXAMS[course];
  const formattedDates = currentUnit.dates.map(formatDate).join(", ");

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={quiz.modal}
      role="dialog"
      aria-modal="true"
      aria-label={currentUnit.topic}
    >
      <div className={quiz.top}>
        <div className={`${quiz.topIn} ${quiz.examTop}`}>
          <div className={styles.headerNavDesktop}>
            {prevUnit && (
              <button
                className={quiz.x}
                onClick={() => goToUnit(prevUnit)}
                aria-label={`Previous unit: ${prevUnit.topic}`}
              >
                <ChevronLeft size={18} />
              </button>
            )}
          </div>
          <h1 className={quiz.examTitle}>{currentUnit.topic}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div className={styles.headerNavDesktop}>
              {nextUnit && (
                <button
                  className={quiz.x}
                  onClick={() => goToUnit(nextUnit)}
                  aria-label={`Next unit: ${nextUnit.topic}`}
                >
                  <ChevronRight size={18} />
                </button>
              )}
            </div>
            <button className={quiz.x} aria-label="Close" onClick={onClose}>
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>

      <div className={quiz.scroll}>
        <div className={styles.topicPage}>
          {/* Header chips */}
          <div className={styles.headerChips}>
            <span className={styles.chip}>{COURSES[course].name}</span>
            <span
              className={styles.chip}
              style={{ color: STATUS_COLOR[data.status], background: "var(--fill)" }}
            >
              {STATUS_LABEL[data.status]}
            </span>
            {formattedDates && <span className={styles.chip}>{formattedDates}</span>}
          </div>

          {/* Practice row */}
          <div className={styles.practiceRow}>
            {data.questions.length > 0 && (
              <button
                className={`${styles.practiceBtn} ${styles.primary}`}
                onClick={() => setPracticeQuestions(data.questions)}
              >
                Questions ({data.questions.length})
              </button>
            )}
            {cards.length > 0 && (
              <button
                className={styles.practiceBtn}
                onClick={() => {
                  window.location.hash = `#/courses/review/${course}/${encodeURIComponent(currentUnit.topic)}`;
                }}
              >
                <Layers size={16} />
                Review {cards.length} cards
              </button>
            )}
            {examFormat.format === "essay" && data.hypo && (
              <>
                <button
                  className={styles.practiceBtn}
                  onClick={() => setSpotting(true)}
                >
                  Spot the issues
                </button>
                <button
                  className={styles.practiceBtn}
                  onClick={() => setWriting(true)}
                >
                  <PenLine size={16} />
                  Write an essay
                </button>
              </>
            )}
            {course === "pr" && (
              <button
                className={styles.practiceBtn}
                onClick={() => setCloseCalls(true)}
              >
                Close calls
              </button>
            )}
          </div>

          {/* Desktop 2-column or Mobile layout */}
          <div className={styles.columnsLayout}>
            {/* Column 1: Rules & Framework */}
            <div className={styles.mainCol}>
              {/* Rules section */}
              {displayedRulesBySubtopic.length > 0 && (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Rules</h2>
                  {displayedRulesBySubtopic.map((group) => (
                    <div key={group.subtopic} className={styles.subtopicGroup}>
                      {!isBareCitation(group.subtopic) && <h3 className={styles.subtopicTitle}>{group.subtopic}</h3>}
                      {group.rules.map((r, i) => {
                        return (
                          <details key={`${r.subtopic}-${i}`} className={styles.ruleCard}>
                            <summary className={styles.ruleSummary}>
                              <span className={styles.ruleSentence}>{firstSentence(r.rule)}</span>
                              {r.isMissed && (
                                <span className={styles.missedMarker}>Missed</span>
                              )}
                              <ChevronRight size={18} />
                            </summary>
                            <div className={styles.ruleBody}>
                              <p className={styles.ruleFull}>{r.rule}</p>
                              {r.authority && (
                                <small className={styles.ruleAuth}>{r.authority}</small>
                              )}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  ))}
                </section>
              )}

              {/* Framework section */}
              {hasFramework && (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Framework</h2>
                  {displayedFlowcharts.map((fc) => (
                    <div key={fc.id} className={styles.frameworkItem}>
                      <h3 className={styles.frameworkItemTitle}>{fc.title}</h3>
                      <InlineFlowchart flowchart={fc} />
                    </div>
                  ))}

                  {displayedOutlines.map((outline) => (
                    <div key={outline.id} className={styles.frameworkItem}>
                      <h3 className={styles.frameworkItemTitle}>{outline.title}</h3>
                      {outline.sections.map((s, idx) => (
                        <details key={idx} className={styles.outlineSection} open>
                          <summary>{s.heading}</summary>
                          <p>{s.text}</p>
                          <small className={styles.ruleAuth}>{s.authority}</small>
                        </details>
                      ))}
                    </div>
                  ))}

                  {displayedComparisons.map((comp) => (
                    <div key={comp.id} className={styles.frameworkItem}>
                      <h3 className={styles.frameworkItemTitle}>{comp.title}</h3>
                      <div className={styles.tableScroll}>
                        <table>
                          <thead>
                            <tr>
                              <th>Rule</th>
                              {comp.columns.map((c) => (
                                <th key={c}>{c}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {comp.rows.map((row, idx) => (
                              <tr key={idx}>
                                <td>
                                  <b>{row.label}</b>
                                  <div className={styles.ruleAuth}>{row.authority}</div>
                                </td>
                                {row.cells.map((cell, cIdx) => (
                                  <td key={cIdx}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </section>
              )}
            </div>

            {/* Column 2: Authorities, Misses, Notes */}
            <div className={styles.sideCol}>
              {/* Authorities */}
              {data.authorities.length > 0 && (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Authorities</h2>
                  <div className={styles.authList}>
                    {data.authorities.map((auth) => {
                      const isActive = selectedAuth === auth;
                      const d = describeAuthority(auth, authorityIndex);
                      const name = d?.name ?? auth;
                      return (
                        <button
                          key={auth}
                          className={`${styles.authRow} ${isActive ? styles.active : ""}`}
                          onClick={() => setSelectedAuth(isActive ? null : auth)}
                          aria-pressed={isActive}
                        >
                          <span className={styles.authName}>{name}</span>
                          {name !== auth && <span className={styles.ruleAuth}>{auth}</span>}
                          {isActive && d?.rule && <span className={styles.authRule}>{d.rule}</span>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Your misses */}
              {data.missedQuestions.length > 0 && (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Your misses</h2>
                  <div className={styles.missesCard}>
                    {data.missedQuestions.map(({ q, p }) => (
                      <QuestionReview key={q.id} q={q} pick={p.lastChoice ?? undefined} />
                    ))}
                  </div>
                </section>
              )}

              {/* My notes (editable in place) */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>My notes</h2>
                <div className={styles.notesBox}>
                  <NoteEditor
                    topic={currentUnit.topic}
                    note={getNote(currentUnit.topic)}
                    onChange={(text) => saveNote(currentUnit.topic, text)}
                    onBlur={flush}
                  />
                </div>
              </section>
            </div>
          </div>

          {/* Previous / next navigation at bottom on phone */}
          <div className={styles.navRowPhone}>
            {prevUnit ? (
              <button
                className={styles.navBtn}
                onClick={() => goToUnit(prevUnit)}
              >
                <ChevronLeft size={18} />
                <span>Previous unit</span>
              </button>
            ) : <span />}
            {nextUnit ? (
              <button
                className={styles.navBtn}
                onClick={() => goToUnit(nextUnit)}
              >
                <span>Next unit</span>
                <ChevronRight size={18} />
              </button>
            ) : <span />}
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineFlowchart({ flowchart }: { flowchart: Flowchart }) {
  const [path, setPath] = useState<string[]>([flowchart.start]);
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [overview, setOverview] = useState(false);

  const nodes = overview
    ? flowchart.nodes
    : path.map((id) => flowchart.nodes.find((n) => n.id === id)!).filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          className={styles.practiceBtn}
          onClick={() => setOverview((v) => !v)}
          aria-pressed={overview}
        >
          {overview ? "Walk through" : "See full tree"}
        </button>
        <button
          className={styles.practiceBtn}
          onClick={() => {
            setPath([flowchart.start]);
            setChoices({});
          }}
        >
          <RotateCcw size={16} />
          <span>Start over</span>
        </button>
      </div>

      {nodes.map((n, i) => (
        <React.Fragment key={n.id}>
          {i > 0 && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <ArrowDown size={20} color="var(--muted-foreground)" />
            </div>
          )}
          <div className={styles.outlineSection}>
            <span style={{ fontSize: "var(--type-12)", fontWeight: 600, color: "var(--uh-red)" }}>
              Step {flowchart.nodes.indexOf(n) + 1}
            </span>
            <h4 style={{ fontSize: "var(--type-15)", fontWeight: 600, margin: "2px 0" }}>{n.question}</h4>
            <small className={styles.ruleAuth}>{n.authority}</small>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
              {n.branches.map((b, j) =>
                overview ? (
                  <div key={j} style={{ fontSize: "var(--type-13)" }}>
                    <b>{b.label}: </b>
                    <span>{b.outcome ?? `Continue to step ${flowchart.nodes.findIndex((node) => node.id === b.next) + 1}`}</span>
                  </div>
                ) : (
                  <button
                    key={j}
                    className={styles.practiceBtn}
                    aria-pressed={choices[n.id] === j}
                    onClick={() => {
                      setChoices((prev) => ({
                        ...Object.fromEntries(path.slice(0, i).map((id) => [id, prev[id]])),
                        [n.id]: j,
                      }));
                      setPath([...path.slice(0, i + 1), ...(b.next ? [b.next] : [])]);
                    }}
                  >
                    {b.label}
                    <ArrowRight size={14} />
                  </button>
                )
              )}
            </div>
            {!overview && n.branches[choices[n.id]]?.outcome && (
              <p style={{ marginTop: "6px", fontWeight: 600, color: "var(--uh-red)" }}>
                {n.branches[choices[n.id]].outcome}
              </p>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
