// Screen capture of every distinct screen and overlay, against the mocked backend (tests/browser/mock.mjs).
//   node --import tsx tests/browser/capture.mjs --out <dir> [--widths 390,1440] [--themes light,dark] [--only study,quiz] [--now 2026-11-11]
// Writes <nn>-<screen>-<width>-<theme>.png, index.json (file, description, click path) and capture-log.json (every step, failures with errors).
import fs from 'node:fs';
import path from 'node:path';
import { open, closeAll } from './mock.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg('out', 'artifacts/captures'));
const WIDTHS = arg('widths', '390,1440').split(',').map(Number);
const THEMES = arg('themes', 'light,dark').split(',');
const ONLY = arg('only', '')?.split(',').filter(Boolean);
const NOW = arg('now', undefined);
fs.mkdirSync(OUT, { recursive: true });

// Canonical order: a screen keeps the same number at every width and theme.
const ORDER = `study-top study-full study-scrolled how-it-works row-due row-new row-missed-lesson finals-tile exam-setup row-flashcards row-written row-match row-starred update-study todo-course essay-button
quiz-recall quiz-question quiz-selected quiz-review-wrong quiz-review-facts ask-panel ask-reply flag-sheet quiz-review-right quiz-harder session-complete
exam-question exam-results lesson-rule lesson-slipped lesson-check lesson-correct lesson-complete
flashcard-front flashcard-back flashcards-done written-setup written-prompt written-typed written-graded written-history written-essay match-board match-picked match-result
courses-home courses-tool course-il course-asy course-pr course-next course-kind reader-flowchart reader-outline reader-comparison reader-drill reader-drill-answered reader-hypothetical rulebook-read rulebook-recall workspace-clinic workspace-clinic-task workspace-tutoring
progress-top progress-full progress-expanded topic-sheet progress-how activity-top activity-full activity-day activity-updates settings-top settings-scrolled connected-apps sign-in offline-fresh offline-answer empty-study empty-progress empty-activity night-before-study night-before-finals deep-link exam-eve exam-morning finals-done course-sheet session-recap goal-celebration streak-sheet spot-prompt spot-reveal spot-result spot-rules written-rules written-rewrite written-trend warm-up`.split(/\s+/);

const index = [], log = [];
let W, T, ctxTag;

/** Screenshot of the viewport, or (full) of the whole scrolling content: the viewport is grown to the scroller's full height. */
async function snap(s, name, desc, how, { full = false } = {}) {
  const nn = String((ORDER.indexOf(name) + 1) || 99).padStart(2, '0');
  const file = `${nn}-${name}-${W}-${T}.png`;
  const { page } = s, vp = page.viewportSize();
  let grown = 0;
  if (full) {
    grown = await page.evaluate(() => {
      let best = 0;
      for (const [x, y] of [[0.5, 0.5], [0.5, 0.25], [0.5, 0.75], [0.3, 0.6], [0.7, 0.4]]) {
        for (let el = document.elementFromPoint(innerWidth * x, innerHeight * y); el; el = el.parentElement) {
          const cs = getComputedStyle(el);
          if (/(auto|scroll)/.test(cs.overflowY) || el === document.scrollingElement) best = Math.max(best, el.scrollHeight - el.clientHeight);
        }
      }
      return best;
    });
    if (grown > 8) { await page.setViewportSize({ width: vp.width, height: Math.min(vp.height + grown, 9000) }); await page.waitForTimeout(350); }
  }
  await page.screenshot({ path: path.join(OUT, file) });
  if (grown > 8) { await page.setViewportSize(vp); await page.waitForTimeout(250); }
  index.push({ file, screen: name, width: W, theme: T, description: desc + (full && grown > 8 ? ' (full height of the scrolling view)' : ''), how });
}

/** Runs one step; a failure is logged and never aborts the run. */
async function step(name, fn, s) {
  const t0 = Date.now();
  try { await fn(); log.push({ step: name, width: W, theme: T, status: 'ok', ms: Date.now() - t0 }); return true; }
  catch (e) {
    log.push({ step: name, width: W, theme: T, status: 'failed', error: String(e.message ?? e).split('\n').slice(0, 4).join(' | ') });
    console.log(`  FAILED ${name} @${W}/${T}: ${String(e.message ?? e).split('\n')[0]}`);
    if (s) { fs.mkdirSync(path.join(OUT, 'failures'), { recursive: true }); await s.page.screenshot({ path: path.join(OUT, 'failures', `${name}-${W}-${T}.png`) }).catch(() => {}); }
    if (s) await s.page.evaluate(() => { window.location.hash = '#/study'; }).then(() => s.page.reload()).then(() => s.page.waitForTimeout(800)).catch(() => {});
    return false;
  }
}

// ---------- small helpers ----------
const btn = (page, name, o = {}) => page.getByRole('button', { name, ...o }).first();
const tap = async (page, name, o) => { await btn(page, name, o).click(); await page.waitForTimeout(350); };
const dialog = page => page.getByRole('dialog').last();
/** Back to a clean tab: drops the saved practice session (otherwise the app reopens on “Resume studying” with that course filter). */
const reload = async (s, hash = '#/study') => { await s.page.evaluate(h => { for (const k of Object.keys(localStorage)) if (/practice/.test(k)) localStorage.removeItem(k); window.location.hash = h; }, hash); await s.page.reload(); await s.settle(); };
const qs = s => s.data.state.questions;
/** The question on screen, found by its stem text. */
async function which(s) {
  const text = (await dialog(s.page).innerText()).replace(/\s+/g, ' ');
  const q = qs(s).find(q => text.includes(q.stem.replace(/\s+/g, ' ').slice(0, 50)));
  if (!q) throw new Error('No known question on screen');
  return q;
}
const choice = (page, letter) => dialog(page).getByRole('group', { name: 'Answer choices' }).getByRole('button', { name: new RegExp(`^${letter} `) });
async function answerCurrent(s, right = true) {
  const q = await which(s), L = right ? q.answer : 'ABCD'.replace(q.answer, '')[0];
  await choice(s.page, L).click();
  await tap(s.page, 'Check answer');
  await dialog(s.page).getByRole('heading', { name: /Correct|Not quite/ }).waitFor();
  return q;
}
const isCard = page => dialog(page).getByRole('button', { name: 'Reveal answer' }).isVisible();
/** Answers whatever is on screen (question or recall card) and moves to the next, until the session is complete. */
async function finish(s, limit = 40) {
  const { page } = s;
  for (let i = 0; i < limit; i++) {
    if (await page.getByRole('heading', { name: /Session complete|Exam complete/ }).isVisible()) return;
    if (await isCard(page)) { await tap(page, 'Reveal answer'); await tap(page, 'Got it'); continue; }
    if (await dialog(page).getAttribute('aria-label') === 'Practice exam') { // exam: pick, then Next/Finish moves on without feedback
      const q = await which(s); await choice(page, i % 3 === 1 ? 'ABCD'.replace(q.answer, '')[0] : q.answer).click();
      await dialog(page).getByRole('button', { name: /^(Next|Finish)$/ }).click(); await page.waitForTimeout(250); continue;
    }
    if (await dialog(page).getByRole('button', { name: 'Check answer' }).isVisible().catch(() => false) || await choice(page, 'A').isVisible().catch(() => false)) await answerCurrent(s, i % 3 !== 1).catch(() => {});
    const next = dialog(page).getByRole('button', { name: /^(Next question|See results|Finish)/ }).first();
    if (await next.isVisible().catch(() => false)) { await next.click(); await page.waitForTimeout(300); }
  }
  throw new Error('Session never completed');
}
const scrollPane = (page, pane, top) => page.evaluate(([p, t]) => { const el = document.querySelector(`[data-pane="${p}"]`); el.scrollTo({ top: t < 0 ? el.scrollHeight : t }); }, [pane, top]);
const mat = (s, kind, course = 'il') => s.data.materials.find(m => m.kind === kind && m.course === course);

const live = [];
/** open() with the current width/theme/clock; sessions are tracked so their console errors are logged. */
const O = async o => { const s = await open({ width: W, height: W >= 1000 ? 900 : 844, dark: T === 'dark', now: NOW, ...o }); s.page.setDefaultTimeout(8000); live.push(s); return s; };

// ---------- scenes ----------
const SCENES = {
  async nextExam() {
    for (const [now, name] of [['2026-12-01', 'exam-eve'], ['2026-12-02', 'exam-morning'], ['2026-12-10', 'finals-done']]) {
      const s = await O({ now });
      await step(name, async () => { await snap(s, name, 'Study for ' + now, 'Open with now: ' + now, { full: true }); }, s);
      if (name === 'exam-eve') await step('course-sheet', async () => { await tap(s.page, 'International Law tomorrow'); await snap(s, 'course-sheet', 'Course sheet: printed-note essay, actions, weak units and coverage.', 'Exam eve > course title'); }, s);
      if (name === 'exam-morning') await step('warm-up', async () => { await tap(s.page, 'Warm up · 10 min'); await snap(s, 'warm-up', 'Weakest rules in Read mode, with no grading.', 'Exam morning > Warm up'); }, s);
      await s.close();
    }
    const s = await O({ emptyState: true });
    await step('streak-sheet', async () => { await s.page.getByRole('button', { name: /day streak/ }).click(); await snap(s, 'streak-sheet', 'Fourteen days, current streak and best streak.', 'Study > streak'); await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(400); }, s);
    await step('goal-celebration', async () => {
      await tap(s.page, 'Start studying');
      const goal = Number(await dialog(s.page).getByRole('progressbar', { name: 'Today’s goal' }).getAttribute('aria-valuemax'));
      for (let i = 0; i < goal; i++) {
        if (await isCard(s.page)) { await tap(s.page, 'Reveal answer'); await tap(s.page, 'Got it'); }
        else { await answerCurrent(s, true); if (i + 1 < goal) await tap(s.page, 'Next question'); }
      }
      await snap(s, 'goal-celebration', 'Daily goal reached inside a practice session.', 'Practice > reach today’s goal');
    }, s);
    await step('session-recap', async () => { await s.page.waitForTimeout(2100); await tap(s.page, 'Close', { exact: true }); await s.page.getByRole('dialog', { name: 'Session recap', exact: true }).waitFor(); await snap(s, 'session-recap', 'Session recap: answers, right, units moved and next review.', 'Practice > at least three answers > Close'); }, s);
    await s.close();
  },
  async study() {
    const s = await O({});
    const P = s.page;
    await step('study-top', async () => { await snap(s, 'study-top', 'Study tab: greeting, goal ring, streak, Start studying, queues, essays.', 'Open the app on #/study'); }, s);
    await step('study-full', async () => { await snap(s, 'study-full', 'Study tab, everything: Finals tiles, practice tools list, Latest update card, To do.', 'Study tab, full height', { full: true }); }, s);
    await step('study-scrolled', async () => { await scrollPane(P, 'study', -1); await P.waitForTimeout(300); await snap(s, 'study-scrolled', 'Study tab scrolled to the bottom (compact nav bar title).', 'Study tab > scroll down'); await scrollPane(P, 'study', 0); }, s);
    await step('how-it-works', async () => { await tap(P, 'How today’s plan is built'); await snap(s, 'how-it-works', 'How Lawstin works bottom sheet.', 'Study > goal ring row (How today’s plan is built)', { full: true }); await tap(P, 'Close'); await reload(s); }, s);
    const targets = [
      ['row-due', 'First screen of a review-due session (Ready to review).', 'Study > Ready to review', /Review \d+ due items/],
      ['row-new', 'First screen of a new-items session (Not seen yet).', 'Study > Not seen yet', /Study \d+ new items/],
      ['row-missed-lesson', 'Missed topics lesson, first step.', 'Study > Missed topics', /Review \d+ missed topics/],
    ];
    for (const [name, desc, how, label] of targets) await step(name, async () => { await tap(P, label); await P.waitForTimeout(400); await snap(s, name, desc, how); await reload(s); }, s);
    await step('finals-tile', async () => { await P.locator('section').filter({ has: P.getByRole('heading', { name: 'Finals' }) }).getByRole('button').first().click(); await P.waitForTimeout(500); await snap(s, 'finals-tile', 'Course sheet with format-specific actions and coverage.', 'Study > Finals > first course tile'); await reload(s); }, s);
    await step('exam-setup', async () => { await tap(P, 'Practice exam'); await snap(s, 'exam-setup', 'Practice exam setup sheet (course, length, timing).', 'Study > Practice exam', { full: true }); await reload(s); }, s);
    await step('row-flashcards', async () => { await tap(P, 'Flashcards'); await P.waitForTimeout(700); await snap(s, 'row-flashcards', 'Flashcard session started from the Study tab.', 'Study > Flashcards'); await reload(s); }, s);
    await step('row-written', async () => { await tap(P, 'Written practice'); await snap(s, 'row-written', 'Written practice (setup and essay history).', 'Study > Written practice', { full: true }); await reload(s); }, s);
    await step('row-match', async () => { await tap(P, 'Match', { exact: true }); await P.waitForTimeout(400); await snap(s, 'row-match', 'Match game board.', 'Study > Match'); await reload(s); }, s);
    await step('row-starred', async () => { await tap(P, 'Starred'); await P.waitForTimeout(400); await snap(s, 'row-starred', 'Practice session from starred questions.', 'Study > Starred'); await reload(s); }, s);
    await step('update-study', async () => { await tap(P, 'Study', { exact: true }); await P.waitForTimeout(400); await snap(s, 'update-study', 'Session of the latest update’s unseen questions.', 'Study > Latest update card > Study'); await reload(s); }, s);
    await step('todo-course', async () => { await P.getByText('Draft client intake memo').first().click(); await P.waitForTimeout(700); await P.locator('[data-pane="courses"]').waitFor(); await snap(s, 'todo-course', 'Clinic workspace reached from a To do row.', 'Study > To do > task row'); await reload(s); }, s);
    await step('essay-button', async () => { await tap(P, /Intl Law essay/); await P.waitForTimeout(400); await snap(s, 'essay-button', 'Written practice opened for one course from the Study tab essay button.', 'Study > Intl Law essay', { full: true }); }, s);
    await s.close(); return s;
  },

  async quiz() {
    const s = await O({ hash: '#/q/' + 'il-03', prefs: { recall: true, plan: true } });
    const P = s.page;
    await step('quiz-recall', async () => { await dialog(P).waitFor(); await snap(s, 'quiz-recall', 'Practice question, answer-before-choices mode (recall on).', 'Open #/q/il-03 with the Answer before choices setting on'); }, s);
    await s.close();
    const t = await O({ hash: '#/q/il-03' });
    const Q = t.page;
    await step('quiz-question', async () => { await dialog(Q).waitFor(); await snap(t, 'quiz-question', 'Practice question with the four choices, none selected.', 'Open #/q/il-03 (notification deep link)', { full: true }); }, t);
    await step('quiz-selected', async () => { const q = await which(t); await choice(Q, 'ABCD'.replace(q.answer, '')[0]).click(); await Q.waitForTimeout(250); await snap(t, 'quiz-selected', 'Practice question with a choice selected, Check answer enabled.', 'Quiz > tap a choice'); }, t);
    await step('quiz-review-wrong', async () => { await tap(Q, 'Check answer'); await dialog(Q).getByRole('heading', { name: 'Not quite' }).waitFor(); await snap(t, 'quiz-review-wrong', 'Review after a wrong answer: verdict, per-choice explanations, rule, next review.', 'Quiz > Check answer (wrong choice)', { full: true }); }, t);
    await step('quiz-review-facts', async () => { await dialog(Q).locator('summary').first().click(); await Q.waitForTimeout(300); await snap(t, 'quiz-review-facts', 'Review with the Fact pattern expanded.', 'Quiz review > Fact pattern', { full: true }); await dialog(Q).locator('summary').first().click(); }, t);
    await step('ask-panel', async () => { await tap(Q, 'Ask about this'); await snap(t, 'ask-panel', 'Ask panel with starter questions.', 'Quiz review > Ask about this'); }, t);
    await step('ask-reply', async () => { await tap(Q, /^Explain the rule in plain terms/); await Q.getByText(/Mock tutor reply/).waitFor(); await snap(t, 'ask-reply', 'Ask panel after a tutor reply.', 'Ask panel > Explain the rule in plain terms'); await Q.keyboard.press('Escape'); await Q.waitForTimeout(500); }, t);
    await step('flag-sheet', async () => { await dialog(Q).getByRole('button', { name: /^Flag/ }).first().click(); await Q.waitForTimeout(400); await snap(t, 'flag-sheet', 'Flag-for-next-update note field.', 'Quiz review > Flag'); await Q.keyboard.press('Escape'); await Q.waitForTimeout(300); }, t);
    await step('quiz-review-right', async () => { const b = dialog(Q).getByRole('button', { name: 'Next question' }); await b.click(); await Q.waitForTimeout(400); while (await isCard(Q)) { await tap(Q, 'Reveal answer'); await tap(Q, 'Got it'); } await answerCurrent(t, true); await snap(t, 'quiz-review-right', 'Review after a correct answer.', 'Quiz > Next question > correct choice > Check answer', { full: true }); }, t);
    await step('quiz-harder', async () => { await tap(Q, /Harder|Make it harder/); await Q.waitForTimeout(600); await snap(t, 'quiz-harder', 'AI-written harder version of the question.', 'Quiz review > Harder'); }, t);
    await t.close();
    const u = await O({});
    await step('session-complete', async () => { await tap(u.page, 'Starred'); await dialog(u.page).waitFor(); await finish(u); await snap(u, 'session-complete', 'Session complete results (starred session).', 'Study > Starred > answer every question', { full: true }); }, u);
    await u.close();
  },

  async exam() {
    const s = await O({});
    const P = s.page;
    await step('exam-question', async () => {
      await tap(P, 'Practice exam');
      await tap(P, /^10$/); await tap(P, 'Untimed');
      await tap(P, /Start 10-question exam/); await dialog(P).waitFor(); await P.waitForTimeout(400);
      await snap(s, 'exam-question', 'Practice exam question (progress dashes, no feedback).', 'Study > Practice exam > Pro Res, 10 questions > Start', { full: true });
    }, s);
    await step('exam-results', async () => { await finish(s); await snap(s, 'exam-results', 'Practice exam results.', 'Practice exam > answer all 10', { full: true }); }, s);
    await s.close();
  },

  async lesson() {
    const s = await O({});
    const P = s.page;
    await step('lesson-rule', async () => { await tap(P, /Review \d+ missed topics/); await P.getByRole('heading', { name: 'The rule' }).waitFor(); await snap(s, 'lesson-rule', 'Missed lesson, step 1: the rule.', 'Study > Missed topics', { full: true }); }, s);
    await step('lesson-slipped', async () => { await tap(P, 'Next', { exact: true }); await P.getByRole('heading', { name: /Where you slipped/ }).waitFor(); await snap(s, 'lesson-slipped', 'Missed lesson, step 2: where you slipped.', 'Lesson > Next', { full: true }); }, s);
    await step('lesson-check', async () => { for (let i = 0; i < 6 && !(await P.getByRole('heading', { name: 'Check yourself' }).isVisible()); i++) await tap(P, 'Next', { exact: true }); await snap(s, 'lesson-check', 'Missed lesson, check-yourself question.', 'Lesson > Next', { full: true }); }, s);
    await step('lesson-correct', async () => { const q = await which(s).catch(() => null); const L = q?.answer ?? 'A'; await P.getByRole('button', { name: new RegExp(`^${L} `) }).first().click(); await tap(P, 'Check answer'); await P.waitForTimeout(400); await snap(s, 'lesson-correct', 'Missed lesson after a correct check.', 'Lesson > right choice > Check answer', { full: true }); }, s);
    await step('lesson-complete', async () => {
      for (let i = 0; i < 40 && !(await P.getByRole('heading', { name: /Topics reviewed|Lesson complete/ }).isVisible()); i++) { // several topics: walk them all
        if (await P.getByRole('button', { name: 'Check answer' }).isVisible()) { const q = await which(s).catch(() => null); await P.getByRole('button', { name: new RegExp(`^${q?.answer ?? 'A'} `) }).first().click(); await tap(P, 'Check answer'); }
        await tap(P, 'Next', { exact: true });
      }
      await P.getByRole('heading', { name: /Topics reviewed|Lesson complete/ }).waitFor(); await snap(s, 'lesson-complete', 'Lesson complete.', 'Lesson > Next', { full: true }); }, s);
    await s.close();
  },

  async cards() {
    const s = await O({});
    const P = s.page;
    await step('flashcard-front', async () => { await tap(P, 'Flashcards'); await P.getByRole('button', { name: 'Reveal answer' }).waitFor(); await snap(s, 'flashcard-front', 'Flashcard front (prompt).', 'Study > Flashcards', { full: true }); }, s);
    await step('flashcard-back', async () => { await tap(P, 'Reveal answer'); await snap(s, 'flashcard-back', 'Flashcard back with grading buttons.', 'Flashcard > Reveal answer', { full: true }); }, s);
    await step('flashcards-done', async () => { for (let i = 0; i < 40 && !(await P.getByRole('heading', { name: /complete/i }).isVisible()); i++) { if (await P.getByRole('button', { name: 'Reveal answer' }).isVisible()) await tap(P, 'Reveal answer'); await P.getByRole('button', { name: /^Got it|^Review tomorrow/ }).first().click().catch(() => {}); await P.waitForTimeout(200); } await snap(s, 'flashcards-done', 'Flashcard session complete.', 'Flashcards > grade every card', { full: true }); }, s);
    await s.close();
  },

  async written() {
    const s = await O({});
    const P = s.page;
    await step('written-setup', async () => { await tap(P, 'Written practice'); await P.getByRole('heading', { name: 'Written practice' }).waitFor(); await snap(s, 'written-setup', 'Written practice setup with essay history.', 'Study > Written practice', { full: true }); }, s);
    await step('written-prompt', async () => { await dialog(P).getByRole('button', { name: 'Intl Law', exact: true }).click(); await dialog(P).getByRole('button', { name: 'Write an essay' }).click(); await P.getByRole('button', { name: 'Grade my answer' }).waitFor(); await snap(s, 'written-prompt', 'Written practice: fact pattern, empty answer.', 'Written practice > Intl Law > Write an essay', { full: true }); }, s);
    await step('written-typed', async () => { await dialog(P).locator('textarea').fill('The first issue is whether the threshold element is met. The rule looks to the facts at the time of the act. Applying it here, the prosecutor knew of the evidence before trial, so the disclosure duty was triggered. The second issue is timing: a disclosure made after the plea is not timely. Therefore the duty was breached.'); await P.waitForTimeout(300); await snap(s, 'written-typed', 'Written practice with an answer typed in.', 'Written practice > type an answer', { full: true }); }, s);
    await step('written-rules', async () => { await tap(P, 'Rules'); await P.getByRole('searchbox', { name: 'Search rules' }).waitFor(); await snap(s, 'written-rules', 'Rules beside the essay, filtered to its topic.', 'Essay > Rules', { full: true }); await tap(P, 'Close rules'); }, s);
    await step('written-graded', async () => { await tap(P, 'Grade my answer'); await P.getByText(/Mock grader output/).first().waitFor({ state: 'attached' }).catch(() => {}); await P.waitForTimeout(500); await snap(s, 'written-graded', 'Graded essay: score, rubric, spotted and missed issues.', 'Written practice > Grade my answer', { full: true }); }, s);
    await step('written-rewrite', async () => { await tap(P, 'Write it again'); await dialog(P).getByPlaceholder('Your answer').fill('A fresh attempt applying the rules to these facts.'); await tap(P, 'Grade my answer'); await P.getByRole('heading', { name: 'Your attempts' }).waitFor(); await snap(s, 'written-rewrite', 'Two essay attempts, scores and rubric changes.', 'Graded essay > Write it again > Grade', { full: true }); }, s);
    await step('written-history', async () => { await tap(P, 'Essays'); await P.getByRole('heading', { name: 'Your essays' }).waitFor(); await snap(s, 'written-history', 'Essay history list.', 'Graded result > Essays', { full: true }); }, s);
    await step('written-trend', async () => { await snap(s, 'written-trend', 'Course scores over time and average rubric bars.', 'Written practice > essay history', { full: true }); }, s);
    await step('written-essay', async () => { await dialog(P).getByRole('button', { name: /^Essay / }).first().click(); await P.waitForTimeout(400); await snap(s, 'written-essay', 'A saved graded essay reopened.', 'Essay history > an essay', { full: true }); }, s);
    await s.close();
  },

  async spot() {
    const s = await O({}); const P = s.page;
    await tap(P, 'Written practice'); await tap(P, 'Spot the issues · 3 min');
    await P.getByRole('textbox', { name: 'Your issues' }).fill('Classification of the conflict\nProtection of civilians');
    await step('spot-prompt', async () => { await snap(s, 'spot-prompt', 'Verified facts with an optional issue list.', 'Written practice > Spot the issues', { full: true }); }, s);
    await step('spot-rules', async () => { await tap(P, 'Rules'); await P.getByRole('searchbox', { name: 'Search rules' }).waitFor(); await snap(s, 'spot-rules', 'Rules while spotting issues.', 'Spot the issues > Rules', { full: true }); await tap(P, 'Close rules'); }, s);
    await tap(P, 'Show the issues');
    const n = await dialog(P).getByRole('button', { name: 'Got it', exact: true }).count();
    for (let i = 0; i < n; i++) await dialog(P).getByRole('button', { name: i ? 'Got it' : 'Missed it', exact: true }).nth(i).click();
    await dialog(P).locator('summary').nth(1).click();
    await step('spot-reveal', async () => { await snap(s, 'spot-reveal', 'Checked issue cards with analysis and self-marking.', 'Spot the issues > Show the issues', { full: true }); }, s);
    await tap(P, 'See result');
    await step('spot-result', async () => { await snap(s, 'spot-result', 'Issue score, missed issues first, next pattern and writing actions.', 'Spot the issues > See result', { full: true }); }, s);
    await s.close();
  },

  async match() {
    const s = await O({});
    const P = s.page, D = () => dialog(P), board = () => D().getByRole('group', { name: /Match each/ });
    await step('match-board', async () => { await tap(P, 'Match', { exact: true }); await D().getByRole('group', { name: /Match each rule/ }).waitFor(); await snap(s, 'match-board', 'Match game board: names on the left, rules on the right.', 'Study > Match', { full: true }); }, s);
    const solve = async n => {
      const left = board().locator('> div').nth(0).locator('button'), right = board().locator('> div').nth(1).locator('button');
      for (let i = 0; i < n; i++) {
        const label = (await left.nth(i).innerText()).trim(), q = qs(s).find(q => q.authority === label);
        if (!q) throw new Error('No pair for ' + label);
        await left.nth(i).click();
        await right.filter({ hasText: q.rule.slice(0, 40) }).first().click();
        if (i === 0 && n > 1) { /* first pair matched */ }
        await P.waitForTimeout(150);
      }
    };
    await step('match-picked', async () => { const left = board().locator('> div').nth(0).locator('button'); await left.nth(1).click(); await P.waitForTimeout(250); await snap(s, 'match-picked', 'Match game with one name selected.', 'Match > tap a name'); await left.nth(1).click(); }, s);
    await step('match-result', async () => { await solve(4); await D().getByRole('button', { name: 'Next round' }).waitFor(); await snap(s, 'match-result', 'Match round result.', 'Match > pair everything', { full: true }); }, s);
    await s.close();
  },

  async courses() {
    const s = await O({ hash: '#/courses' });
    const P = s.page;
    await step('courses-home', async () => { await snap(s, 'courses-home', 'Courses directory: five course cards and the study-tool tiles.', 'Courses tab', { full: true }); }, s);
    await step('courses-tool', async () => { await tap(P, /^Comparisons/); await P.waitForTimeout(400); await snap(s, 'courses-tool', 'Courses directory with a study tool (Comparisons) expanded.', 'Courses > Comparisons tile', { full: true }); await tap(P, /^Comparisons/); }, s);
    for (const c of ['il', 'asy', 'pr']) await step('course-' + c, async () => { await s.goto(`#/courses/${c}`); await P.waitForTimeout(500); await snap(s, 'course-' + c, `Course page for ${c.toUpperCase()}: actions, tool sidebar, next to review, materials.`, `Courses > ${c} card`, { full: true }); }, s);
    await step('course-next', async () => { await s.goto('#/courses/il'); await tap(P, /^Next to review/); await snap(s, 'course-next', 'Course page with the Next to review plan expanded.', 'Course page > Next to review', { full: true }); }, s);
    await step('course-kind', async () => { await tap(P, /^Comparisons/, { exact: false }); await P.waitForTimeout(300); await snap(s, 'course-kind', 'Course page filtered to one material kind (Comparisons).', 'Course page > Comparisons filter chip / sidebar', { full: true }); }, s);
    for (const kind of ['flowchart', 'outline', 'comparison', 'drill', 'hypothetical']) await step('reader-' + kind, async () => {
      const m = mat(s, kind); await s.goto(`#/courses/il/${kind}/${m.id}`); await P.getByRole('dialog').first().waitFor(); await P.waitForTimeout(500);
      await snap(s, 'reader-' + kind, `${kind} material open in the reader.`, `Course page > ${kind} card (route #/courses/il/${kind}/<id>)`, { full: true });
      if (kind === 'drill') { await dialog(P).locator('section button').first().click().catch(() => {}); await P.waitForTimeout(300); await snap(s, 'reader-drill-answered', 'Sorting drill after answering an item.', 'Drill reader > pick a category', { full: true }); }
    }, s);
    await step('rulebook-read', async () => { await s.goto('#/courses/il/rules'); await P.getByRole('dialog').first().waitFor(); await P.waitForTimeout(400); await snap(s, 'rulebook-read', 'Rulebook, Read mode.', 'Course page > Rulebook', { full: true }); }, s);
    await step('rulebook-recall', async () => { await tap(P, 'Recall'); await dialog(P).locator('button[aria-expanded]').first().click(); await P.waitForTimeout(300); await snap(s, 'rulebook-recall', 'Rulebook, Recall mode with one rule revealed.', 'Rulebook > Recall > tap a rule', { full: true }); }, s);
    await step('workspace-clinic', async () => { await s.goto('#/courses/clinic'); await P.waitForTimeout(700); await snap(s, 'workspace-clinic', 'Clinic workspace: hours card, tasks, notes, links.', 'Courses > Civil Clinic', { full: true }); }, s);
    await step('workspace-clinic-task', async () => { await P.locator('[data-pane="courses"]').getByText('Draft client intake memo').first().click(); await P.waitForTimeout(400); await snap(s, 'workspace-clinic-task', 'Clinic workspace with a task expanded for editing.', 'Clinic > tap a task', { full: true }); }, s);
    await step('workspace-tutoring', async () => { await s.goto('#/courses/tutoring'); await P.waitForTimeout(700); await snap(s, 'workspace-tutoring', 'Civil Procedure Tutoring workspace.', 'Courses > Civil Procedure Tutoring', { full: true }); }, s);
    await s.close();
  },

  async progress() {
    const s = await O({ hash: '#/progress' });
    const P = s.page;
    await step('progress-top', async () => { await snap(s, 'progress-top', 'Progress tab: totals, which wrong answers catch you, coverage by course.', 'Progress tab'); }, s);
    await step('progress-full', async () => { await snap(s, 'progress-full', 'Progress tab, full height.', 'Progress tab, full height', { full: true }); }, s);
    await step('progress-expanded', async () => { const heads = P.locator('[data-pane="progress"] button[aria-expanded="false"]'); for (let i = await heads.count(); i > 0; i--) await heads.first().click(); await P.waitForTimeout(400); await snap(s, 'progress-expanded', 'Progress tab with every course coverage card expanded.', 'Progress > each course header', { full: true }); }, s);
    await step('topic-sheet', async () => { await P.locator('[data-pane="progress"] button').filter({ hasText: /\d+ of \d+ seen/ }).first().click(); await P.waitForTimeout(500); await snap(s, 'topic-sheet', 'Topic sheet: rules, study tools, Drill this topic.', 'Progress > a topic row', { full: true }); await P.keyboard.press('Escape'); await P.waitForTimeout(500); }, s);
    await step('progress-how', async () => { await tap(P, 'How this works'); await snap(s, 'progress-how', 'How this works sheet (status definitions).', 'Progress > How this works', { full: true }); }, s);
    await s.close();
  },

  async activity() {
    const s = await O({ hash: '#/activity' });
    const P = s.page;
    await step('activity-top', async () => { await snap(s, 'activity-top', 'Activity tab: missed topics, study calendar, last 14 days, Updates.', 'Activity tab'); }, s);
    await step('activity-full', async () => { await snap(s, 'activity-full', 'Activity tab, full height.', 'Activity tab, full height', { full: true }); }, s);
    await step('activity-day', async () => { await P.locator('[data-pane="activity"] button[aria-label*="answered"]').filter({ hasText: /\d/ }).nth(20).click(); await P.waitForTimeout(250); await snap(s, 'activity-day', 'Study calendar with another day selected.', 'Activity > a calendar day'); }, s);
    await step('activity-updates', async () => { await P.getByRole('button', { name: /earlier/ }).first().click(); await P.waitForTimeout(700); await snap(s, 'activity-updates', 'Updates feed expanded: question updates and study-material updates.', 'Activity > N earlier', { full: true }); }, s);
    await s.close();
  },

  async settings() {
    const s = await O({ hash: '#/settings' });
    const P = s.page;
    await step('settings-top', async () => { await P.getByRole('heading', { name: 'Settings' }).waitFor(); await P.waitForTimeout(400); await snap(s, 'settings-top', 'Settings page.', 'Avatar > Settings (#/settings)'); }, s);
    await step('settings-scrolled', async () => { await snap(s, 'settings-scrolled', 'Settings page, full height (appearance, notifications, weekly email, connections, data).', 'Settings, full height', { full: true }); }, s);
    await step('connected-apps', async () => { await tap(P, 'Connected apps'); await P.getByRole('heading', { name: 'Connected apps' }).waitFor(); await P.waitForTimeout(500); await snap(s, 'connected-apps', 'Connected apps: Chat quizzes and Drive course handoffs setup.', 'Settings > Connected apps (#/connect)', { full: true }); }, s);
    await s.close();
  },

  async states() {
    await step('sign-in', async () => { const s = await O({ auth: false }); await s.page.getByRole('heading', { name: /Welcome back/ }).waitFor(); await snap(s, 'sign-in', 'Sign-in screen (no session).', 'Open the app signed out'); await s.close(); });
    await step('offline-fresh', async () => { const s = await O({ backendDown: true, wait: false }); await s.page.getByText('You’re offline').first().waitFor({ timeout: 25000 }); await snap(s, 'offline-fresh', 'Offline on a device with no cached data: “You’re offline” card.', 'Open the app with the backend unreachable and no cache'); await s.close(); });
    await step('offline-answer', async () => {
      const s = await O({ hash: '#/q/il-03' });
      await dialog(s.page).waitFor(); await s.setOffline(true); await answerCurrent(s, true); await s.page.waitForTimeout(500);
      await snap(s, 'offline-answer', 'Answering offline: “Offline. Answers will sync…” toast, answer queued.', 'Go offline > answer a question'); await s.close();
    });
    await step('empty-study', async () => { const s = await O({ emptyState: true }); await snap(s, 'empty-study', 'Study tab of a brand-new account (no progress, no days), full height.', 'Open with emptyState', { full: true }); await s.goto('#/progress'); await snap(s, 'empty-progress', 'Progress tab of a new account.', 'New account > Progress', { full: true }); await s.goto('#/activity'); await snap(s, 'empty-activity', 'Activity tab of a new account.', 'New account > Activity', { full: true }); await s.close(); });
    await step('night-before-study', async () => { const s = await O({ nightBefore: true }); await snap(s, 'night-before-study', 'Study tab the night before the first final (fake date 2026-12-01).', 'Open with nightBefore'); await snap(s, 'night-before-finals', 'Night-before Study tab, full height: Finals tiles with “1 day”.', 'Open with nightBefore, full height', { full: true }); await s.close(); });
  },
};

console.log(`Capturing to ${OUT}  widths=${WIDTHS} themes=${THEMES}`);
for (const w of WIDTHS) for (const t of THEMES) {
  W = w; T = t; ctxTag = `${w}-${t}`;
  for (const [name, scene] of Object.entries(SCENES)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    console.log(`${ctxTag} ${name}`);
    const before = log.length;
    try { const r = await scene(); void r; } catch (e) { log.push({ step: `scene:${name}`, width: W, theme: T, status: 'failed', error: String(e.message).split('\n')[0] }); console.log(`  SCENE FAILED ${name}: ${e.message.split('\n')[0]}`); }
    for (const s of live.splice(0)) {
      for (const e of new Set(s.errors)) log.push({ step: `console:${name}`, width: W, theme: T, status: 'console-error', error: e.slice(0, 300) });
      await s.close().catch(() => {});
    }
    void before;
  }
}
// de-duplicate files written twice (same screen name) and write the reports
const seen = new Map(); for (const e of index) seen.set(e.file, e);
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify([...seen.values()].sort((a, b) => a.file.localeCompare(b.file)), null, 1));
fs.writeFileSync(path.join(OUT, 'capture-log.json'), JSON.stringify(log, null, 1));
const failed = log.filter(l => l.status === 'failed');
console.log(`Done: ${seen.size} screenshots, ${log.length - failed.length} steps ok, ${failed.length} failed`);
for (const f of failed) console.log(`  FAILED ${f.step} @${f.width}/${f.theme}: ${f.error}`);
await closeAll();
