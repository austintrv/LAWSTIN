import { BookOpen, ChevronRight, Columns3, GitBranch, Layers3, ListChecks, PenLine } from "lucide-react";
import { COURSES, type CourseCode } from "../helpers/studyEngine";
import { MATERIAL_LABELS, type MaterialKind } from "../helpers/studyMaterials";
import { useStudyLibrary } from "../helpers/useStudyLibrary";
import styles from "../pages/_index.module.css";

const KIND_ICON: Record<MaterialKind, typeof Layers3> = { flashcard: Layers3, flowchart: GitBranch, outline: BookOpen, comparison: Columns3, drill: ListChecks, hypothetical: PenLine };

/** The topic's study materials from Courses, with its flashcards as one row. Hidden when there are none. */
/** topicCards: the flashcard row opens a session of this topic's cards instead of the course's card list. */
export function TopicTools({ course, topic, onGo, topicCards }: { course: CourseCode; topic: string; onGo: (hash: string) => void; topicCards?: boolean }) {
  const library = useStudyLibrary();
  const mats = (library.data?.materials ?? []).filter((m) => m.course === course && m.topic === topic);
  if (!mats.length) return null;
  const cards = mats.filter((m) => m.kind === "flashcard").length;
  const cardsHash = topicCards ? `/courses/review/${course}/${encodeURIComponent(topic)}` : `/courses/${course}/flashcard`;
  const row = (key: string, kind: MaterialKind, title: string, sub: string, hash: string) => {
    const Icon = KIND_ICON[kind];
    return (
      <button key={key} className={styles.row} onClick={() => onGo(hash)}>
        <span className={styles.dot} style={{ background: COURSES[course].color }}><Icon size={12} color="var(--on-brand)" strokeWidth={2.4} /></span>
        <span className={styles.rowMain}><span className={styles.rowTitle}>{title}</span><span className={styles.rowSub}>{sub}</span></span>
        <ChevronRight size={18} className={styles.chev} />
      </button>
    );
  };
  return (
    <div className={`${styles.card} ${styles.list}`}>
      {mats.filter((m) => m.kind !== "flashcard").map((m) => row(m.id, m.kind, m.title, MATERIAL_LABELS[m.kind], `/courses/${course}/${m.kind}/${m.id}`))}
      {cards > 0 && row("cards", "flashcard", MATERIAL_LABELS.flashcard, `${cards} cards`, cardsHash)}
    </div>
  );
}
