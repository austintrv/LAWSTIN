import type { OutputType as State, QuestionDTO, ProgressDTO } from "../endpoints/state_GET.schema";
import { dateKey } from "./dateKey";

export type CourseCode = "il" | "asy" | "pr";
export type Filter = "all" | CourseCode;
export type RoundItem = { q: QuestionDTO; review: boolean };

export const COURSES: Record<CourseCode, { name: string; short: string; color: string }> = {
  il: { name: "International Law", short: "Intl Law", color: "var(--course-il)" },
  asy: { name: "Asylum Law", short: "Asylum", color: "var(--course-asy)" },
  pr: { name: "Professional Responsibility", short: "Pro Res", color: "var(--course-pr)" },
};
export const COURSE_KEYS: CourseCode[] = ["il", "asy", "pr"];
export const ROLE_LABEL: Record<string, string> = {
  correct: "Correct answer",
  sneaky: "Sneaky distractor",
  average: "Average distractor",
  bad: "Really bad answer",
};
export const ROUND_SIZE = 10;
export const DAILY_GOAL = 20;

const shuffle = <T,>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

function interleave<T>(lists: T[][]): T[] {
  const ls = lists.map((l) => [...l]);
  const out: T[] = [];
  while (ls.some((l) => l.length)) for (const l of ls) if (l.length) out.push(l.shift() as T);
  return out;
}

function byCourse<T extends { q: QuestionDTO }>(items: T[]): T[][] {
  const m: Record<string, T[]> = {};
  for (const it of items) (m[it.q.course] ||= []).push(it);
  return shuffle(Object.values(m));
}

/** Pure study logic over the loaded state. */
export function studyEngine(state: State | undefined) {
  const questions = state?.questions ?? [];
  const pmap = new Map<string, ProgressDTO>((state?.progress ?? []).map((p) => [p.questionId, p]));
  const days = new Map((state?.days ?? []).map((d) => [d.date, d]));
  const today = dateKey.today();
  const prog = (id: string) => pmap.get(id);
  const seen = (id: string) => (prog(id)?.seen ?? 0) > 0;
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
    const order = (a: QuestionDTO, b: QuestionDTO) => {
      const pa = prog(a.id)!, pb = prog(b.id)!;
      return (pa.due ?? "").localeCompare(pb.due ?? "") || pa.box - pb.box;
    };
    due.sort(order); ahead.sort(order);
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

  function weakTopics() {
    return topicStats().filter((t) => t.c + t.w >= 2 && t.c / (t.c + t.w) < 0.7);
  }

  function courseStats(c: CourseCode) {
    let n = 0, s = 0, cor = 0, wr = 0;
    for (const q of questions) {
      if (q.course !== c) continue;
      n++;
      const p = prog(q.id);
      if (p && p.seen) { s++; cor += p.correct; wr += p.wrong; }
    }
    return { n, seen: s, cor, wr, acc: cor + wr ? Math.round((cor / (cor + wr)) * 100) : 0 };
  }

  function pickFresh(fresh: QuestionDTO[], n: number) {
    const weak = new Set(weakTopics().map((t) => `${t.course}|${t.topic}`));
    const score = (q: QuestionDTO) => {
      const age = q.classDate ? dateKey.diff(q.classDate, today) : 30;
      return (age <= 7 ? 3 : age <= 21 ? 1.6 : 1) + (weak.has(`${q.course}|${q.topic}`) ? 1.5 : 0) + Math.random();
    };
    const groups: Record<string, [number, QuestionDTO][]> = {};
    for (const q of fresh) (groups[q.course] ||= []).push([score(q), q]);
    const lists = shuffle(Object.values(groups)).map((g) => g.sort((a, b) => b[0] - a[0]).map((x) => x[1]));
    return interleave(lists).slice(0, n);
  }

  function buildRound(f: Filter): RoundItem[] {
    const { due, fresh, ahead } = queues(f);
    let rev = due.slice(0, Math.ceil(ROUND_SIZE / 2));
    const nw = pickFresh(fresh, ROUND_SIZE - rev.length);
    if (rev.length + nw.length < ROUND_SIZE) rev = due.slice(0, ROUND_SIZE - nw.length);
    const items: RoundItem[] = [...rev.map((q) => ({ q, review: true })), ...nw.map((q) => ({ q, review: false }))];
    if (items.length < ROUND_SIZE) items.push(...ahead.slice(0, ROUND_SIZE - items.length).map((q) => ({ q, review: true })));
    return interleave(byCourse(items));
  }

  function listRound(list: QuestionDTO[]): RoundItem[] {
    return interleave(byCourse(shuffle(list).slice(0, ROUND_SIZE).map((q) => ({ q, review: seen(q.id) }))));
  }

  function topicRound(course: CourseCode, topic: string): RoundItem[] {
    const list = questions.filter((q) => q.course === course && q.topic === topic);
    const unseen = list.filter((q) => !seen(q.id));
    const rest = list.filter((q) => seen(q.id)).sort((a, b) => (prog(a.id)!.lastCorrect ? 1 : 0) - (prog(b.id)!.lastCorrect ? 1 : 0));
    return [...shuffle(unseen), ...rest].slice(0, ROUND_SIZE).map((q) => ({ q, review: seen(q.id) }));
  }

  function examRound(f: Filter, size: number): RoundItem[] {
    const list = shuffle(questions.filter((q) => inFilter(q, f))).slice(0, size);
    return interleave(byCourse(list.map((q) => ({ q, review: seen(q.id) }))));
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

  function missProfile() {
    const r = { sneaky: 0, average: 0, bad: 0, correct: 0, wrong: 0, guessed: 0, seen: 0 };
    for (const p of pmap.values()) {
      r.sneaky += p.missSneaky; r.average += p.missAverage; r.bad += p.missBad;
      r.correct += p.correct; r.wrong += p.wrong; r.guessed += p.guessed;
      if (p.seen) r.seen++;
    }
    return r;
  }

  function topicRules(course: CourseCode, topic: string) {
    const seenSub = new Set<string>();
    const out: { subtopic: string; rule: string; authority: string | null }[] = [];
    for (const q of questions) {
      if (q.course !== course || q.topic !== topic || !q.rule) continue;
      const key = q.subtopic ?? q.rule;
      if (seenSub.has(key)) continue;
      seenSub.add(key);
      out.push({ subtopic: q.subtopic ?? topic, rule: q.rule, authority: q.authority });
    }
    return out;
  }

  return { questions, prog, today, queues, topicStats, weakTopics, courseStats, buildRound, listRound, topicRound, examRound, streak, lastNDays, missProfile, topicRules, todayCount: days.get(today) };
}

/** A greeting picked once per app open. Context lines only when the data supports them. */
export function makeGreeting(state: State | undefined, name: string, last: string | null): string {
  const now = new Date();
  const h = now.getHours();
  const dow = now.getDay();
  const tod = h < 5 ? "late" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 22 ? "evening" : "late";
  const time = {
    morning: [`Good morning, ${name}`, `Morning, ${name}`],
    afternoon: [`Good afternoon, ${name}`, `Afternoon, ${name}`],
    evening: [`Good evening, ${name}`, `Evening, ${name}`],
    late: [`Still up, ${name}?`, `Late session, ${name}?`],
  }[tod];
  const general = [`What should we work on, ${name}?`, `Ready when you are, ${name}`, `Let’s get a few in, ${name}`, `Where should we start, ${name}?`];
  const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
  const day = dow === 1 ? [`New week, ${name}`] : dow === 5 ? [`Happy Friday, ${name}`] : dow === 0 || dow === 6 ? [`Happy ${weekday}, ${name}`] : [];
  const ctx: string[] = [];
  if (state) {
    const e = studyEngine(state);
    const { due } = e.queues("all");
    const run = state.runs[0];
    const st = e.streak();
    const done = e.todayCount?.answered ?? 0;
    if (due.length) ctx.push(due.length === 1 ? "One review is waiting" : `${due.length} reviews are waiting`);
    if (run && run.date === e.today && run.added) ctx.push(h < 12 ? `${run.added} new questions this morning` : `${run.added} new questions today`);
    if (st >= 2) ctx.push(`Day ${st} in a row, ${name}`);
    if (done > 0) ctx.push(`Back for more, ${name}?`);
    const weak = e.weakTopics().sort((a, b) => a.c / (a.c + a.w) - b.c / (b.c + b.w))[0];
    if (weak) ctx.push(`${weak.topic} could use a round`);
  }
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  for (let i = 0; i < 6; i++) {
    const r = Math.random();
    const pool = ctx.length && r < 0.45 ? ctx : day.length && r < 0.6 ? day : r < 0.82 ? time : general;
    const g = pick(pool);
    if (g !== last || i === 5) return g;
  }
  return pick(time);
}
