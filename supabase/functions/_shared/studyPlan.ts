import {dateKey} from './dateKey.ts';
import {COURSE_KEYS,EXAMS,FINALS,activeCourses,apportion,courseCounts,examDue,studyEngine,type CourseCode,type CourseCounts,type Filter} from './studyEngine.ts';
type Engine=ReturnType<typeof studyEngine>;
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
export function studyNumbers(e: Engine, cards: {due: unknown[]; fresh: unknown[]}, plan: { goal: number; courses: PlanCourse[] }, done: CourseCounts, filter: Filter = "all", total = COURSE_KEYS.reduce((a, c) => a + done[c], 0)) {
  const courses = activeCourses(e.today, filter), qs = e.queues(filter);
  const answered = filter === "all" ? Math.max(0, total - COURSE_KEYS.filter((c) => !courses.includes(c)).reduce((a, c) => a + done[c], 0)) : done[filter];
  const review = qs.due.length + cards.due.length;
  const fresh = qs.fresh.length + cards.fresh.length;
  const ready = review + fresh;
  const goal = filter === "all" ? plan.goal : plan.courses.find((c) => c.course === filter)?.target ?? answered + Math.min(ready, 10);
  const left = Math.min(Math.max(0, goal - answered), ready);
  return { answered, goal, review, fresh, ready, left, minutes: left ? Math.max(5, Math.ceil(left * 0.75 / 5) * 5) : 0 };
}

export function inferredDone(e: Engine, record: {cards: Record<string,{last_at:string}>}, essays: { day: string; course: CourseCode; minutes?: number }[] = [], flashcards: {id:string;course:CourseCode}[] = []): CourseCounts {
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


export function readyCardCounts(e:Engine,cards:{id:string;course:CourseCode}[],progress:Record<string,{due:string;last_at:string}>,course:CourseCode) {
 const pool=[...cards,...e.ruleCards(course)].filter(c=>c.course===course);
 let due=0,fresh=0;
 for(const c of pool){const p=progress[c.id];if(!p)fresh++;else if((examDue(p.due,dateKey.today(new Date(p.last_at)),FINALS[course],e.today)??e.today)<=e.today)due++;}
 return {due,fresh};
}
