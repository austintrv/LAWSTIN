import assert from 'node:assert/strict';
import fs from 'node:fs';
import { open, closeAll, richState } from './mock.mjs';

const button = (p, name) => p.getByRole('button', { name, exact: true });
const exam = p => p.getByRole('dialog', { name: 'Practice exam', exact: true });
const active = p => p.evaluate(() => JSON.parse(localStorage.getItem('lawstin-cache:exam-active')));
const shown = async s => { const x = await active(s.page); return x.questions[x.i]; };
const start = async (s, timed = false) => {
  await button(s.page, 'Practice exam').click();
  await button(s.page, '10').click();
  if (!timed) await button(s.page, 'Untimed').click();
  await button(s.page, 'Start 10-question exam').click();
  await exam(s.page).waitFor();
};
const select = async (s, right = true) => { const q = await shown(s), choice = right ? q.answer : q.choices.find(c => c.id !== q.answer).id; if ((await active(s.page)).picks[q.id] !== choice) await s.page.keyboard.press(choice); };
const storedExam = s => s.rows.filter(r => r.key.startsWith('exam:v1:')).map(r => JSON.parse(r.value)).sort((a, b) => b.at.localeCompare(a.at));
const historyButton = (p, score) => p.locator('button').filter({ has: p.locator(`[aria-label="${score} of 10 correct"]`) }).first();

export async function examFlows() {
  let count = 0;
  const sessions = [];
  const O = async options => { const s = await open({ now: '2026-11-11', ...options }); s.page.setDefaultTimeout(10000); sessions.push(s); return s; };
  const clean = s => assert.deepEqual(s.errors, []);
  try {
    const s = await O({}); const p = s.page;
    await start(s);
    const first = await shown(s);
    await select(s, false); await p.keyboard.press('ArrowRight'); await select(s);
    await button(p, 'Previous').click(); await p.getByText('Question 1 of 10', { exact: true }).waitFor();
    await p.keyboard.press(first.answer); await p.keyboard.press('f');
    await p.keyboard.press('m');
    const map = p.getByRole('dialog', { name: 'Question map', exact: true });
    await map.getByRole('button', { name: 'Question 1, answered, flagged', exact: true }).waitFor();
    await map.getByRole('button', { name: 'Question 10, unanswered', exact: true }).click();
    await p.getByText('Question 10 of 10', { exact: true }).waitFor();
    for (let i = 9; i >= 2; i--) { await p.keyboard.press('ArrowLeft'); await p.getByText(`Question ${i} of 10`, { exact: true }).waitFor(); await select(s); }
    assert.equal(s.answers.length, 0, 'no answer is recorded while it can still change');
    await button(p, 'Finish').click();
    await p.getByRole('alertdialog').getByText('1 unanswered', { exact: true }).waitFor();
    await p.getByRole('alertdialog').getByText('1 flagged', { exact: true }).waitFor();
    await button(p, 'Go back').click(); await button(p, 'Finish').click();
    await p.getByRole('alertdialog').getByRole('button', { name: 'Finish', exact: true }).click();
    await p.getByRole('heading', { name: 'Exam complete', exact: true }).waitFor();
    await p.waitForFunction(() => !localStorage.getItem('lawstin-answer-queue'));
    assert.equal(s.answers.length, 9); assert.equal(s.answers.find(a => a.questionId === first.id).choice, first.answer);
    const result = storedExam(s)[0]; assert.equal(result.score, 9); assert.equal(result.total, 10); assert.equal(result.wrong.length, 1); assert.deepEqual(result.flagged, [first.id]);
    await p.reload(); await s.settle();
    await s.goto('#/progress'); await p.getByRole('button', { name: /^Practice exams/ }).waitFor();
    await s.gotoTool('ExamHistory'); await historyButton(p, 9).click();
    await p.locator('details summary').first().click(); await p.getByText('Unanswered', { exact: true }).waitFor();
    await button(p, 'Retake the missed').click();
    assert.equal(await p.getByRole('dialog', { name: 'Practice', exact: true }).getByRole('group', { name: 'Answer choices' }).count(), 1);
    const missed = s.data.state.questions.find(q => q.id === result.wrong[0]);
    await p.keyboard.press(missed.answer); await button(p, 'Check answer').click();
    await p.getByRole('heading', { name: 'Correct', exact: true }).waitFor();
    await button(p, 'Next question').click(); await p.getByRole('heading', { name: 'Session complete', exact: true }).waitFor();
    assert.equal(s.answers.length, 10); clean(s); await s.close();
    console.log('PASS: exam navigation, changed answer, flags/map, incomplete finish, saved history after reload and exact missed retake'); count++;

    const resume = await O({}); await start(resume, true);
    const r = resume.page; await r.clock.runFor(5000); await select(resume); await r.keyboard.press('f');
    await r.keyboard.press('Escape'); await r.getByRole('alertdialog', { name: 'Leave exam?' }).waitFor();
    await button(r, 'Go back').click(); await r.goBack(); await r.getByRole('alertdialog', { name: 'Leave exam?' }).waitFor();
    await button(r, 'Leave').click(); await exam(r).waitFor({ state: 'hidden' });
    const paused = await active(r); await r.clock.runFor(60000); await r.reload(); await resume.settle();
    await button(r, 'Practice exam').click(); await button(r, 'Resume exam').click();
    await exam(r).waitFor(); const restored = await active(r);
    assert.ok(restored.seconds <= paused.seconds + 1); assert.deepEqual(restored.picks, paused.picks); assert.deepEqual(restored.flagged, paused.flagged);
    await resume.setOffline(true); await button(r, 'Finish').click(); await r.getByRole('alertdialog').getByRole('button', { name: 'Finish', exact: true }).click();
    await r.getByRole('heading', { name: 'Exam complete', exact: true }).waitFor();
    assert.equal(await r.evaluate(() => JSON.parse(localStorage.getItem('lawstin-answer-queue')).length), 1);
    assert.equal(await r.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('lawstin-cache:settings-pending'))).filter(k => k.startsWith('exam:v1:')).length), 1);
    await r.reload(); await resume.settle();
    assert.equal(await r.evaluate(() => JSON.parse(localStorage.getItem('lawstin-cache:exams')).length), 4);
    await resume.setOffline(false);
    await r.waitForFunction(() => !localStorage.getItem('lawstin-answer-queue'));
    await r.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('lawstin-cache:settings-pending') ?? '{}')).filter(k => k.startsWith('exam:v1:')).length === 0);
    assert.equal(resume.answers.length, 1); assert.equal(storedExam(resume).length, 4);
    assert.ok(resume.errors.every(e => /Failed to load resource: net::ERR_INTERNET_DISCONNECTED/.test(e)), resume.errors.join('\n'));
    await resume.close(); console.log('PASS: Escape/system Back confirmation, paused three-hour resume, offline finish/reload and one-time sync'); count++;

    const reconnect = await O({}); await start(reconnect); await select(reconnect);
    await reconnect.setOffline(true); await button(reconnect.page, 'Finish').click();
    await reconnect.page.getByRole('alertdialog').getByRole('button', { name: 'Finish', exact: true }).click();
    await reconnect.page.getByRole('heading', { name: 'Exam complete' }).waitFor(); await reconnect.setOffline(false);
    await reconnect.page.waitForFunction(() => !localStorage.getItem('lawstin-answer-queue'));
    assert.equal(reconnect.answers.length, 1, 'the app and exam share one answer-queue flush');
    assert.ok(reconnect.errors.every(e => /Failed to load resource: net::ERR_INTERNET_DISCONNECTED/.test(e)), reconnect.errors.join('\n'));
    await reconnect.close(); console.log('PASS: reconnecting on exam results drains the shared queue once across both mounted stores'); count++;

    const data = richState({ now: '2026-11-11' }), qs = data.state.questions.filter(q => q.course === 'pr').slice(0, 10);
    const timed = await O({ storage: { 'lawstin-cache:exam-active': JSON.stringify({ id: '2026-11-11T18:00:00.000Z', at: new Date('2026-11-11T18:00:00Z').getTime(), questions: qs, i: 0, picks: { [qs[0].id]: qs[0].answer }, flagged: [], seconds: 0, limit: 1, submitted: [] }) } });
    await button(timed.page, 'Practice exam').click(); await button(timed.page, 'Resume exam').click(); await timed.page.clock.runFor(1500);
    await timed.page.getByRole('heading', { name: 'Exam complete' }).waitFor();
    assert.equal(storedExam(timed)[0].score, 1); assert.equal(storedExam(timed)[0].wrong.length, 9);
    assert.equal(await timed.page.getByRole('alertdialog').count(), 0); clean(timed); await timed.close();
    console.log('PASS: clock expiry finishes automatically and scores every unanswered question as missed'); count++;

    const cc = await O({ tool: true, hash: '#/tool/CloseCalls/pr' }); const c = cc.page;
    const beforeProgress = structuredClone(cc.state.progress);
    const playRound = async () => {
      for (let i = 1; i <= 10; i++) {
        await c.getByText(`Question ${i} of 10`, { exact: true }).waitFor();
        const text = await c.getByRole('dialog').innerText(), q = cc.data.state.questions.find(q => text.includes(q.stem));
        const choices = c.getByRole('group', { name: 'Close call choices' }).getByRole('button');
        const firstText = await choices.nth(0).innerText();
        await c.keyboard.press(firstText.includes(q.choices.find(x => x.id === q.answer).text) ? '1' : 'b');
        await button(c, 'Next').waitFor(); await c.keyboard.press('Enter');
      }
      await c.getByText('10 of 10', { exact: true }).waitFor();
    };
    await cc.setOffline(true); await playRound();
    assert.equal(await c.evaluate(() => JSON.parse(localStorage.getItem('lawstin-study-queue')).length), 10);
    await cc.setOffline(false); await c.waitForFunction(() => !localStorage.getItem('lawstin-study-queue'));
    assert.equal(cc.events.length, 10); assert.equal(cc.answers.length, 0); assert.deepEqual(cc.state.progress, beforeProgress);
    await c.reload(); await cc.settle(); await playRound();
    assert.equal(cc.events.length, 10); clean(cc); await cc.close();
    console.log('PASS: ten close calls by keyboard, both explanations, no record_answer/schedule changes and no duplicate daily credit'); count++;

    const rules = await O({ tool: true, hash: '#/tool/MissedRules/pr' }); const u = rules.page;
    await button(u, 'Drill these').waitFor();
    await u.locator('details summary').first().click();
    assert.ok((await u.locator('details[open]').innerText()).includes('sample authority'));
    await button(u, 'Drill these').click(); await u.getByRole('dialog', { name: 'Practice', exact: true }).waitFor();
    const text = await u.getByRole('dialog').innerText(), q = rules.data.state.questions.find(q => text.includes(q.stem));
    assert.equal(q.course, 'pr'); assert.equal(rules.state.progress.find(p => p.questionId === q.id).lastCorrect, false);
    clean(rules); await rules.close(); console.log('PASS: missed-rule topic groups expand and Drill these starts exactly the unresolved course questions'); count++;

    const progress = await O({ hash: '#/progress' }); const g = progress.page;
    await g.getByRole('heading', { name: 'How you miss', exact: true }).waitFor();
    for (const label of ['Close call', 'Plausible', 'Way off', 'Right, but guessed']) {
      await g.locator('[data-pane="progress"]').getByRole('button', { name: new RegExp(`^${label}`) }).click();
      const sheet = g.getByRole('dialog', { name: label, exact: true }); await sheet.waitFor();
      if (label === 'Close call') await sheet.getByRole('button', { name: 'Practice close calls' }).waitFor();
      assert.ok((await sheet.innerText()).includes('Your answer') || (await sheet.innerText()).includes('No answers yet'));
      await g.keyboard.press('Escape'); await sheet.waitFor({ state: 'hidden' });
    }
    await g.locator('[data-pane="progress"]').getByRole('button', { name: /^Close call/ }).click();
    await g.getByRole('dialog').locator('button').filter({ hasText: 'Your answer' }).first().click();
    await g.getByRole('dialog', { name: 'Practice', exact: true }).waitFor();
    clean(progress); await progress.close(); console.log('PASS: all four Progress answer sheets, plain labels and opening an answered question'); count++;

    const exported = await O({ hash: '#/settings' }); const x = exported.page;
    const downloaded = x.waitForEvent('download'); await button(x, 'Export my data').click();
    const download = await downloaded, file = await download.path(); const content = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(content.study.filter(r => r.key.startsWith('exam:v1:')).length, 3);
    await x.evaluate(() => { localStorage.setItem('lawstin-cache:exam-active', '{"private":true}'); localStorage.setItem('lawstin-cache:rule-answers', '[]'); });
    await button(x, 'Sign out').click();
    await x.waitForFunction(() => !Object.keys(localStorage).some(k => k.startsWith('lawstin-cache:')));
    clean(exported); await exported.close(); console.log('PASS: data export includes exams and sign-out clears exam/history caches'); count++;

    const fits = async p => {
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('[role="dialog"] button, [role="dialog"] table')].some(el => {
        const b = el.getBoundingClientRect(); return b.width > 0 && !el.closest('[inert]') && (b.left < -1 || b.right > innerWidth + 1);
      })), false);
      await p.keyboard.press('Tab');
      assert.equal(await p.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].some(d => d.contains(document.activeElement))), true);
    };
    fs.mkdirSync('artifacts/2c-final', { recursive: true });
    for (const [width, height] of [[390, 844], [820, 1180], [1440, 900]]) for (const dark of [false, true]) {
      const view = await O({ width, height, dark, reducedMotion: width !== 1440 || dark });
      const snap = async name => { await view.page.waitForTimeout(500); await view.page.screenshot({ path: `artifacts/2c-final/${width}-${dark ? 'dark' : 'light'}-${name}.png` }); };
      await start(view); await fits(view.page);
      await snap('exam'); await view.page.keyboard.press('m'); await view.page.getByRole('dialog', { name: 'Question map' }).waitFor(); await snap('map'); await view.page.keyboard.press('Escape'); await view.page.getByRole('dialog', { name: 'Question map' }).waitFor({ state: 'hidden' });
      await view.page.keyboard.press('Escape'); await button(view.page, 'Leave').click(); await exam(view.page).waitFor({ state: 'hidden' });
      for (const name of ['ExamHistory', 'MissedRules', 'CloseCalls']) {
        await view.gotoTool(name); await view.page.getByRole('dialog').waitFor(); await fits(view.page);
        assert.equal(await view.page.evaluate(() => document.body.classList.contains('dark')), dark);
        if (name === 'ExamHistory') { await snap('history'); await historyButton(view.page, 8).click(); await fits(view.page); await snap('history-detail'); }
        if (name === 'MissedRules') { await view.page.locator('summary').first().click(); await snap('rules'); }
        if (name === 'CloseCalls') { await snap('close-calls'); await view.page.keyboard.press('1'); await button(view.page, 'Next').waitFor(); await fits(view.page); await snap('close-calls-review'); }
      }
      clean(view); await view.close();
    }
    console.log('PASS: exam/history/rules/close calls at 390×844, 820×1180, 1440×900 in both themes, focus containment and reduced motion'); count++;
    console.log(`Exam browser checks: ${count} passed`);
  } finally { for (const s of sessions) await s.close().catch(() => {}); await closeAll(); }
}
