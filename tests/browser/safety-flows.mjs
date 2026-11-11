import assert from 'node:assert/strict';
import fs from 'node:fs';
import { open, closeAll, richState } from './mock.mjs';

const out = process.env.LAWSTIN_ARTIFACTS_DIR ?? 'artifacts/browser';
const dialog = p => p.getByRole('dialog').last();
const written = p => p.getByRole('dialog', { name: 'Written practice', exact: true });
const tap = (p, name) => p.getByRole('button', { name, exact: true }).click();
const until = async fn => { for (let n = 0; n < 100; n++) { if (await fn()) return; await new Promise(r => setTimeout(r, 50)); } assert.fail('Condition did not settle'); };
async function escape(p) { await p.keyboard.press('Escape'); await p.waitForTimeout(420); }
async function focusInside(p, label, turns = 30) {
  const modal = p.getByRole('dialog', { name: label, exact: true });
  await modal.waitFor();
  for (const key of ['Tab', 'Shift+Tab']) for (let n = 0; n < turns; n++) {
    await p.keyboard.press(key);
    assert(await modal.evaluate(el => el.contains(document.activeElement)), `Focus left ${label} on ${key}`);
  }
}
async function startWriting(p) {
  await tap(p, 'Intl Law essay');
  await tap(p, 'Write an essay');
  await written(p).getByPlaceholder('Your answer').waitFor();
}
const clearExpected = s => { assert(s.errors.every(e => /^console: Failed to load resource:/.test(e)), JSON.stringify(s.errors)); s.errors.length = 0; };
const queue = p => p.evaluate(() => JSON.parse(localStorage.getItem('lawstin-study-queue') ?? '[]'));

export async function safetyFlows() {
  fs.mkdirSync(out, { recursive: true });
  const sessions = [];
  const O = async opts => { const s = await open(opts); s.page.setDefaultTimeout(7000); sessions.push(s); return s; };
  try {
    const cold = await O();
    for (let i = 0; i < 2; i++) cold.failRequest('/app_settings', 'GET', { key: 'workspace:clinic:hours', status: 500 });
    await cold.goto('#/courses/clinic');
    await cold.page.getByText('Hours unavailable', { exact: true }).waitFor();
    assert(await cold.page.getByRole('button', { name: 'Add hours' }).isDisabled());
    assert.equal(cold.rows.find(r => r.key === 'workspace:clinic:hours').value.includes('87.5'), true);
    clearExpected(cold); await cold.close();
    console.log('PASS: failed hours fetch never presents or writes a zero fallback');

    const workspace = await O({ hash: '#/courses/clinic' }); const p = workspace.page;
    await p.getByRole('button', { name: /^87.5 of 200/ }).waitFor();
    await workspace.goto('#/study');
    for (let i = 0; i < 2; i++) workspace.failRequest('/app_settings', 'GET', { key: 'workspace:clinic:hours', status: 500 });
    await workspace.goto('#/courses/clinic');
    await p.getByRole('button', { name: /^87.5 of 200/ }).waitFor();
    clearExpected(workspace);
    await workspace.setOffline(true);
    await tap(p, 'Add hours'); await p.getByRole('textbox', { name: 'Hours logged' }).fill('2'); await p.keyboard.press('Enter');
    await p.getByRole('button', { name: /^89.5 of 200/ }).waitFor();
    await p.reload(); await p.getByRole('button', { name: /^89.5 of 200/ }).waitFor();
    assert.equal(JSON.parse(workspace.rows.find(r => r.key === 'workspace:clinic:hours').value).logged, 87.5);
    await workspace.setOffline(false);
    await until(() => JSON.parse(workspace.rows.find(r => r.key === 'workspace:clinic:hours').value).logged === 89.5);
    await p.getByRole('button', { name: /^89.5 of 200/ }).click();
    await p.getByRole('textbox', { name: 'Hours logged' }).fill('90'); await p.reload();
    assert.equal(await p.getByRole('textbox', { name: 'Hours logged' }).inputValue(), '90');
    await p.keyboard.press('Enter'); await p.getByRole('button', { name: /^90 of 200/ }).waitFor();
    await until(() => JSON.parse(workspace.rows.find(r => r.key === 'workspace:clinic:hours').value).logged === 90);
    clearExpected(workspace);
    const notes = p.getByRole('textbox', { name: 'Workspace notes' });
    await notes.fill('Fast leave keeps this note'); await workspace.goto('#/study');
    await until(() => workspace.rows.some(r => r.key === 'workspace:notes:clinic' && r.value === 'Fast leave keeps this note'));
    await workspace.goto('#/courses/clinic'); await workspace.setOffline(true);
    await notes.fill('Offline note survives reload'); await workspace.goto('#/study'); await p.reload();
    await workspace.goto('#/courses/clinic');
    assert.equal(await notes.inputValue(), 'Offline note survives reload');
    await workspace.goto('#/study'); await workspace.setOffline(false);
    await until(() => workspace.rows.some(r => r.key === 'workspace:notes:clinic' && r.value === 'Offline note survives reload'));
    clearExpected(workspace); await workspace.close();
    console.log('PASS: cached hours, offline addition, fast-leave notes and offline notes survive reload and reconnect away from the workspace');

    const drafts = await O(); const d = drafts.page;
    await startWriting(d); await written(d).getByPlaceholder('Your answer').fill('First unfinished essay');
    await focusInside(d, 'Written practice'); await escape(d);
    assert.equal(await d.evaluate(() => document.activeElement?.textContent), 'Intl Law essay');
    await drafts.goto('#/courses/asy/hypothetical');
    const hypo = drafts.data.materials.find(m => m.kind === 'hypothetical' && m.course === 'asy');
    await d.getByRole('button', { name: new RegExp(hypo.title) }).click();
    await tap(d, 'Write and grade'); await written(d).getByPlaceholder('Your answer').waitFor();
    assert(await written(d).evaluate(el => el.contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2))));
    await written(d).getByPlaceholder('Your answer').fill('Second unfinished essay');
    await d.screenshot({ path: `${out}/written-over-reader.png` });
    await escape(d); await d.getByRole('button', { name: 'Write and grade', exact: true }).waitFor();
    await escape(d); await drafts.goto('#/study'); await tap(d, 'Intl Law essay');
    await written(d).getByRole('button', { name: /Continue your draft/ }).click();
    assert.equal(await written(d).getByPlaceholder('Your answer').inputValue(), 'First unfinished essay');
    await d.reload(); await tap(d, 'Intl Law essay'); await written(d).getByRole('button', { name: /Continue your draft/ }).click();
    assert.equal(await written(d).getByPlaceholder('Your answer').inputValue(), 'First unfinished essay');
    assert.equal(await d.evaluate(() => Object.values(JSON.parse(localStorage.getItem('lawstin-cache:written-drafts'))).length), 2);
    await drafts.setOffline(true); await tap(d, 'Grade my answer');
    await d.getByText('Saved. Grade it when you’re back online.', { exact: true }).waitFor();
    await d.reload(); await tap(d, 'Intl Law essay'); await written(d).getByRole('button', { name: /Continue your draft/ }).click();
    assert.equal(await written(d).getByPlaceholder('Your answer').inputValue(), 'First unfinished essay');
    await drafts.setOffline(false); await written(d).getByRole('button', { name: 'Grade now', exact: true }).waitFor();
    await tap(d, 'Grade now'); await written(d).getByText('Spotted', { exact: true }).waitFor();
    await until(() => drafts.rows.some(r => r.key.startsWith('written:v1:') && JSON.parse(r.value).answer === 'First unfinished essay'));
    assert.equal(await d.evaluate(() => Object.values(JSON.parse(localStorage.getItem('lawstin-cache:written-drafts'))).length), 1);
    clearExpected(drafts); await drafts.close();
    console.log('PASS: independent drafts, Continue, reload, essay over reader, safe Escape, offline grading and Grade now');

    const timeout = await O(); const t = timeout.page;
    await startWriting(t); await written(t).getByPlaceholder('Your answer').fill('Ready to grade after timeout');
    timeout.delayAi(30000); await t.clock.install(); await tap(t, 'Grade my answer'); await t.clock.runFor(15100);
    await t.getByText('Saved. Grade it when you’re back online.', { exact: true }).waitFor();
    assert.equal(await written(t).getByPlaceholder('Your answer').inputValue(), 'Ready to grade after timeout');
    await timeout.close();
    console.log('PASS: grading times out after 15 seconds and keeps a ready-to-grade draft');

    const cardData = richState(); cardData.materials = cardData.materials.filter(m => m.kind === 'flashcard' && m.course === 'il').slice(0, 1);
    cardData.rows = cardData.rows.filter(r => !r.key.startsWith('study:v1:cards:'));
    const cards = await O({ hash: '#/courses/il/flashcard', state: cardData }); const c = cards.page;
    await c.getByRole('button', { name: /Review \d+ cards/ }).click();
    const cardButton = dialog(c).getByRole('button', { expanded: false }).filter({ hasText: 'Reveal answer' });
    assert.match(await cardButton.getAttribute('class'), /recallCard/);
    assert.equal(await cardButton.getAttribute('aria-label'), null);
    const prompt = await cardButton.innerText(); assert(prompt.length > 'Reveal answer'.length);
    await focusInside(c, 'Flashcards'); await cards.setOffline(true);
    await cardButton.click(); await tap(c, 'Review tomorrow');
    assert.equal((await queue(c)).length, 1); assert.equal(cards.events.length, 0);
    await tap(c, 'Go over 1 missed');
    await dialog(c).getByRole('button', { expanded: false }).filter({ hasText: 'Reveal answer' }).click(); await tap(c, 'Recalled it');
    assert.equal((await queue(c)).length, 1);
    const clientId = (await queue(c))[0].id;
    await escape(c); await c.reload(); await cards.setOffline(false);
    await until(() => cards.events.length === 1); await until(async () => (await queue(c)).length === 0);
    assert.equal(cards.events[0].id, clientId);
    await cards.setOffline(false); await c.waitForTimeout(150); assert.equal(cards.events.length, 1);
    clearExpected(cards); await cards.close();
    console.log('PASS: accessible flashcard text, trapped focus, offline grade survives reload and sends exactly once');

    const ack = await O({ hash: '#/courses/il/flashcard' }); const a = ack.page;
    await a.getByRole('button', { name: /Review \d+ cards/ }).click();
    await dialog(a).getByRole('button', { expanded: false }).filter({ hasText: 'Reveal answer' }).click();
    ack.loseEventAck(); ack.failRequest('/study_events', 'GET', { status: 500 }); await tap(a, 'Recalled it');
    await until(() => ack.events.length === 1); await ack.setOffline(false);
    await until(async () => (await queue(a)).length === 0);
    assert.equal(ack.events.length, 1); clearExpected(ack); await ack.close();
    console.log('PASS: a committed study event with a lost response is confirmed without inserting a second event');

    const overlays = await O(); const o = overlays.page;
    await tap(o, 'Match'); await focusInside(o, 'Match'); await escape(o);
    assert.equal(await o.getByRole('dialog').count(), 0);
    await tap(o, 'Practice exam'); await focusInside(o, 'Practice exam');
    await dialog(o).getByRole('button', { name: /Start/ }).click();
    await o.getByRole('dialog', { name: 'Practice exam', exact: true }).waitFor();
    await focusInside(o, 'Practice exam');
    const closeBox = await dialog(o).getByRole('button', { name: 'Close', exact: true }).boundingBox();
    assert(closeBox.x > o.viewportSize().width / 2);
    await o.keyboard.press('Escape'); await o.getByRole('alertdialog', { name: 'End exam?' }).waitFor();
    await o.getByRole('alertdialog').getByRole('button', { name: 'Keep going', exact: true }).click(); await tap(o, 'Close'); await o.getByRole('alertdialog', { name: 'End exam?' }).waitFor();
    await o.getByRole('alertdialog').getByRole('button', { name: 'End', exact: true }).click(); await o.getByRole('dialog').waitFor({ state: 'hidden' });
    await o.getByRole('button', { name: /Review \d+ missed topics/ }).click(); await focusInside(o, 'Missed topics lesson'); await escape(o);
    await overlays.goto('#/q/il-03'); await dialog(o).getByRole('group', { name: 'Answer choices' }).getByRole('button').first().click(); await tap(o, 'Check answer');
    await dialog(o).getByRole('button', { name: /Ask/ }).first().click(); await focusInside(o, 'Ask about this question'); await escape(o);
    assert.equal(await o.getByRole('dialog', { name: 'Practice', exact: true }).count(), 1); await escape(o);
    assert.deepEqual(overlays.errors, []); await overlays.close();
    console.log('PASS: Match Escape, exam Close on right, End/Keep going confirmation, lesson and nested Ask focus');

    const drill = await O({ hash: '#/courses/il/drill' }); const r = drill.page;
    const material = drill.data.materials.find(m => m.kind === 'drill' && m.course === 'il');
    await r.getByRole('button', { name: new RegExp(material.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    const wrong = material.categories.find(c => c !== material.items[0].answer);
    await dialog(r).getByRole('button', { name: wrong, exact: true }).first().click();
    await until(() => drill.events.length === 1); await tap(r, 'Reset');
    await dialog(r).getByRole('button', { name: wrong, exact: true }).first().click();
    await r.waitForTimeout(150); assert.equal(drill.events.length, 1);
    drill.failRequest('/app_settings', 'POST'); await tap(r, 'Solid');
    await until(() => drill.rows.some(row => row.key === `study:v1:confidence:${material.id}` && row.value === '"solid"'));
    clearExpected(drill); await drill.close();
    console.log('PASS: drill Reset counts once per day and study-progress retries a failed write with backoff');

    const settings = await O(); const e = settings.page;
    await tap(e, 'Settings'); await focusInside(e, 'Settings');
    const pendingEssay = { ...JSON.parse(settings.rows.find(row => row.key.startsWith('written:v1:')).value), id: 'pending-export' };
    await e.evaluate(entry => localStorage.setItem('lawstin-written-pending', JSON.stringify([entry])), pendingEssay);
    const download = e.waitForEvent('download'); await tap(e, 'Export my data');
    const file = await download; const path = await file.path();
    const exported = JSON.parse(fs.readFileSync(path, 'utf8'));
    assert(exported.study.some(row => row.key.startsWith('written:v1:')));
    assert(exported.study.some(row => row.key === 'written:v1:pending-export'));
    await escape(e); await until(() => !e.url().endsWith('#/settings'));
    await settings.goto('#/study'); await tap(e, 'Settings'); await e.goBack();
    await e.getByRole('dialog', { name: 'Settings', exact: true }).waitFor({ state: 'hidden' });
    assert.deepEqual(settings.errors, []); await settings.close();
    console.log('PASS: exported data includes graded essays; Settings supports keyboard focus, Escape and browser Back');

    for (const [width, height] of [[390, 844], [820, 1180], [1440, 900]]) for (const dark of [false, true]) {
      const s = await O({ width, height, dark, reducedMotion: true }); const v = s.page;
      const tag = `${width}-${dark ? 'dark' : 'light'}`;
      await v.screenshot({ path: `${out}/safety-study-${tag}.png` });
      await startWriting(v); await written(v).getByPlaceholder('Your answer').fill('A saved essay draft.');
      await v.screenshot({ path: `${out}/safety-written-${tag}.png` });
      assert.equal(await v.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert(await written(v).getByRole('button', { name: 'Grade my answer' }).evaluate(el => getComputedStyle(el).transitionDuration.split(',').every(t => parseFloat(t) === 0)));
      await escape(v); await tap(v, 'Match'); await v.getByRole('dialog', { name: 'Match', exact: true }).waitFor(); await v.screenshot({ path: `${out}/safety-match-${tag}.png` }); await escape(v);
      await s.goto('#/courses/clinic'); await v.getByRole('textbox', { name: 'Workspace notes' }).waitFor();
      await v.screenshot({ path: `${out}/safety-clinic-${tag}.png` });
      await s.goto('#/progress'); await v.screenshot({ path: `${out}/safety-progress-${tag}.png` });
      assert.deepEqual(s.errors, []); await s.close();
    }
    console.log('PASS: safety screens at 390×844, 820×1180, 1440×900, light/dark, reduced motion, zero runtime errors');
  } catch (e) {
    for (const s of sessions) if (!s.page.isClosed()) { await s.page.screenshot({ path: `${out}/safety-failure.png` }).catch(() => {}); console.error('SAFETY ERRORS', s.errors); }
    throw e;
  } finally { await closeAll(); }
}

if (process.argv[1]?.endsWith('/safety-flows.mjs')) await safetyFlows();
