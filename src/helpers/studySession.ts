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

export type PlanCourse = {
  course: CourseCode; days: number; format: "mc" | "essay";
  /** The full daily quota, including completed work. */
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
  done?: CourseCounts;
  totalDone?: number;
  planOn?: boolean;
}): { active: boolean; goal: number; courses: PlanCourse[] } {
  const courses: PlanCourse[] = [];
  const active = activeCourses(e.today);
  const planning = input.planOn !== false && COURSE_KEYS.some((c) => FINALS[c] >= e.today);
  for (const course of active) {
    const days = dateKey.diff(e.today, FINALS[course]);
    const q = e.queues(course), spread = Math.max(1, days - 2);
    const fresh = Math.ceil((q.fresh.length + input.cards[course].fresh) / spread);
    const target = (planning ? fresh + Math.min(10, q.due.length + input.cards[course].due) : q.fresh.length + q.due.length + input.cards[course].due + input.cards[course].fresh) + (input.done?.[course] ?? 0);
    const format = EXAMS[course].format;
    const last = input.lastEssay[course];
    const essay = planning && format === "essay" && (!last || dateKey.diff(last, e.today) >= (days <= 7 ? 1 : 2));
    courses.push({ course, days, format, target, essay });
  }
  const unassigned = Math.max(0, (input.totalDone ?? 0) - COURSE_KEYS.reduce((a, c) => a + (input.done?.[c] ?? 0), 0));
  const goal = clampGoal(planning ? courses.reduce((a, c) => a + c.target, 0) + unassigned : input.fallbackGoal);
  const targets = apportion(courses.map((c) => c.target), goal);
  return { active: planning, goal, courses: courses.map((c, i) => ({ ...c, target: targets[i] })) };
}

export const clampGoal = (goal: number) => Math.min(40, Math.max(5, Number.isFinite(goal) ? Math.round(goal) : 20));
export type DayGoal = { date: string; goal: number; targets?: CourseCounts };

export function restoreDayGoal(value: unknown, today: string): DayGoal | null {
  const v = value as DayGoal | null;
  if (!v || v.date !== today || !Number.isInteger(v.goal) || v.goal < 5 || v.goal > 40) return null;
  const targets = v.targets && COURSE_KEYS.every((c) => Number.isInteger(v.targets![c]) && v.targets![c] >= 0) && COURSE_KEYS.reduce((a, c) => a + v.targets![c], 0) === v.goal ? v.targets : undefined;
  return { date: today, goal: v.goal, targets };
}

/** Freeze the day's budget after hydration; completed items consume its remaining quota. */
export function holdDayGoal(plan: ReturnType<typeof finalsPlan>, today: string, saved: DayGoal | null, fixedGoal?: number) {
  const previous = restoreDayGoal(saved, today);
  const goal = clampGoal(Math.max(previous?.goal ?? 0, previous ? fixedGoal ?? previous.goal : plan.goal));
  const shares = apportion(plan.courses.map((c) => previous?.targets?.[c.course] ?? c.target), goal);
  const courses = plan.courses.map((c, i) => ({ ...c, target: shares[i] }));
  const targets = courseCounts();
  courses.forEach((c) => { targets[c.course] = c.target; });
  return { ...plan, goal, courses, saved: { date: today, goal, targets } };
}

/** Shared hero, tile, session, and badge counts. */
export function studyNumbers(e: Engine, cards: ReturnType<typeof readyCards>, plan: { goal: number; courses: PlanCourse[] }, done: CourseCounts, filter: Filter = "all", total = COURSE_KEYS.reduce((a, c) => a + done[c], 0)) {
  const courses = activeCourses(e.today, filter), qs = e.queues(filter);
  const answered = filter === "all" ? Math.max(0, total - COURSE_KEYS.filter((c) => !courses.includes(c)).reduce((a, c) => a + done[c], 0)) : done[filter];
  const review = qs.due.length + cards.due.length;
  const fresh = qs.fresh.length + cards.fresh.length;
  const ready = review + fresh;
  const goal = filter === "all" ? plan.goal : plan.courses.find((c) => c.course === filter)?.target ?? answered + Math.min(ready, 10);
  const left = Math.min(Math.max(0, goal - answered), ready);
  return { answered, goal, review, fresh, ready, left, minutes: left ? Math.max(5, Math.ceil(left * 0.75 / 5) * 5) : 0 };
}

export function inferredDone(e: Engine, record: StudyRecord, essays: { day: string; course: CourseCode; minutes?: number }[] = [], flashcards: SessionCard[] = []): CourseCounts {
  const done = courseCounts();
  for (const q of e.questions) {
    const p = e.prog(q.id);
    if (p?.lastAt && dateKey.today(new Date(p.lastAt)) === e.today) done[q.course]++;
  }
  const cards = new Map<string, CourseCode>([...e.ruleCards(), ...flashcards].map((c) => [c.id, c.course]));
  for (const [id, p] of Object.entries(record.cards)) {
    const course = cards.get(id) ?? (/^(il|asy|pr)-/.exec(id)?.[1] as CourseCode | undefined);
    if (course && dateKey.today(new Date(p.last_at)) === e.today) done[course]++;
  }
  for (const essay of essays) if (essay.day === e.today) done[essay.course] += essay.minutes === 45 ? 10 : 5;
  return done;
}

export type DayWork = { date: string; total: number; done: CourseCounts };
export function reconcileDayWork(today: string, total: number, inferred: CourseCounts, saved: DayWork | null): DayWork {
  const valid = saved?.date === today && Number.isFinite(saved.total) && COURSE_KEYS.every((c) => Number.isFinite(saved.done?.[c]) && saved.done[c] >= 0);
  const done = courseCounts();
  COURSE_KEYS.forEach((c) => { done[c] = Math.max(inferred[c], valid ? saved.done[c] : 0); });
  const known = COURSE_KEYS.reduce((a, c) => a + done[c], 0);
  // Older aggregate activity has no course field. Preserve its credit in the All goal.
  return { date: today, total: Math.max(total, valid ? saved.total : 0, known), done };
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

export type ExamMoment = { kind: "normal" | "eve" | "morning" | "done"; course?: CourseCode };
export function examMoment(today: string): ExamMoment {
  const course = COURSE_KEYS.find((c) => FINALS[c] === today);
  if (course) return { kind: "morning", course };
  const tomorrow = COURSE_KEYS.find((c) => FINALS[c] === dateKey.addDays(today, 1));
  if (tomorrow) return { kind: "eve", course: tomorrow };
  return { kind: COURSE_KEYS.every((c) => FINALS[c] < today) ? "done" : "normal" };
}

export function weakUnits(e: Engine, course: CourseCode, syllabus: Syllabus) {
  const missed = new Set(e.missedTopics().filter((t) => t.course === course).map((t) => t.topic));
  return e.coverage(course, syllabus[course]).filter((u) => u.status === "shaky" || [u.topic, ...u.topics].some((t) => missed.has(t))).slice(0, 5);
}

/** A finite pass, ordered by need rather than by the ordinary mixed queue. */
export function lastPass(e: Engine, course: CourseCode, cards: SessionCard[], record: StudyRecord, syllabus: Syllabus): RoundItem[] {
  const shaky = new Set(e.coverage(course, syllabus[course]).filter((u) => u.status === "shaky").flatMap((u) => [u.topic, ...u.topics]));
  const qs = e.questions.filter((q) => q.course === course);
  const questionItems = (list: typeof qs): RoundItem[] => list.map((q) => ({ q, review: !!e.prog(q.id)?.seen }));
  const cardItems = (list: SessionCard[]): RoundItem[] => list.filter((c) => c.course === course).map((card) => ({ card, review: !!record.cards[card.id] }));
  const dueCards = readyCards([], cards, record, undefined, course, e.today, "due").due;
  const ordered = [
    ...questionItems(e.missedTopics().filter((t) => t.course === course).flatMap((t) => t.items.filter((it) => it.p.lastCorrect === false).map((it) => it.q))),
    ...questionItems(qs.filter((q) => shaky.has(q.topic))),
    ...cardItems(cards.filter((c) => shaky.has(c.topic))),
    ...questionItems(e.queues(course).due), ...cardItems(dueCards),
  ];
  const used = new Set<string>();
  return ordered.filter((it) => { const id = itemId(it); if (used.has(id)) return false; used.add(id); return true; }).slice(0, 25);
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
