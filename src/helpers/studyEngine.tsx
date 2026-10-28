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
export function studyEngine(state: State | undefined, todayKey?: string) {
  const questions = state?.questions ?? [];
  const pmap = new Map<string, ProgressDTO>((state?.progress ?? []).map((p) => [p.questionId, p]));
  const days = new Map((state?.days ?? []).map((d) => [d.date, d]));
  const today = todayKey ?? dateKey.today();
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
export function makeGreeting(state: State | undefined, name: string, recent: string[]): string {
  const now = new Date();
  const h = now.getHours();
  const dow = now.getDay();
  const month = now.getMonth();
  const date = now.getDate();
  const tod = h < 5 ? "late" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 22 ? "evening" : "late";
  const time = {
    morning: [
      `Good morning, ${name}`, `Morning, ${name}`, `Morning, counselor`, `Rise and brief, ${name}`,
      `Coffee, then case law, ${name}`, `Up before opposing counsel`, `The early bird gets the holding`,
      `Good morning, future Esq.`, `Morning docket is open, ${name}`, `Court opens at 9. You’re early.`,
    ],
    afternoon: [
      `Good afternoon, ${name}`, `Afternoon, ${name}`, `Afternoon, counselor`, `Lunch recess is over, ${name}`,
      `The afternoon session is called to order`, `Post-lunch docket, ${name}`, `Afternoon arguments, ${name}?`,
    ],
    evening: [
      `Good evening, ${name}`, `Evening, ${name}`, `Evening, counselor`, `Night court is in session`,
      `Evening docket is open, ${name}`, `Overtime, ${name}?`, `After-hours session, ${name}`,
    ],
    late: [
      `Still up, ${name}?`, `Late session, ${name}?`, `Late filing, ${name}?`, `Emergency motion at this hour?`,
      `Burning the midnight oil, ${name}?`, `The night is young. The law is old.`, `Even judges sleep, ${name}`,
      `Night court, ${name}?`, `Studying past curfew, ${name}?`,
    ],
  }[tod];
  const general = [
    `What should we work on, ${name}?`, `Ready when you are, ${name}`, `Let’s get a few in, ${name}`, `Where should we start, ${name}?`,
    `Court is now in session, ${name}`, `All rise for ${name}`, `Oyez, oyez, ${name}`, `Order in the court, ${name}`,
    `The Honorable ${name}, presiding`, `Counsel may approach, ${name}`, `The court recognizes ${name}`,
    `May it please the court: ${name}`, `Counselor ${name}, the floor is yours`, `Ready for oral argument, ${name}?`,
    `Let the record reflect: ${name} showed up`, `Appearance entered, ${name}`, `Habeas corpus, ${name}. Body produced.`,
    `In re ${name}`, `${name} v. The Exam`, `${name} v. Procrastination`, `${name}, J.D. loading…`, `Esquire in training, ${name}`,
    `Motion to study: granted`, `Motion to procrastinate: denied`, `Motion to snooze: denied`, `Leave to study: granted`,
    `Cert granted, ${name}`, `Affirmed: ${name} is back`, `Reversed and remanded… to studying`, `Overruled. Keep going, ${name}`,
    `Objection! To not studying.`, `Your excuse is hearsay, ${name}`, `Excuses inadmissible, ${name}`,
    `Statute of limitations on excuses: expired`, `Laches won’t apply if you start now`, `Time is of the essence, ${name}`,
    `No continuances today, ${name}`, `Questions presented: several`, `Brief answer: yes, you can`, `Holding: ${name} is ready`,
    `Dicta aside, let’s study`, `Stare decisis: you keep showing up`, `Let’s make some precedent, ${name}`,
    `Reasonable person standard: met`, `Beyond a reasonable doubt: you’ve got this`, `Preponderance of the evidence says go`,
    `Clear and convincing: today’s the day`, `Notice and an opportunity to study`, `The burden of proof is on you, ${name}`,
    `The jury’s in: you’ve got this`, `Hearsay says you’ll ace this`, `Prima facie ready, ${name}`, `Exhibit A: ${name}, studying`,
    `Discovery is open, ${name}`, `Request for admission: you’re ready`, `Plead your case, ${name}`, `Time to make your case, ${name}`,
    `Offer: ten questions. Accept?`, `Meeting of the minds, ${name}?`, `Docket’s open, ${name}`, `Raising the bar, ${name}`,
    `The bar is waiting, ${name}`, `Sua sponte study session`, `Your witness, ${name}`, `No further questions? We have plenty.`,
    `This greeting is not legal advice`, `Hi, ${name}. Not legal advice.`, `Legally obligated to say hi, ${name}`,
    // International Law
    `The Hague says hi, ${name}`, `No diplomatic immunity from studying`, `Pacta sunt servanda: the study pact holds`,
    `Jus cogens: studying is non-derogable`, `Customary practice: ${name} studies daily`, `Opinio juris says it’s study time`,
    `Reservations? None. Let’s study.`, `Ratified and ready, ${name}`, `The ICJ will see you now`,
    // Asylum Law
    `Well-founded fear of the exam? Fixable.`, `One-year deadline? You’re early, ${name}`, `Credible and ready, ${name}`,
    `Nexus established: you + studying`,
    // Professional Responsibility
    `Rule 1.1 says be competent, ${name}`, `Rule 1.3 says promptness, ${name}`, `Conflict check cleared, ${name}`,
    `Privileged and confidential: hi, ${name}`, `Candor to the tribunal: you’re ready`, `Model Rules, model student`,
    `Zealous advocacy starts here, ${name}`, `The MPRE fears you, ${name}`, `Pro bono study hour, ${name}`,
  ];
  const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
  const day = [
    [`Happy Sunday, ${name}`, `Sunday scaries? Not here.`, `Sunday session, ${name}? Respect.`],
    [`New week, ${name}`, `Monday: fresh docket`, `Monday motion practice, ${name}`, `New week, new holdings`],
    [`Tuesday, ${name}. Let’s go.`, `Tuesday’s calendar is clear, ${name}`],
    [`Midweek, ${name}`, `Midweek recess? Denied.`, `Halfway to the weekend, ${name}`],
    [`Thursday, ${name}. Almost there.`, `Thursday: Friday’s opening argument`],
    [`Happy Friday, ${name}`, `Friday: the weekend is in deliberation`, `TGIF: Thank God It’s Filed`],
    [`Happy ${weekday}, ${name}`, `Saturday session? Respect.`, `Weekend warrior, ${name}`],
  ][dow];
  const season: string[] = [];
  if (month === 9 && date === 31) season.push(`Happy Halloween, ${name}`, `Trick or tort?`, `Scarier than the MPRE? Doubtful.`, `Boo. Ten questions.`);
  else if (month === 9 && date >= 24) season.push(`Spooky season, ${name}`, `Trick or tort?`);
  if (month === 10 && dow === 4 && date >= 22 && date <= 28) season.push(`Happy Thanksgiving, ${name}`, `Thankful for spaced review`);
  if (month === 11 && date <= 20) season.push(`Finals season, ${name}. Let’s go.`, `Exam mode: on`, `Finals? You’ve been ready.`);
  if (month === 11 && (date === 24 || date === 25)) season.push(`Merry Christmas, ${name}`);
  if (month === 0 && date === 1) season.push(`Happy New Year, ${name}`, `New year, new precedent`);
  const ctx: string[] = [];
  if (state) {
    const e = studyEngine(state);
    const { due } = e.queues("all");
    const run = state.runs[0];
    const st = e.streak();
    const done = e.todayCount?.answered ?? 0;
    if (due.length) ctx.push(...(due.length === 1 ? ["One review is waiting", "One review on the docket"] : [`${due.length} reviews are waiting`, `${due.length} reviews on the docket`]));
    if (run && run.date === e.today && run.added) ctx.push(h < 12 ? `${run.added} new questions this morning` : `${run.added} new questions today`, `${run.added} fresh questions just filed`);
    if (st >= 2) ctx.push(`Day ${st} in a row, ${name}`, `${st}-day streak. Precedent set.`);
    if (done >= DAILY_GOAL) ctx.push(`Goal met. Extra credit, ${name}?`, `Daily goal: satisfied. Encore?`);
    else if (done > 0) ctx.push(`Back for more, ${name}?`, `Round two, ${name}?`, `Back on the stand, ${name}`);
    else if (h >= 17) ctx.push(`Today’s docket is still open`);
    const weak = e.weakTopics().sort((a, b) => a.c / (a.c + a.w) - b.c / (b.c + b.w))[0];
    if (weak) ctx.push(`${weak.topic} could use a round`, `${weak.topic} wants a rematch`);
  }
  const pools: [string[], number][] = [[season, 0.2], [ctx, 0.3], [day, 0.1], [time, 0.2], [general, 0.45]];
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  for (let i = 0; i < 8; i++) {
    const live = pools.filter(([p]) => p.length);
    let r = Math.random() * live.reduce((t, [, w]) => t + w, 0);
    const pool = (live.find(([, w]) => (r -= w) < 0) ?? live[live.length - 1])[0];
    const fresh = pool.filter((g) => !recent.includes(g));
    if (fresh.length) return pick(fresh);
  }
  return pick(general.filter((g) => !recent.includes(g)).concat(time));
}
