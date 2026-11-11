// Reusable mocked-backend browser harness for Lawstin. No real network, login or writes.
//   import { open, richState, closeAll } from './mock.mjs'
//   const s = await open({ width: 390, height: 844, dark: false, hash: '#/study' });
//   await s.page.getByRole('button', { name: 'Start studying' }).click();   // click around...
//   await s.page.screenshot({ path: 'x.png' }); console.log(s.errors, s.answers.length); await s.close(); await closeAll();
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { applyLocalAnswer } from '../../src/helpers/localAnswer.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures', name), 'utf8'));
export const SUPABASE = 'https://vbqfmgsrxurdazujbbuk.supabase.co';
export const TZ = 'America/Chicago';
const USER = { id: '00000000-0000-0000-0000-000000000001', email: 'austin@example.com', aud: 'authenticated', role: 'authenticated' };

// ---------- servers and browser (shared, started lazily) ----------
let server, browser;
/** Starts (or reuses) one in-process Vite dev server. Returns { port, url, server }. */
export async function startServer(port = 5183) {
  if (!server) {
    const s = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: false } });
    await s.listen();
    const p = s.httpServer.address().port;
    server = { server: s, port: p, url: `http://127.0.0.1:${p}/LAWSTIN/` };
  }
  return server;
}
/** Launches (or reuses) Chromium. */
export async function launch() {
  if (!browser) {
    const executablePath = process.env.LAWSTIN_CHROMIUM_PATH ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  }
  return browser;
}
export async function closeAll() { await browser?.close(); await server?.server.close(); browser = server = undefined; }

// ---------- dates (all in one fixed time zone so node and the page agree) ----------
export const dayKey = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
export const addDays = (key, n) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8) + n)).toISOString().slice(0, 10);

// ---------- synthetic question bank ----------
const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const NAMES = {
  il: ['Ardenia', 'Bolvaria', 'Costara', 'Dunmere', 'Estovia', 'Falkren'],
  asy: ['Applicant M.R.', 'Applicant J.T.', 'Applicant S.K.', 'Applicant L.D.', 'Applicant N.O.', 'Applicant H.V.'],
  pr: ['Attorney Vale', 'Attorney Okafor', 'Attorney Lindqvist', 'Attorney Reyes', 'Attorney Haddad', 'Attorney Brandt'],
};
const OTHERS = { il: ['Gelmark', 'Hadria', 'Ilvane', 'Jorvik', 'Kestrel', 'Lomira'], asy: ['the Government', 'the DHS trial attorney', 'the immigration judge', 'the asylum officer', 'the Government', 'the DHS trial attorney'], pr: ['a client', 'opposing counsel', 'a judge', 'a former client', 'a prospective client', 'a supervising partner'] };
// class dates (days before today) and class day numbers per topic
const TOPIC_DAYS = {
  'Use of Force & Jus ad Bellum': [33, 12], 'Laws of War': [21, 18], 'State Immunity': [8, 22],
  'Standard of Proof': [30, 14], 'The Nexus Requirement': [20, 17], 'Particular Social Group': [7, 21],
  'Judicial Conduct': [31, 13], 'Confidentiality & Prospective Clients': [19, 16], 'Special Duties of Prosecutors': [6, 20],
};
const ROLES = ['correct', 'sneaky', 'average', 'bad'];
const PROMPTS = ['Which outcome is correct on these facts?', 'What is the best analysis?', 'How should the tribunal rule?', 'Which statement is most accurate?', 'What result follows under the sample rule?', 'Which response best fits the rule?'];

const cap = t => t[0].toUpperCase() + t.slice(1);
function buildQuestions(today) {
  const tax = fixture('study-taxonomy.json').topics;
  const out = [], rand = rng(7);
  let k = 0;
  for (const course of ['il', 'asy', 'pr']) {
    const subs = tax.filter(t => t.course === course);
    const names = NAMES[course], others = OTHERS[course];
    // 6 questions per subtopic, 30 per course
    subs.forEach((t, si) => {
      const phrase = t.subtopic.replace(/\s*\(.*?\)\s*/g, ' ').replace(/,.*$/, '').trim().toLowerCase();
      for (let j = 0; j < 6; j++, k++) {
        const a = names[(si + j) % 6], b = others[(si * 2 + j) % 6], n = out.length + 1;
        const flavor = (si + j) % 2; // 0: element met, 1: element not met
        const stems = {
          il: [`${a} and ${b} disagree about the ${phrase} issue. In sample scenario ${n}, ${a} acted on day ${j + 3} of the dispute after ${b} changed its position.`, `Sample scenario ${n}: ${b} lodges a claim against ${a}. The claim turns on ${phrase}, and the record shows ${j + 2} relevant communications between them.`, `Officials of ${a} describe a ${phrase} problem to a regional body. ${b} responds in writing within ${j + 4} days (sample scenario ${n}).`],
          asy: [`${a} describes events that led to a fear of return. In sample scenario ${n}, the testimony on ${phrase} is detailed and consistent, and ${b} disputes one point.`, `Sample scenario ${n}: ${a} applies after ${j + 1} months in the country. The disputed question is ${phrase}, and ${b} offers a competing account.`, `${a} presents a declaration and ${j + 2} exhibits on ${phrase}. ${b} argues the showing is incomplete (sample scenario ${n}).`],
          pr: [`${a} is asked by ${b} to handle a matter touching on ${phrase}. In sample scenario ${n}, ${a} first learned the key fact ${j + 2} weeks into the engagement.`, `Sample scenario ${n}: ${a} faces a ${phrase} question after ${b} raises it during a hearing, and ${a} has to decide how to respond.`, `${b} contacts ${a} about a pending matter. The ${phrase} issue is live, and ${a}'s notes show ${j + 3} earlier contacts (sample scenario ${n}).`],
        }[course];
        const stem = stems[j % 3] + ` This is a synthetic practice item, not legal advice.`;
        const rule = `Sample rule for ${t.subtopic}: the ${phrase} element is decided on the facts at the time of the act, not on later events.`;
        const gist = [`the ${phrase} element is met`, `the ${phrase} element is not met`][flavor];
        const text = flavor === 0
          ? [`${a} prevails: ${gist} on these facts.`, `${a} prevails, but only because of a separate exception to the ${phrase} rule.`, `${b} prevails because ${a} waited too long to raise it.`, `Neither side prevails, because the facts cannot be known without a vote.`]
          : [`${a} does not prevail: ${gist} on these facts.`, `${a} does not prevail, but only because of a technical defect in the filing.`, `${a} prevails because ${b} was first to act.`, `The question is moot, so no ruling is needed.`];
        const why = [`Matches the sample rule: ${gist}, judged at the time of the act.`, `Right result for the wrong reason; the stated exception is not what decides ${phrase}.`, `Plausible, but timing is not the test for ${phrase}.`, `Not a recognized basis for deciding ${phrase}.`];
        const ans = 'ABCD'[Math.floor(rand() * 4)];
        // place the correct choice at `ans`, the rest in role order
        const order = [...ROLES.slice(1)]; const roles = []; let r = 0;
        for (const L of 'ABCD') roles.push(L === ans ? 'correct' : order[r++]);
        const [td, cd] = TOPIC_DAYS[t.topic] ?? [14, 10];
        out.push({
          id: `${course}-${String(k % 30 + 1).padStart(2, '0')}`, course, topic: t.topic, subtopic: t.subtopic, classDay: cd, classDate: addDays(today, -td),
          source: `Day ${cd} notes`, batch: null, stem, prompt: PROMPTS[(n + j) % 6],
          choices: 'ABCD'.split('').map((L, i) => ({ id: L, role: roles[i], text: cap(text[ROLES.indexOf(roles[i])]), why: why[ROLES.indexOf(roles[i])] })),
          answer: ans, rule, authority: `${t.subtopic}, sample authority ${si + 1}.${j + 1} (placeholder)`,
        });
      }
    });
  }
  return out;
}

// ---------- the rich dataset ----------
/** Options: { now: Date|'YYYY-MM-DD' (default: real now), empty: boolean }. Returns the whole mocked backend dataset. */
export function richState(opts = {}) {
  const now = opts.now ? (typeof opts.now === 'string' ? new Date(`${opts.now}T18:00:00.000Z`) : opts.now) : new Date();
  const today = dayKey(now), d = n => addDays(today, n), iso = (n, h = 17) => `${d(n)}T${String(h).padStart(2, '0')}:00:00.000Z`;
  const questions = buildQuestions(today);
  const rand = rng(11);
  // update runs: newest yesterday; each question's batch is its run date
  const runPlan = [[-1, 18], [-4, 15], [-9, 12], [-16, 15], [-23, 30]];
  const runs = []; let at = 0;
  const byCourse = {}; for (const q of questions) (byCourse[q.course] ||= []).push(q);
  const interleaved = []; for (let i = 0; i < 30; i++) for (const c of ['il', 'asy', 'pr']) interleaved.push(byCourse[c][i]);
  for (const [off, n] of runPlan) {
    const slice = interleaved.slice(at, at + n); at += n;
    slice.forEach(q => { q.batch = d(off); });
    const bc = {}; slice.forEach(q => { bc[q.course] = (bc[q.course] ?? 0) + 1; });
    runs.push({ date: d(off), added: n, byCourse: bc, note: `${n} new questions from the class notes (sample data).` });
  }
  // progress: roughly a third of the questions in a believable mix
  const ids = questions.map(q => q.id).sort(() => rand() - 0.5);
  const kinds = [['dueToday', 6], ['overdue', 5], ['later', 8], ['missed', 5], ['sneaky', 3], ['guessed', 3]];
  const progress = [], P = (id, o) => ({ questionId: id, seen: 1, correct: 1, wrong: 0, box: 1, due: d(1), lastChoice: 'A', lastCorrect: true, lastAt: iso(-2), missSneaky: 0, missAverage: 0, missBad: 0, guessed: 0, starred: false, flagged: false, ...o });
  let cur = 0;
  for (const [kind, n] of kinds) for (let i = 0; i < n; i++) {
    const id = ids[cur++], q = questions.find(x => x.id === id), wrongL = q.choices.find(c => c.role !== 'correct');
    const sn = q.choices.find(c => c.role === 'sneaky').id, av = q.choices.find(c => c.role === 'average').id, bd = q.choices.find(c => c.role === 'bad').id;
    if (kind === 'dueToday') progress.push(P(id, { seen: 3, correct: 3, box: 2, due: d(0), lastAt: iso(-3), lastChoice: q.answer }));
    if (kind === 'overdue') progress.push(P(id, { seen: 2, correct: 2, box: 1, due: d(-1 - (i % 4)), lastAt: iso(-5 - i), lastChoice: q.answer }));
    if (kind === 'later') progress.push(P(id, { seen: 4, correct: 4, box: 3, due: d(2 + i * 3), lastAt: iso(-1 - (i % 3)), lastChoice: q.answer }));
    if (kind === 'missed') progress.push(P(id, { seen: 2, correct: 0 + (i % 2), wrong: 2 - (i % 2), box: 1, due: d(i % 2), lastAt: iso(i % 2 ? 0 : -1), lastCorrect: false, lastChoice: i % 2 ? bd : av, missAverage: i % 2 ? 0 : 1, missBad: i % 2 ? 1 : 0 }));
    if (kind === 'sneaky') progress.push(P(id, { seen: 3, correct: 2, wrong: 1, box: 2, due: d(i + 1), lastAt: iso(-3), lastChoice: q.answer, missSneaky: 1 }));
    if (kind === 'guessed') progress.push(P(id, { seen: 2, correct: 2, box: 1, due: d(1), lastAt: iso(-1), lastChoice: q.answer, guessed: 1 }));
    void wrongL; void sn;
  }
  for (let i = 0; i < 3; i++) progress[i * 7].starred = true;
  progress.push(P(ids[cur++], { seen: 0, correct: 0, box: 0, due: null, lastChoice: null, lastCorrect: null, lastAt: null, starred: true }));
  // days: five weeks, gaps, a 3-day streak ending today
  const days = [];
  for (let i = 34; i >= 0; i--) {
    const gap = [4, 5, 9, 12, 13, 19, 22, 23, 24, 30].includes(i) || i === 3;
    const answered = i === 0 ? 14 : i === 1 ? 22 : i === 2 ? 9 : gap ? 0 : 5 + Math.floor(rand() * 28);
    if (answered) days.push({ date: d(-i), answered, correct: Math.round(answered * (0.62 + rand() * 0.25)) });
  }
  // materials and runs from the real library snapshot; plus two more update notes
  const lib = fixture('study-library.json');
  const materials = lib.materials;
  const studyRuns = [...lib.runs, { id: 'study-sample-a', run_date: d(-6), created_at: iso(-6), added: 12, by_course: { il: 4, asy: 4, pr: 4 }, by_kind: { flashcard: 8, outline: 2, drill: 2 }, classes: ['Sample class'], weak_topics: [], history_available: true, check_counts: { drafted: 12, passed: 12, fixedThenPassed: 0, dropped: 0 }, note: 'Sample update.' },
    { id: 'study-sample-b', run_date: d(-13), created_at: iso(-13), added: 9, by_course: { il: 3, asy: 3, pr: 3 }, by_kind: { flashcard: 6, comparison: 1, flowchart: 1, hypothetical: 1 }, classes: ['Sample class'], weak_topics: [], history_available: true, check_counts: { drafted: 9, passed: 9, fixedThenPassed: 0, dropped: 0 }, note: 'Sample update.' }];
  const unit = (topic, dates, also) => ({ topic, dates: dates.map(d), ...(also ? { also } : {}) });
  const syllabus = {
    il: [unit('Sources of International Law', [-40, -38]), unit('Use of Force & Jus ad Bellum', [-33, -31, -28]), unit('Laws of War', [-21, -19], ['Laws of War Part I']), unit('State Immunity', [-8, -6]), unit('Human Rights Treaties', [-3]), unit('International Criminal Law', [4, 6]), unit('The Law of the Sea', [11])],
    asy: [unit('Overview of Asylum Law', [-42]), unit('Standard of Proof', [-30, -28]), unit('The Nexus Requirement', [-20, -18]), unit('Particular Social Group', [-7, -5]), unit('Bars to Asylum', [-2]), unit('Withholding and CAT', [5]), unit('Credibility and Corroboration', [9])],
    pr: [unit('Regulation of the Profession', [-41]), unit('Judicial Conduct', [-31, -29]), unit('Confidentiality & Prospective Clients', [-19, -17]), unit('Special Duties of Prosecutors', [-6, -4]), unit('Fees and Fee Sharing', [-1]), unit('Conflicts of Interest', [3]), unit('Advertising and Solicitation', [10])],
  };
  const T = (id, course, title, due, extra = {}) => ({ id: `00000000-0000-4000-8000-0000000000${id}`, course, title, notes: '', due, flagged: false, done_at: null, created_at: iso(-12 + +id), updated_at: iso(-1), ...extra });
  const tasks = [
    T('01', 'clinic', 'Draft client intake memo', d(0), { notes: 'Use the intake template; send to supervising attorney.' }),
    T('02', 'clinic', 'Submit weekly hour log', d(-2), { flagged: true }),
    T('03', 'clinic', 'Complete orientation modules', d(-5), { done_at: iso(-4) }),
    T('04', 'tutoring', 'Prepare the Rule 12 handout', d(3)),
    T('05', 'tutoring', 'Email the tutees about Friday’s session', d(1), { flagged: true }),
  ];
  const essay = (id, off, course, topic, score, materialId) => ({
    id, at: iso(off), day: d(off), course, topic, ...(materialId ? { materialId } : {}),
    facts: `Sample facts for ${topic}: a fictional dispute with two parties and three disputed events. This is synthetic practice material, not legal advice.`, call: 'Discuss the issues and the likely outcome.',
    answer: `The first issue is whether the threshold element is met. The governing rule looks to the facts at the time of the act. Here the record shows... (sample answer, ${topic}).\n\nSecond, the exception does not apply because...`, words: 412, seconds: 1480, minutes: 25,
    grade: { score, summary: `A ${score >= 7 ? 'solid' : 'uneven'} answer: the main issue is spotted, but the application is ${score >= 7 ? 'mostly complete' : 'thin in places'}.`, rubric: { issues: Math.min(10, score + 1), rules: score, application: Math.max(3, score - 1) },
      spotted: [{ issue: 'Threshold element', comment: 'Stated the rule and tied it to the facts.' }, { issue: 'Timing of the act', comment: 'Noted that the facts are judged when the act occurred.' }],
      missed: [{ issue: 'The exception', rule: 'The exception applies only when the stated condition is met; check each condition.' }], errors: score >= 7 ? [] : ['Treated a later event as if it changed the analysis.'],
      modelAnswer: 'A model answer would state the threshold rule, apply it to each party in turn, address the exception, and reach a conclusion on each claim. (Synthetic sample.)' },
  });
  const hypo = id => materials.find(m => m.kind === 'hypothetical' && m.course === id)?.id;
  const written = [essay('sample-essay-1', -3, 'il', 'Laws of War', 6, hypo('il')), essay('sample-essay-2', -9, 'asy', 'Particular Social Group', 8, hypo('asy'))];
  const card = (i, o) => ({ seen: 2, correct: 2, box: 2, due: d(2), last_at: iso(-1), ...o, id: i });
  const cards = ['il', 'asy', 'pr'].flatMap(c => materials.filter(m => m.kind === 'flashcard' && m.course === c).slice(0, 4).map((m, i) => card(m.id, i === 0 ? { due: d(-1), box: 1, seen: 1, correct: 1 } : i === 1 ? { due: d(0) } : i === 2 ? { due: d(6), box: 3, seen: 4, correct: 3 } : { due: d(2) })));
  const pick = (kind, course) => materials.find(m => m.kind === kind && m.course === course)?.id;
  const rows = [
    ...Object.entries(syllabus).map(([c, units]) => [`syllabus:v1:${c}`, JSON.stringify({ units })]),
    ...written.map(e => [`written:v1:${e.id}`, JSON.stringify(e)]),
    ...cards.map(({ id, ...c }) => [`study:v1:cards:${id}`, JSON.stringify(c)]),
    [`study:v1:starred:${pick('outline', 'il')}`, 'true'], [`study:v1:confidence:${pick('flowchart', 'il')}`, '"shaky"'], [`study:v1:confidence:${pick('comparison', 'asy')}`, '"solid"'],
    [`study:v1:completed:${pick('outline', 'pr')}`, 'true'], [`study:v1:notes:${pick('outline', 'il')}`, '"Remember: classification decides which body of rules applies."'],
    ['workspace:notes:clinic', 'Supervising attorney: sample name\nTeam meeting Thursdays 2:00 pm\nCase files live in the shared Drive folder.'],
    ['workspace:notes:tutoring', 'Sessions: Tue and Fri\nBring the Rule 12 handout.'],
    ['workspace:clinic:hours', JSON.stringify({ logged: 87.5, required: 200, as_of: d(-2) })],
    ['daily_goal', '20'], ['summary_email', 'austin@example.com'], ['notify_evening', '1'], ['notify_nudges', '1'],
  ].map(([key, value]) => ({ key, value, updated_at: iso(-1, 12) }));
  const data = { today, now, state: { questions, progress, runs, days }, rows, tasks, materials, studyRuns };
  return opts.empty ? emptyOf(data) : data;
}
/** A brand-new account: the question bank and study library exist, but no progress, days, runs, essays, tasks or study rows. */
function emptyOf(d) {
  return { ...d, state: { questions: d.state.questions.map(q => ({ ...q, batch: null })), progress: [], runs: [], days: [] }, tasks: [], studyRuns: [],
    rows: d.rows.filter(r => r.key.startsWith('syllabus:v1:') || r.key === 'daily_goal') };
}

// ---------- mocked AI edge function ----------
function ai(b) {
  const q = b.question;
  switch (b.action) {
    case 'ask': return { action: 'ask', reply: `Good question. Under the sample rule, the answer turns on the facts at the time of the act. ${q?.rule ?? ''}\n\nChange one fact and ask whether the timing changes: if the act happens earlier, the result can flip. (Mock tutor reply.)` };
    case 'harder': return { action: 'harder', question: { ...q, id: `ai-${Date.now()}`, batch: null, stem: `${q.stem} Add a twist: a second party joins and the timing of the act is now disputed.`, prompt: 'Which outcome is correct once the twist is considered?' } };
    case 'spotter': return { action: 'spotter', spotter: { course: b.course, topic: { il: 'Laws of War', asy: 'Particular Social Group', pr: 'Special Duties of Prosecutors' }[b.course], minutes: b.length === 'full' ? 45 : 15,
      facts: 'Sample facts: two fictional parties dispute a series of events over three weeks. The first event is clear; the second is contested; the third happens after the filing. This is synthetic practice material, not legal advice.', call: 'Discuss the issues each party can raise and the likely outcome.', issues: ['Threshold element', 'Timing of the act', 'Exception to the rule'] } };
    case 'grade': return { action: 'grade', grade: ai.grade };
    case 'explain': return { action: 'explain', explain: { verdict: 'partial', got: ['Named the governing rule.'], gaps: ['Did not tie the rule to the timing of the act.'], note: 'Close. Add how the facts at the time of the act decide it.' } };
    default: return { error: 'unknown action' };
  }
}
ai.grade = { score: 7, summary: 'A solid answer that spots the main issues and applies the rule, with the exception handled briefly.', rubric: { issues: 8, rules: 7, application: 6 },
  spotted: [{ issue: 'Threshold element', comment: 'Stated the rule and applied it to the facts.' }, { issue: 'Timing of the act', comment: 'Correctly looked at the time of the act.' }],
  missed: [{ issue: 'Exception to the rule', rule: 'The exception applies only when its condition is met; check each condition on the facts.' }], errors: ['Treated the third event as relevant to the first claim.'],
  modelAnswer: 'A model answer states the threshold rule, applies it to each party, addresses the exception, and concludes on each claim. (Mock grader output.)' };

// ---------- the mocked backend ----------
function keyTest(u, body) { // PostgREST-style key filters on app_settings
  const preds = [];
  const parse = (name, v) => {
    if (v.startsWith('eq.')) preds.push(k => k === v.slice(3));
    else if (v.startsWith('like.')) { const p = v.slice(5).replace('%', ''); preds.push(k => k.startsWith(p)); }
    else if (v.startsWith('in.')) { const l = v.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, '')); preds.push(k => l.includes(k)); }
  };
  for (const v of u.searchParams.getAll('key')) parse('key', v);
  const or = u.searchParams.get('or');
  if (or) { const alts = or.slice(1, -1).split(',').map(s => s.replace(/^key\./, '')); preds.push(k => alts.some(a => a.startsWith('like.') && k.startsWith(a.slice(5).replace('%', '')))); }
  return k => preds.every(p => p(k));
}

/**
 * Opens the app against the mocked backend.
 * opts: width, height, dark, reducedMotion (default true), state (richState() result; default richState({now})), emptyState (new account),
 *   prefs (localStorage lawstin-prefs; default {recall:false, plan:true}), hash ('#/study'), now (Date|'YYYY-MM-DD' fake clock, set before load),
 *   nightBefore (final tomorrow: now = the day before the first final), auth (default true; false shows sign-in), backendDown (every backend call fails, device offline),
 *   storage (extra localStorage entries to seed), wait (default true: wait for the app to settle).
 * Returns { ctx, page, errors, answers, rows, tasks, data, setOffline(bool), failNext(), goto(hash), close() }.
 */
export async function open(opts = {}) {
  const { width = 390, height = 844, dark = false, reducedMotion = true, emptyState = false, prefs = { recall: false, plan: true }, hash = '#/study', auth = true, backendDown = false, storage = {}, wait = true } = opts;
  const now = opts.nightBefore ? '2026-12-01' : opts.now;
  const given = opts.state?.state ? opts.state : richState({ now });
  const data = emptyState ? emptyOf(given) : given;
  const srv = await startServer(), br = await launch();
  let state = structuredClone(data.state), rows = structuredClone(data.rows), tasks = structuredClone(data.tasks), down = backendDown, failNext = false;
  const answers = [], errors = [], events = [], failures = [];
  let aiDelay = 0, loseAck = false;
  const ctx = await br.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light', reducedMotion: reducedMotion ? 'reduce' : 'no-preference', serviceWorkers: 'block', timezoneId: TZ, locale: 'en-US' });
  await ctx.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
  await ctx.addInitScript(({ auth, prefs, storage, down, user }) => {
    try {
      if (auth && !localStorage.getItem('lawstin-auth')) localStorage.setItem('lawstin-auth', JSON.stringify({ access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', expires_at: 4102444800, expires_in: 36000, token_type: 'bearer', user }));
      if (prefs && !localStorage.getItem('lawstin-prefs')) localStorage.setItem('lawstin-prefs', JSON.stringify(prefs));
      for (const [k, v] of Object.entries(storage)) if (!localStorage.getItem(k)) localStorage.setItem(k, v);
    } catch { /* storage blocked */ }
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !(sessionStorage.getItem('lawstin-mock-offline') === 'true' || down) });
  }, { auth, prefs, storage, down, user: USER });
  await ctx.route(`${SUPABASE}/**`, async route => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname, m = req.method();
    const json = (b, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(b) });
    if (down) return route.abort('internetdisconnected');
    const failure = failures.findIndex(f => p.endsWith(f.path) && m === f.method && (!f.key || u.searchParams.get('key') === `eq.${f.key}`));
    if (failure >= 0) { const f = failures.splice(failure, 1)[0]; if (f.abort) return route.abort('failed'); return json({ message: 'Deliberate failure' }, f.status ?? 503); }
    if (m === 'OPTIONS') return route.fulfill({ status: 204 });
    let body = null; try { body = req.postDataJSON(); } catch { /* no body */ }
    const one = (req.headers().accept ?? '').includes('vnd.pgrst.object');
    const reply = list => one ? (list.length ? json(list[0]) : json({ message: 'no rows' }, 406)) : json(list);
    if (p.endsWith('/auth/v1/user')) return json(USER);
    if (p.includes('/auth/v1/')) return json({ message: 'unexpected auth call' }, 400);
    if (p.endsWith('/rpc/get_state')) return json(state);
    if (p.endsWith('/rpc/record_answer')) {
      if (failNext) { failNext = false; return json({ message: 'Save refused for test' }, 400); }
      const input = { questionId: body.p_question_id, choice: body.p_choice, localDate: body.p_local_date };
      state = applyLocalAnswer(state, input, new Date().toISOString()); answers.push(input);
      const q = state.questions.find(x => x.id === input.questionId);
      return json({ correct: input.choice === q?.answer, progress: state.progress.find(x => x.questionId === input.questionId) });
    }
    if (p.endsWith('/rpc/mark_question')) {
      state = { ...state, progress: state.progress.some(x => x.questionId === body.p_question_id) ? state.progress : [...state.progress, { questionId: body.p_question_id, seen: 0, correct: 0, wrong: 0, box: 0, due: null, lastChoice: null, lastCorrect: null, lastAt: null, missSneaky: 0, missAverage: 0, missBad: 0, guessed: 0, starred: false, flagged: false }] };
      state.progress = state.progress.map(x => x.questionId !== body.p_question_id ? x : { ...x, ...(body.p_action === 'star' ? { starred: body.p_starred } : body.p_action === 'flag' ? { flagged: true } : { guessed: x.guessed + 1, box: 1 }) });
      return json({ ok: true });
    }
    if (p.endsWith('/functions/v1/ai')) { if (aiDelay) await new Promise(r => setTimeout(r, aiDelay)); return json(ai(body)); }
    if (p.includes('/functions/v1/course-cloud/setup/status')) return json({ quiz_ready: true, drive_configured: true, oauth_discovery_ready: true, chatgpt_plugin_url: null });
    if (p.includes('/functions/v1/notify')) return json({ result: 'Sent (mock)' });
    if (p.endsWith('/app_settings')) {
      if (m === 'POST') { for (const r of Array.isArray(body) ? body : [body]) rows = [...rows.filter(x => x.key !== r.key), { updated_at: new Date().toISOString(), ...r }]; return route.fulfill({ status: 201, body: '' }); }
      if (m === 'DELETE' || m === 'PATCH') return route.fulfill({ status: 204, body: '' });
      const test = keyTest(u), hit = rows.filter(r => test(r.key)).sort((a, b) => a.key.localeCompare(b.key));
      const range = req.headers().range?.split('-').map(Number), list = range ? hit.slice(range[0], range[1] + 1) : hit;
      return reply(list);
    }
    if (p.endsWith('/course_tasks')) {
      const id = u.searchParams.get('id')?.replace('eq.', '');
      if (m === 'GET') return json(tasks);
      if (m === 'POST') { const t = { id: `00000000-0000-4000-8000-${String(Date.now()).padStart(12, '0')}`, notes: '', flagged: false, done_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body }; tasks = [...tasks, t]; return one ? json(t, 201) : json([t], 201); }
      if (m === 'PATCH') { tasks = tasks.map(t => t.id === id ? { ...t, ...body } : t); return route.fulfill({ status: 204, body: '' }); }
      if (m === 'DELETE') { tasks = tasks.filter(t => t.id !== id); return route.fulfill({ status: 204, body: '' }); }
    }
    if (p.endsWith('/study_materials')) return json(data.materials.map(x => ({ data: x })));
    if (p.endsWith('/study_runs')) return json(data.studyRuns.map(x => ({ data: x })));
    if (p.endsWith('/push_subscriptions')) return route.fulfill({ status: m === 'GET' || m === 'HEAD' ? 200 : 204, headers: { 'content-range': '0-0/2' }, body: '' });
    if (p.endsWith('/study_events')) {
      if (m === 'GET') return json(events);
      for (const row of Array.isArray(body) ? body : [body]) {
        if (events.some(e => e.id === row.id)) continue;
        events.push(row);
        const day = state.days.find(d => d.date === row.local_date);
        if (day) { day.answered++; day.correct += Number(row.correct); }
        else state.days.push({ date: row.local_date, answered: 1, correct: Number(row.correct) });
      }
      if (loseAck) { loseAck = false; return route.abort('failed'); }
      return route.fulfill({ status: 201, body: '' });
    }
    errors.push(`Unhandled backend request: ${m} ${p}${u.search}`);
    return json({ message: 'Unexpected test request' }, 400);
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  if (now) await page.clock.install({ time: new Date(`${typeof now === 'string' ? now : dayKey(now)}T18:00:00.000Z`) });
  const url = srv.url + (hash.startsWith('#') ? hash : `#${hash}`);
  await page.goto(url);
  const settle = async () => {
    await page.locator('nav[aria-label="Sections"], form, h1').first().waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
  };
  if (wait && !backendDown) await settle();
  return {
    ctx, page, errors, answers, events, data, get rows() { return rows; }, get tasks() { return tasks; }, get state() { return state; }, settle,
    setOffline: async on => { down = on; await page.evaluate(v => sessionStorage.setItem('lawstin-mock-offline', String(v)), on); await page.evaluate(v => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !v }), on); await page.evaluate(v => window.dispatchEvent(new Event(v ? 'offline' : 'online')), on); },
    failRequest: (path, method = 'GET', options = {}) => failures.push({ path, method, ...options }),
    loseEventAck: () => { loseAck = true; },
    delayAi: ms => { aiDelay = ms; },
    failNext: () => { failNext = true; },
    goto: async h => { await page.evaluate(x => { window.location.hash = x; }, h.startsWith('#') ? h : `#${h}`); await page.waitForTimeout(400); },
    close: () => ctx.close(),
  };
}
