import assert from 'node:assert/strict';
import { open, closeAll } from './mock.mjs';

export async function plainNameFlows() {
  const sessions = [];
  const O = async (opts = {}) => { const s = await open(opts); s.page.setDefaultTimeout(8000); sessions.push(s); return s; };
  try {
    const s = await O({ width: 390, height: 844 });
    const P = s.page, qs = s.data.state.questions;
    await P.getByRole('button', { name: 'Match', exact: true }).click();
    const D = P.getByRole('dialog', { name: 'Match', exact: true });
    const board = D.getByRole('group', { name: /Match each/ });
    await board.waitFor();
    const left = board.locator('> div').nth(0).locator('button'), right = board.locator('> div').nth(1).locator('button');
    const pairOf = async () => {
      const lines = (await left.nth(0).innerText()).trim().split('\n');
      return { name: lines[0], cite: lines[lines.length - 1], q: qs.find(q => q.authority === lines[lines.length - 1]) };
    };

    // A tile is a plain name with its citation beneath, never the citation alone, and the other side is the rule.
    const first = await pairOf();
    assert.ok(first.q && first.name !== first.cite, 'name and citation are separate lines');
    assert.ok(!(await left.nth(0).innerText()).includes('Sample rule'), 'name tile does not hold the rule');
    assert.ok((await right.first().innerText()).startsWith('Sample rule'), 'rule tile holds the rule');

    // A wrong pick shows what that rule actually belongs to on the tile he chose.
    await left.nth(0).click();
    const wrong = right.filter({ hasNotText: first.q.rule.slice(0, 40) }).first();
    await wrong.click();
    const belongs = (await wrong.innerText()).trim().split('\n').pop();
    assert.ok(belongs && !belongs.startsWith('Sample rule'), `wrong tile names its owner: ${belongs}`);
    assert.ok(qs.some(q => q.subtopic === belongs || q.topic === belongs), 'the owner is a real name');
    await P.waitForTimeout(1800);

    // A matched pair stays as one joined card with the name, the citation and the full rule.
    await left.nth(0).click();
    await right.filter({ hasText: first.q.rule.slice(0, 40) }).first().click();
    const joined = D.locator('[class*="pairCard"]').first();
    await joined.waitFor();
    const text = await joined.innerText();
    assert.ok(text.includes(first.name) && text.includes(first.cite) && text.includes(first.q.rule), 'joined card shows name, citation and the full rule');
    assert.equal(await left.count(), 3, 'matched tiles leave the board');

    // Finish the round; the result lists every pair with misses first, and a row opens its Topic page.
    for (let i = 0; i < 3; i++) {
      const p = await pairOf();
      await left.nth(0).click(); await right.filter({ hasText: p.q.rule.slice(0, 40) }).first().click(); await P.waitForTimeout(150);
    }
    await D.getByRole('button', { name: 'Next round' }).waitFor();
    const rows = D.locator('[class*="review"]');
    assert.equal(await rows.count(), 4, 'one row per pair');
    const firstRow = await rows.first().innerText();
    assert.ok(firstRow.includes(belongs) || firstRow.includes(first.name), 'a missed pair is listed first');
    for (let i = 0; i < 4; i++) {
      const row = await rows.nth(i).innerText();
      assert.ok(/Sample rule/.test(row) && row.split('\n').length >= 3, 'row has name, citation and rule');
    }
    await rows.first().click();
    await P.waitForFunction(() => location.hash.startsWith('#/tool/Topic/'));
    await s.close();
    console.log('PASS: Match shows a name with its citation, explains a wrong pick, joins matched pairs and lists them on the result');

    // A citation never stands alone in the Rulebook or in Search.
    const r = await O({ hash: '#/courses/il/rules', width: 390, height: 844 });
    const rp = r.page;
    const cited = rp.locator('[data-rule]').filter({ hasText: 'Additional Protocol I' }).first();
    await cited.waitFor();
    assert.deepEqual((await cited.innerText()).split('\n').slice(0, 2), ['Military objectives', 'Additional Protocol I, art. 52(2)'], 'descriptive name first, citation second');
    await r.close();
    const r2 = await O({ hash: '#/courses/pr/rules', width: 390, height: 844 });
    const rp2 = r2.page;
    const bare = rp2.locator('[data-rule]').filter({ hasText: 'Rule 1.18' }).first();
    await bare.waitFor();
    assert.notEqual((await bare.innerText()).split('\n')[0].trim(), 'Rule 1.18', 'a citation-only subtopic is not the heading');
    assert.deepEqual(r2.errors, []);
    await r2.close();

    const f = await O({ hash: '#/search', width: 390, height: 844 });
    const fp = f.page;
    await fp.getByRole('searchbox', { name: 'Search rules, materials, and topics' }).fill('Rule 1.18');
    const title = fp.locator('button[class*="resultRow"] [class*="resultTitle"]').first();
    await title.waitFor();
    assert.equal((await title.innerText()).trim(), 'Confidentiality & Prospective Clients', 'a bare-citation subtopic is searchable but titled in plain words');
    assert.deepEqual(f.errors, []);
    await f.close();
    console.log('PASS: Rulebook and Search put plain words before the citation');
  } finally {
    for (const s of sessions) await s.close().catch(() => {});
    await closeAll();
  }
}
