import type { OutputType as QuestionState } from "../endpoints/state_GET.schema";
import { dateKey } from "./dateKey";
import { cardQueue, type Flashcard, type StudyRecord } from "./studyMaterials";
import { COURSE_KEYS, EXAMS, FINALS, examDue, type CardItem, type CourseCode, type Filter, type QuestionItem, type RoundItem, type SessionCard, type StudyMode, type studyEngine } from "./studyEngine";

type Engine = ReturnType<typeof studyEngine>;
const inFilter = (c: CourseCode, f: Filter) => f === "all" || c === f;

/**
 * Recall cards ready now for a session: library flashcards in their usual order, then rules to
 * state from memory. `due` are reviews; `fresh` have never been graded.
 */
export function readyCards(flashcards: Flashcard[], rules: SessionCard[], record: StudyRecord, state: QuestionState | undefined, f: Filter = "all", today = dateKey.today(), mode: StudyMode = "mixed") {
  const cards: SessionCard[] = cardQueue(flashcards.filter((c) => inFilter(c.course, f)), record, state, today, mode === "ahead")
    .map((c) => ({ id: c.id, course: c.course, topic: c.topic, front: c.front, back: c.back, reason: c.reason, authority: c.authority }));
  const ready = (c: SessionCard) => {
    const p = record.cards[c.id];
    if (!p) return mode === "mixed" || mode === "new";
    const due = (examDue(p.due, dateKey.today(new Date(p.last_at)), FINALS[c.course], today) ?? today) <= today;
    return mode === "ahead" ? !due : mode !== "new" && due;
  };
  const list = [...cards.filter(ready), ...rules.filter((c) => inFilter(c.course, f) && ready(c))];
  const due = list.filter((c) => record.cards[c.id]);
  const fresh = list.filter((c) => !record.cards[c.id]);
  return { list: [...due, ...fresh], due, fresh };
}

/** Two questions, then a card, so recall and application alternate. Cards alone when no questions are left. */
export function mixRound(questions: QuestionItem[], cards: SessionCard[], record: StudyRecord, limit = 5): RoundItem[] {
  const pool: CardItem[] = cards.slice(0, questions.length ? limit : 10).map((card) => ({ card, review: !!record.cards[card.id] }));
  const out: RoundItem[] = [];
  questions.forEach((q, i) => {
    out.push(q);
    if (i % 2 === 1 && pool.length) out.push(pool.shift()!);
  });
  return [...out, ...pool];
}

/** Earliest scheduled return, including cards and the final-exam adjustment. */
export function nextReviewDay(e: Engine, cards: SessionCard[], record: StudyRecord, f: Filter = "all"): string | null {
  const dates: string[] = [];
  for (const q of e.queues(f).ahead) {
    const p = e.prog(q.id)!;
    const due = examDue(p.due, p.lastAt ? dateKey.today(new Date(p.lastAt)) : null, FINALS[q.course], e.today);
    if (due) dates.push(due);
  }
  for (const c of cards) {
    const p = record.cards[c.id];
    if (!p || !inFilter(c.course, f)) continue;
    const due = examDue(p.due, dateKey.today(new Date(p.last_at)), FINALS[c.course], e.today);
    if (due && due > e.today) dates.push(due);
  }
  return dates.sort()[0] ?? null;
}

export type PlanCourse = {
  course: CourseCode; days: number; format: "mc" | "essay";
  /** Questions and cards to get through today. */
  target: number;
  /** An essay is due today: essay courses write every other day, daily in the last week. */
  essay: boolean;
};

/**
 * What today needs so that everything is seen and reviewed before each final. New material is
 * spread over the days left, finishing two days before the exam; reviews due today are added on top.
 */
export function finalsPlan(e: Engine, input: {
  cards: Record<CourseCode, { due: number; fresh: number }>;
  /** The day of the latest essay per course. */
  lastEssay: Partial<Record<CourseCode, string>>;
  fallbackGoal: number;
}): { active: boolean; goal: number; courses: PlanCourse[] } {
  const courses: PlanCourse[] = [];
  for (const course of COURSE_KEYS) {
    const days = dateKey.diff(e.today, FINALS[course]);
    if (days < 0) continue;
    const q = e.queues(course), spread = Math.max(1, days - 2);
    const fresh = Math.ceil((q.fresh.length + input.cards[course].fresh) / spread);
    const target = Math.min(30, fresh + Math.min(q.due.length, 15) + Math.min(input.cards[course].due, 10));
    const format = EXAMS[course].format;
    const last = input.lastEssay[course];
    const essay = format === "essay" && (!last || dateKey.diff(last, e.today) >= (days <= 7 ? 1 : 2));
    courses.push({ course, days, format, target, essay });
  }
  if (!courses.length) return { active: false, goal: input.fallbackGoal, courses };
  return { active: true, goal: Math.min(60, Math.max(10, courses.reduce((a, c) => a + c.target, 0))), courses };
}
