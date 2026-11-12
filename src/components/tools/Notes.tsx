import { useEffect, useRef, useState, useMemo } from "react";
import { Check, ChevronRight, Copy, Share2, Sparkles, BookOpen, Layers } from "lucide-react";
import { ToolFrame, type ToolProps } from "../ExamTools";
import { COURSES, type CourseCode, type SyllabusUnit } from "../../helpers/studyEngine";
import { useSyllabus } from "../../helpers/useSyllabus";
import { useStudyLibrary } from "../../helpers/useStudyLibrary";
import { useLawstinData } from "../../helpers/useLawstinData";
import { useNotes, formatAllNotes, noteKey, type NoteRow } from "../../helpers/useNotes";
import { toast } from "../../helpers/toast";
import { dateKey } from "../../helpers/dateKey";
import { useWide } from "../../helpers/useWide";
import styles from "./Notes.module.css";

export default function Notes({ course = "il", arg, onClose }: ToolProps) {
  const syllabus = useSyllabus();
  const library = useStudyLibrary();
  const { query } = useLawstinData();
  const isWide = useWide();
  const { notes, getNote, saveNote, toggleInNotes, flush } = useNotes(course);

  // Units in class order
  const units: SyllabusUnit[] = useMemo(() => {
    const list = syllabus[course];
    if (list && list.length) return list;
    // Fallback: distinct question topics
    const qs = (query.data?.questions ?? []).filter((q) => q.course === course);
    const seen = new Set<string>();
    const out: SyllabusUnit[] = [];
    for (const q of qs) {
      if (!seen.has(q.topic)) {
        seen.add(q.topic);
        out.push({ topic: q.topic, dates: q.classDate ? [q.classDate] : [] });
      }
    }
    return out;
  }, [syllabus, course, query.data?.questions]);

  const today = dateKey.today();
  const taughtUnits = useMemo(() => {
    return units.filter((u) => !u.dates.length || u.dates[0] <= today);
  }, [units, today]);

  // Selected unit for desktop or mobile
  const [selectedTopic, setSelectedTopic] = useState<string>(() => {
    if (arg && units.some((u) => u.topic === arg)) return arg;
    return units[0]?.topic ?? "";
  });

  useEffect(() => {
    if (arg && units.some((u) => u.topic === arg)) {
      setSelectedTopic(arg);
    } else if (!selectedTopic && units.length) {
      setSelectedTopic(units[0].topic);
    }
  }, [arg, units]);

  // Reference column collapsible state
  const [showReference, setShowReference] = useState(false);

  // Mobile expanded units map
  const [mobileExpanded, setMobileExpanded] = useState<Record<string, boolean>>(() => {
    if (arg) return { [arg]: true };
    return units[0] ? { [units[0].topic]: true } : {};
  });

  // Ticked units count out of units taught
  const tickedCount = useMemo(() => {
    return taughtUnits.filter((u) => notes[u.topic]?.inNotes).length;
  }, [taughtUnits, notes]);

  const progressPercent = taughtUnits.length > 0 ? Math.round((tickedCount / taughtUnits.length) * 100) : 0;

  const copyAll = async () => {
    const text = formatAllNotes(units, notes);
    try {
      await navigator.clipboard.writeText(text);
      toast("Notes copied to clipboard");
    } catch {
      toast("Couldn’t copy notes");
    }
  };

  const shareAll = async () => {
    const text = formatAllNotes(units, notes);
    if (!navigator.share) {
      void copyAll();
      return;
    }
    try {
      await navigator.share({
        title: `${COURSES[course].name} notes`,
        text,
      });
    } catch {
      /* share cancelled or failed */
    }
  };

  const currentUnit = units.find((u) => u.topic === selectedTopic) ?? units[0];

  // Verified rules and framework for current unit
  const currentUnitNames = currentUnit ? [currentUnit.topic, ...(currentUnit.also ?? [])] : [];
  const unitQuestions = (query.data?.questions ?? []).filter(
    (q) => q.course === course && currentUnitNames.includes(q.topic) && q.rule
  );
  const unitMaterials = (library.data?.materials ?? []).filter(
    (m) => m.course === course && currentUnitNames.includes(m.topic)
  );

  return (
    <ToolFrame title={`${COURSES[course].name} notes`} onClose={onClose}>
      <div className={styles.notesPage}>
        <div className={styles.topBar}>
          <div className={styles.stripContainer}>
            <div className={styles.stripHeader}>
              <span>Progress</span>
              <span>
                {tickedCount} of {taughtUnits.length} in notes
              </span>
            </div>
            <div className={styles.stripTrack}>
              <div className={styles.stripFill} style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <div className={styles.topActions}>
            <button className={styles.actionBtn} onClick={copyAll} aria-label="Copy all">
              <Copy size={16} />
              <span>Copy all</span>
            </button>
            {typeof navigator !== "undefined" && !!navigator.share && (
              <button className={styles.actionBtn} onClick={shareAll} aria-label="Share">
                <Share2 size={16} />
                <span>Share</span>
              </button>
            )}
          </div>
        </div>

        {isWide ? (
          <div className={`${styles.desktopLayout} ${showReference ? styles.withReference : ""}`}>
            {/* Column 1: Unit list */}
            <div className={styles.unitListDesktop}>
              {units.map((u) => {
                const note = getNote(u.topic);
                const hasText = note.text.trim().length > 0;
                const isActive = u.topic === selectedTopic;
                return (
                  <div
                    key={u.topic}
                    className={`${styles.desktopUnitRow} ${isActive ? styles.active : ""}`}
                  >
                    <button
                      type="button"
                      className={`${styles.tickBtn} ${note.inNotes ? styles.ticked : ""}`}
                      onClick={() => toggleInNotes(u.topic)}
                      aria-label={note.inNotes ? `Untick ${u.topic}` : `Tick ${u.topic} in notes`}
                      aria-checked={note.inNotes}
                    >
                      {note.inNotes && <Check size={16} strokeWidth={3} />}
                    </button>
                    <button
                      type="button"
                      className={styles.unitSelectBtn}
                      onClick={() => setSelectedTopic(u.topic)}
                    >
                      <span className={styles.unitTitle}>{u.topic}</span>
                      {!hasText && <span className={styles.unitMeta}>Empty</span>}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Column 2: Editor */}
            {currentUnit && (
              <div className={styles.editorCol}>
                <div className={styles.editorHeader}>
                  <h2 className={styles.editorTitle}>{currentUnit.topic}</h2>
                  <div className={styles.editorHeaderActions}>
                    <button
                      className={`${styles.tickBtn} ${getNote(currentUnit.topic).inNotes ? styles.ticked : ""}`}
                      onClick={() => toggleInNotes(currentUnit.topic)}
                      aria-label="In my notes"
                      aria-checked={getNote(currentUnit.topic).inNotes}
                    >
                      {getNote(currentUnit.topic).inNotes && <Check size={16} strokeWidth={3} />}
                    </button>
                    <button
                      className={styles.referenceToggle}
                      onClick={() => setShowReference((v) => !v)}
                      aria-expanded={showReference}
                    >
                      <BookOpen size={16} />
                      <span>{showReference ? "Hide reference" : "Reference"}</span>
                    </button>
                  </div>
                </div>

                <UnitEditor
                  key={currentUnit.topic}
                  topic={currentUnit.topic}
                  note={getNote(currentUnit.topic)}
                  onChange={(text) => saveNote(currentUnit.topic, text)}
                  onBlur={flush}
                />
              </div>
            )}

            {/* Column 3: Collapsible reference column */}
            {showReference && currentUnit && (
              <div className={styles.referenceCol}>
                <h3 className={styles.refHeading}>Verified rules & framework</h3>
                {unitQuestions.map((q) => (
                  <div key={q.id} className={styles.refItem}>
                    <span className={styles.refSub}>{q.subtopic ?? q.topic}</span>
                    <p className={styles.refRule}>{q.rule}</p>
                    {q.authority && <span className={styles.refAuth}>{q.authority}</span>}
                  </div>
                ))}
                {unitMaterials.map((m) => (
                  <div key={m.id} className={styles.refItem}>
                    <span className={styles.refSub}>{m.kind}</span>
                    <p className={styles.refRule}>{m.title}</p>
                    {m.authority && <span className={styles.refAuth}>{m.authority}</span>}
                  </div>
                ))}
                {!unitQuestions.length && !unitMaterials.length && (
                  <p className={styles.refAuth}>No reference material for this unit.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Mobile unit list with in-place editor */
          <div className={styles.unitListMobile}>
            {units.map((u) => {
              const note = getNote(u.topic);
              const hasText = note.text.trim().length > 0;
              const isExpanded = !!mobileExpanded[u.topic];
              return (
                <div
                  key={u.topic}
                  className={`${styles.unitCard} ${isExpanded ? styles.expanded : ""}`}
                >
                  <div className={styles.unitHeader}>
                    <button
                      type="button"
                      className={`${styles.tickBtn} ${note.inNotes ? styles.ticked : ""}`}
                      onClick={() => toggleInNotes(u.topic)}
                      aria-label={note.inNotes ? `Untick ${u.topic}` : `Tick ${u.topic} in notes`}
                      aria-checked={note.inNotes}
                    >
                      {note.inNotes && <Check size={16} strokeWidth={3} />}
                    </button>
                    <button
                      type="button"
                      className={styles.unitTitleBtn}
                      onClick={() =>
                        setMobileExpanded((prev) => ({ ...prev, [u.topic]: !prev[u.topic] }))
                      }
                      aria-expanded={isExpanded}
                    >
                      <div className={styles.unitTitleWrap}>
                        <span className={styles.unitTitle}>{u.topic}</span>
                        {!hasText && !isExpanded && (
                          <span className={styles.unitEmptyTag}>Tap to write notes</span>
                        )}
                      </div>
                      <ChevronRight
                        size={20}
                        style={{
                          transform: isExpanded ? "rotate(90deg)" : "none",
                          transition: "transform 0.2s ease",
                        }}
                      />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className={styles.editorArea}>
                      <UnitEditor
                        topic={u.topic}
                        note={note}
                        onChange={(text) => saveNote(u.topic, text)}
                        onBlur={flush}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ToolFrame>
  );
}

function UnitEditor({
  topic,
  note,
  onChange,
  onBlur,
}: {
  topic: string;
  note: NoteRow;
  onChange: (text: string) => void;
  onBlur: () => void;
}) {
  const [val, setVal] = useState(note.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setVal(note.text);
  }, [note.text]);

  const resize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(140, textareaRef.current.scrollHeight)}px`;
    }
  };

  useEffect(() => {
    resize();
  }, [val]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setVal(next);
    onChange(next);
  };

  const insertPrefix = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = val.lastIndexOf("\n", start - 1) + 1;
    const nextVal = val.slice(0, lineStart) + prefix + val.slice(lineStart);
    setVal(nextVal);
    onChange(nextVal);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
      <div className={styles.toolbar}>
        <button
          className={styles.toolBtn}
          type="button"
          onClick={() => insertPrefix("- ")}
          aria-label="Add bullet"
        >
          • Bullet
        </button>
        <button
          className={styles.toolBtn}
          type="button"
          onClick={() => insertPrefix("# ")}
          aria-label="Add heading"
        >
          # Heading
        </button>
      </div>

      <textarea
        ref={textareaRef}
        className={styles.notesTextarea}
        value={val}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder="Write your notes here…"
        aria-label={`Notes for ${topic}`}
      />
    </div>
  );
}
