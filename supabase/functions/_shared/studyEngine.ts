import type { State, QuestionDTO, ProgressDTO } from "./types.ts";
import { dateKey } from "./dateKey.ts";

export type CourseCode = "il" | "asy" | "pr";
export type Filter = "all" | CourseCode;
export type RoundItem = { q: QuestionDTO; review: boolean };

export const COURSES: Record<CourseCode, { name: string; short: string; color: string }> = {
  il: { name: "International Law", short: "Intl Law", color: "var(--course-il)" },
  asy: { name: "Asylum Law", short: "Asylum", color: "var(--course-asy)" },
  pr: { name: "Professional Responsibility", short: "Pro Res", color: "var(--course-pr)" },
};
export const COURSE_KEYS: CourseCode[] = ["il", "asy", "pr"];

const shuffle = <T,>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** Server copy of the app's study logic (only the parts notifications and the weekly email use). */
export function studyEngine(state: State | undefined, todayKey?: string) {
  const questions = state?.questions ?? [];
  const pmap = new Map<string, ProgressDTO>((state?.progress ?? []).map((p) => [p.questionId, p]));
  const days = new Map((state?.days ?? []).map((d) => [d.date, d]));
  const today = todayKey ?? dateKey.today();
  const prog = (id: string) => pmap.get(id);
  const inFilter = (q: QuestionDTO, f: Filter) => f === "all" || q.course === f;

  function queues(f: Filter = "all") {
    const due: QuestionDTO[] = [], fresh: QuestionDTO[] = [], ahead: QuestionDTO[] = [], missed: QuestionDTO[] = [], starred: QuestionDTO[] = [];
    for (const q of questions) {
      if (!inFilter(q, f)) continue;
      const p = prog(q.id);
      if (p?.starred) starred.push(q);
      if (!p || !p.seen) { fresh.push(q); continue; }
      if (p.lastCorrect === false) missed.push(q);
      if ((p.due ?? today) <= today) due.push(q); else ahead.push(q);
    }
    return { due, fresh, ahead, missed, starred, total: questions.filter((q) => inFilter(q, f)).length };
  }

  function topicStats() {
    const m = new Map<string, { course: CourseCode; topic: string; c: number; w: number; n: number; seen: number }>();
    for (const q of questions) {
      const k = `${q.course}|${q.topic}`;
      if (!m.has(k)) m.set(k, { course: q.course, topic: q.topic, c: 0, w: 0, n: 0, seen: 0 });
      const s = m.get(k)!;
      s.n++;
      const p = prog(q.id);
      if (p && p.seen) { s.seen++; s.c += p.correct; s.w += p.wrong; }
    }
    return [...m.values()];
  }

  function streak() {
    let d = today, n = 0;
    if (!((days.get(d)?.answered ?? 0) > 0)) d = dateKey.addDays(d, -1);
    while ((days.get(d)?.answered ?? 0) > 0) { n++; d = dateKey.addDays(d, -1); }
    return n;
  }

  function lastNDays(n: number) {
    const out: { date: string; answered: number; correct: number }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = dateKey.addDays(today, -i);
      const x = days.get(d);
      out.push({ date: d, answered: x?.answered ?? 0, correct: x?.correct ?? 0 });
    }
    return out;
  }

  return { questions, prog, today, queues, topicStats, streak, lastNDays, todayCount: days.get(today), shuffle };
}
