import { examMoment, lastPass, weakUnits, type ExamMoment } from "../../supabase/functions/_shared/studyPlan";
export { examMoment, lastPass, weakUnits, type ExamMoment } from "../../supabase/functions/_shared/studyPlan";
import { finalsPlan, clampGoal, restoreDayGoal, holdDayGoal, studyNumbers, inferredDone, reconcileDayWork, type PlanCourse, type DayGoal, type DayWork } from "../../supabase/functions/_shared/studyPlan";
export { finalsPlan, clampGoal, restoreDayGoal, holdDayGoal, studyNumbers, inferredDone, reconcileDayWork, type PlanCourse, type DayGoal, type DayWork } from "../../supabase/functions/_shared/studyPlan";
import type { OutputType as QuestionState } from "../endpoints/state_GET.schema";
import { dateKey } from "./dateKey";
import { cardQueue, type Flashcard, type StudyRecord } from "./studyMaterials";
import { COURSE_KEYS, EXAMS, FINALS, activeCourses, apportion, courseCounts, examDue, itemId, type CoverageStatus, type Syllabus, type CourseCounts, type CardItem, type CourseCode, type Filter, type QuestionItem, type RoundItem, type SessionCard, type StudyMode, type studyEngine } from "./studyEngine";

type Engine = ReturnType<typeof studyEngine>;
const inFilter = (c: CourseCode, f: Filter, today: string) => activeCourses(today, f).includes(c);

/**
 * Recall cards ready now for a session: library flashcards in their usual order, then rules to
 * state from memory. `due` are reviews; `fresh` have never been graded.
 */
export function readyCards(flashcards: Flashcard[], rules: SessionCard[], record: StudyRecord, state: QuestionState | undefined, f: Filter = "all", today = dateKey.today(), mode: StudyMode = "mixed") {
  const cards: SessionCard[] = cardQueue(flashcards.filter((c) => inFilter(c.course, f, today)), record, state, today, mode === "ahead")
    .map((c) => ({ id: c.id, course: c.course, topic: c.topic, front: c.front, back: c.back, reason: c.reason, authority: c.authority }));
  const ready = (c: SessionCard) => {
    const p = record.cards[c.id];
    if (!p) return mode === "mixed" || mode === "new";
    const due = (examDue(p.due, dateKey.today(new Date(p.last_at)), FINALS[c.course], today) ?? today) <= today;
    return mode === "ahead" ? !due : mode !== "new" && due;
  };
  const list = [...cards.filter(ready), ...rules.filter((c) => inFilter(c.course, f, today) && ready(c))];
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
    if (!p || !inFilter(c.course, f, e.today)) continue;
    const due = examDue(p.due, dateKey.today(new Date(p.last_at)), FINALS[c.course], e.today);
    if (due && due > e.today) dates.push(due);
  }
  return dates.sort()[0] ?? null;
}

export function missedLessonBatch<T>(topics: T[], offset = 0) {
  return { topics: topics.slice(offset, offset + 4), remaining: topics.slice(offset + 4) };
}

export function questionUpdate(e: Engine, run: QuestionState["runs"][number]) {
  const added = e.questions.filter((q) => q.batch?.includes(run.date));
  const total = Object.entries(run.byCourse).filter(([c]) => COURSE_KEYS.includes(c as CourseCode)).reduce((a, [, n]) => a + n, 0) || run.added;
  return { added, total };
}

export function reviewGreeting(greeting: string | null, count: number) {
  if (!greeting || !/^(One review|\d+ reviews) (is waiting|are waiting|on the docket)$/.test(greeting)) return greeting;
  return count === 1 ? "One review is waiting" : count ? `${count} reviews are waiting` : "Ready when you are, Austin";
}

export function weakestRules(e: Engine, course: CourseCode) {
  const score = (q: Engine["questions"][number]) => {
    const p = e.prog(q.id);
    return (p?.lastCorrect === false ? 100 : 0) + (p?.guessed ? 20 : 0) + (p ? p.wrong / Math.max(1, p.correct + p.wrong) * 10 : 5);
  };
  const used = new Set<string>();
  return e.questions.filter((q) => q.course === course && q.rule).sort((a, b) => score(b) - score(a)).filter((q) => {
    const key = q.rule!.trim(); if (used.has(key)) return false; used.add(key); return true;
  }).slice(0, 10);
}

export type UnitStatus = { course: CourseCode; topic: string; status: CoverageStatus };
export const unitStatuses = (e: Engine, syllabus: Syllabus): UnitStatus[] => COURSE_KEYS.flatMap((course) => e.coverage(course, syllabus[course]).map((u) => ({ course, topic: u.topic, status: u.status })));
export function recapChanges(before: UnitStatus[], after: UnitStatus[]) {
  return after.flatMap((u) => {
    const prev = before.find((p) => p.course === u.course && p.topic === u.topic);
    return prev && prev.status !== u.status ? [{ ...u, from: prev.status }] : [];
  });
}

export function streakHistory(days: QuestionState["days"], today: string) {
  const studied = new Set(days.filter((d) => d.answered > 0 && d.date <= today).map((d) => d.date));
  let best = 0, run = 0, prev = "";
  for (const day of [...studied].sort()) { run = prev && dateKey.addDays(prev, 1) === day ? run + 1 : 1; best = Math.max(best, run); prev = day; }
  const yesterday = dateKey.addDays(today, -1);
  let old = [...studied].filter((d) => d < yesterday).sort().pop(), broken = 0;
  while (old && studied.has(old)) { broken++; old = dateKey.addDays(old, -1); }
  return { best, broken: !studied.has(yesterday) && broken >= 2, dots: Array.from({ length: 14 }, (_, i) => { const day = dateKey.addDays(today, i - 13); return { day, studied: studied.has(day) }; }) };
}
