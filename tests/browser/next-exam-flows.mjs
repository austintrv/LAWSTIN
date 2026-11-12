import assert from 'node:assert/strict';
import fs from 'node:fs';
import { open, richState, closeAll } from './mock.mjs';
const out = process.env.LAWSTIN_ARTIFACTS_DIR ?? 'artifacts/next-exam';
fs.mkdirSync(out, { recursive: true });
const dialog = p => p.getByRole('dialog').last();
const close = async p => { await dialog(p).getByRole('button', { name: 'Close', exact: true }).click(); await p.getByRole('dialog').waitFor({ state: 'hidden' }); };
async function answer(s, next = true) {
  const p = s.page, d = dialog(p);
  if (await d.getByRole('button', { name: 'Reveal answer', exact: true }).isVisible()) {
    await d.getByRole('button', { name: 'Reveal answer', exact: true }).click();
    await d.getByRole('button', { name: 'Got it', exact: true }).click();
  } else {
    const text = await d.innerText(), q = s.data.state.questions.find(q => text.includes(q.stem));
    assert(q, 'Visible question matches the bank');
    if (await d.getByRole('button', { name: 'Show choices', exact: true }).isVisible()) await d.getByRole('button', { name: 'Show choices', exact: true }).click();
    await d.getByRole('button', { name: new RegExp(`^${q.answer} `) }).click();
    await d.getByRole('button', { name: 'Check answer', exact: true }).click();
    await d.getByRole('heading', { name: 'Correct', exact: true }).waitFor();
    if (next) await d.getByRole('button', { name: 'Next question', exact: true }).click();
  }
  await p.waitForTimeout(240);
}
async function noOverflow(s) {
  assert.equal(await s.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(s.errors, []);
}
export async function nextExamFlows() {
  try {
    for (const [width, height] of [[390,844],[820,1180],[1440,900]]) for (const dark of [false,true]) {
      const tag = `${width}-${dark ? 'dark' : 'light'}`;
      const eve = await open({ width, height, dark, now: '2026-12-01' });
      await eve.page.getByRole('button', { name: 'International Law tomorrow', exact: true }).waitFor();
      await eve.page.screenshot({ path: `${out}/eve-${tag}.png` });
      await eve.page.getByRole('button', { name: 'International Law tomorrow', exact: true }).click();
      await dialog(eve.page).getByText('Printed notes', { exact: true }).waitFor();
      await dialog(eve.page).getByRole('button', { name: 'Write an essay 45 min', exact: true }).waitFor();
      assert.equal(await dialog(eve.page).getByRole('button', { name: /Timed set/ }).count(), 0);
      await eve.page.screenshot({ path: `${out}/course-${tag}.png` });
      await eve.page.keyboard.press('Tab');
      assert(await eve.page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
      await close(eve.page); await noOverflow(eve); await eve.close();
      const morning = await open({ width, height, dark, now: '2026-12-02' });
      await morning.page.getByRole('button', { name: 'International Law today', exact: true }).waitFor();
      assert.equal(await morning.page.getByRole('progressbar', { name: 'Today’s goal' }).count(), 0);
      assert.equal(await morning.page.getByText(/to go/).count(), 0);
      await morning.page.screenshot({ path: `${out}/morning-${tag}.png` });
      await morning.setOffline(true);
      await morning.page.getByRole('button', { name: 'Warm up · 10 min', exact: true }).click();
      assert.equal(await dialog(morning.page).getByRole('group', { name: 'Rulebook mode' }).count(), 0);
      assert((await dialog(morning.page).locator('p').count()) > 0 && (await dialog(morning.page).locator('p').count()) <= 10);
      await morning.page.screenshot({ path: `${out}/warmup-${tag}.png` });
      await morning.page.keyboard.press('Escape'); await morning.page.getByRole('dialog').waitFor({state:'hidden'});
      assert.equal(morning.answers.length, 0); await noOverflow(morning); await morning.close();
      const done = await open({ width, height, dark, now: '2026-12-10' });
      await done.page.getByRole('heading', { name: 'Fall finals done', exact: true }).waitFor();
      assert.equal(await done.page.getByRole('progressbar', { name: 'Today’s goal' }).count(), 0);
      assert.equal(await done.page.getByText(/to go/).count(), 0);
      await done.page.screenshot({ path: `${out}/done-${tag}.png` });
      await done.page.getByRole('button', { name: 'How Lawstin works', exact: true }).click();
      await dialog(done.page).getByRole('heading', {name:'Fall finals done',exact:true}).waitFor(); await close(done.page);
      await noOverflow(done); await done.close();
    }
    console.log('PASS: exam eve, course sheet, morning warm-up, finals done at 390/820/1440 light and dark; keyboard and offline reading');

    const tiles = await open({now:'2026-11-11'});
    await tiles.page.locator('section').filter({has:tiles.page.getByRole('heading',{name:'Finals',exact:true})}).getByRole('button').nth(1).click();
    await dialog(tiles.page).getByText('Open book',{exact:true}).waitFor();
    await dialog(tiles.page).getByRole('button',{name:'Write an essay 15 min',exact:true}).waitFor();
    await dialog(tiles.page).getByRole('button',{name:/^Review \d+$/}).click();
    await tiles.page.getByRole('dialog',{name:'Practice',exact:true}).waitFor();
    const tileText = await dialog(tiles.page).innerText();
    const tileQ = tiles.data.state.questions.find(q=>tileText.includes(q.stem));
    assert.equal(tileQ?.course,'asy');
    await close(tiles.page); await noOverflow(tiles); await tiles.close();
    console.log('PASS: Finals tile opens the Asylum sheet with Open book, a 15-minute essay and course-only reviews');

    const pr = await open({ now: '2026-12-08' });
    await pr.page.getByRole('button', {name:'Professional Responsibility tomorrow',exact:true}).click();
    await dialog(pr.page).getByText('Closed book',{exact:true}).waitFor();
    await dialog(pr.page).getByRole('button',{name:'Timed set 25 questions',exact:true}).click();
    await dialog(pr.page).getByRole('button',{name:'Start 25-question exam',exact:true}).waitFor();
    assert.equal(await dialog(pr.page).getByRole('button',{name:'Pro Res',exact:true}).getAttribute('aria-pressed'),'true');
    await close(pr.page);
    await pr.page.getByRole('button',{name:'Rule recall',exact:true}).click();
    assert.equal(await dialog(pr.page).getByRole('button',{name:'Recall',exact:true}).getAttribute('aria-pressed'),'true');
    await close(pr.page); await noOverflow(pr); await pr.close();
    console.log('PASS: Pro Res sheet presets 25 timed questions and Rule recall opens Recall');

    const data = richState({now:'2026-11-11'});
    data.state.questions = data.state.questions.filter(q=>q.course==='il').slice(0,5);
    data.state.progress = []; data.state.days = []; data.materials = []; data.rows = data.rows.filter(r=>!r.key.startsWith('study:v1:')&&!r.key.startsWith('written:v1:'));
    const session = await open({now:'2026-11-11',state:data});
    await session.page.getByRole('button',{name:'Start studying',exact:true}).click();
    for(let i=0;i<4;i++) await answer(session);
    await answer(session,false);
    await dialog(session.page).getByRole('status').filter({hasText:'Daily goal done'}).waitFor();
    await session.page.screenshot({path:`${out}/goal-in-quiz.png`});
    await session.page.waitForTimeout(2600);
    assert.equal(await dialog(session.page).getByRole('status').filter({hasText:'Daily goal done'}).count(),0);
    assert.equal(await session.page.evaluate(()=>JSON.parse(localStorage.getItem('lawstin-cache:goal-celebrated:00000000-0000-0000-0000-000000000001'))),'2026-11-11');
    await closeToRecap(session);
    await dialog(session.page).getByRole('heading',{name:'Session complete',exact:true}).waitFor();
    await dialog(session.page).getByText('5',{exact:true}).first().waitFor();
    await session.page.screenshot({path:`${out}/recap-phone.png`});
    await session.page.keyboard.press('Tab'); assert(await session.page.evaluate(()=>!!document.activeElement?.closest('[aria-label="Session recap"]')));
    await dialog(session.page).getByRole('button',{name:'Keep going',exact:true}).click();
    await dialog(session.page).getByRole('heading',{name:'Correct',exact:true}).waitFor();
    await close(session.page);
    await session.page.getByRole('button',{name:'1 day streak',exact:true}).click();
    assert.equal(await dialog(session.page).locator('[data-studied]').count(),14);
    await close(session.page); await noOverflow(session); await session.close();
    console.log('PASS: goal celebration inside quiz, five-answer recap, Keep going, short-session dismissal and streak sheet');

    const passData = richState({now:'2026-12-01'});
    passData.state.questions = passData.state.questions.filter(q=>q.course==='il').slice(0,6);
    const first = passData.state.questions[0];
    passData.state.progress = [{ ...richState({now:'2026-12-01'}).state.progress[0], questionId:first.id, seen:2, wrong:2, correct:0, lastCorrect:false, due:'2026-12-03' }];
    passData.state.days = []; passData.materials = []; passData.rows = passData.rows.filter(r=>!r.key.startsWith('study:v1:')&&!r.key.startsWith('written:v1:'));
    const pass = await open({now:'2026-12-01',state:passData});
    await pass.page.getByRole('button',{name:'Last pass',exact:true}).click();
    await pass.setOffline(true);
    for(let i=0;i<3;i++) await answer(pass);
    await closeToRecap(pass);
    await dialog(pass.page).getByRole('button',{name:'Done',exact:true}).click();
    await pass.page.waitForTimeout(200);
    await pass.page.reload(); await pass.settle();
    await pass.page.getByRole('button',{name:'Last pass',exact:true}).click();
    await pass.setOffline(false);
    await pass.page.waitForFunction(()=>!localStorage.getItem('lawstin-answer-queue'));
    await pass.page.waitForTimeout(2100);
    for(let i=0;i<3;i++) await answer(pass);
    await dialog(pass.page).getByRole('heading',{name:'Session complete',exact:true}).waitFor();
    await dialog(pass.page).getByRole('button',{name:'Done',exact:true}).click();
    assert.equal(pass.answers.length,6); assert.equal(new Set(pass.answers.map(a=>a.questionId)).size,6);
    assert(pass.answers.every(a=>a.questionId.startsWith('il-')));
    assert.equal(await pass.page.getByRole('button',{name:'Last pass',exact:true}).isDisabled(),true);
    await pass.close();
    console.log('PASS: last pass ends, stays in one course, resumes after offline reload, and syncs six answers once');

    const tool = await open({hash:'#/progress'});
    await tool.goto('#/tool/NotBuilt/il/argument');
    await dialog(tool.page).getByRole('heading',{name:'Tool unavailable',exact:true}).waitFor();
    await tool.page.keyboard.press('Escape');
    await tool.page.waitForURL('**/#/progress');
    assert.equal(await tool.page.getByRole('button',{name:'Progress',exact:true}).getAttribute('aria-current'),'page');
    await noOverflow(tool); await tool.close();
    const deep = await open({hash:'#/tool/NotBuilt/il'});
    await close(deep.page); assert(deep.page.url().endsWith('#/study')); await noOverflow(deep); await deep.close();
    console.log('PASS: lazy tool route, unavailable-tool fallback, Escape returns to prior tab, direct-link close');
  } finally { await closeAll(); }
}
async function closeToRecap(s) {
  await s.page.waitForTimeout(2100);
  await dialog(s.page).getByRole('button',{name:'Close',exact:true}).click();
  await s.page.getByRole('dialog',{name:'Session recap',exact:true}).waitFor();
}
