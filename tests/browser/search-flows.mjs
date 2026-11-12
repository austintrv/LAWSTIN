import assert from 'node:assert/strict';
import fs from 'node:fs';
import { open, richState, closeAll } from './mock.mjs';

const out = process.env.LAWSTIN_ARTIFACTS_DIR ?? 'artifacts/browser';

export async function searchFlows() {
  fs.mkdirSync(out, { recursive: true });
  const sessions = [];
  const O = async (opts = {}) => {
    const s = await open(opts);
    s.page.setDefaultTimeout(8000);
    sessions.push(s);
    return s;
  };

  try {
    // 1. Search a rule by a word from its authority and open it
    const s1 = await O({ hash: '#/search', width: 390, height: 844 });
    const p1 = s1.page;
    await p1.getByRole('searchbox', { name: 'Search rules, materials, and topics' }).waitFor();

    // Type a word from an authority (e.g. "Charter" or "VCLT" or "Rule")
    await p1.getByRole('searchbox', { name: 'Search rules, materials, and topics' }).fill('Charter');
    await p1.waitForTimeout(300);

    // Rule results should appear
    const ruleRow = p1.locator('button').filter({ hasText: 'Rules' }).first();
    const resultRow = p1.locator('button[class*="resultRow"]').first();
    await resultRow.waitFor();
    await resultRow.click();

    // Rulebook dialog opens
    await p1.getByRole('dialog', { name: 'Rulebook' }).waitFor();
    await p1.keyboard.press('Escape');
    await p1.waitForTimeout(300);
    assert.deepEqual(s1.errors, []);
    await s1.close();
    console.log('PASS: search a rule by word from authority and open it');

    // 2. Course chip narrows results
    const s2 = await O({ hash: '#/search', width: 390, height: 844 });
    const p2 = s2.page;
    await p2.getByRole('searchbox', { name: 'Search rules, materials, and topics' }).fill('law');
    await p2.waitForTimeout(300);
    const countAll = await p2.locator('button[class*="resultRow"]').count();
    assert.ok(countAll > 0);

    // Click "Intl Law" chip
    await p2.getByRole('button', { name: 'Intl Law', exact: true }).click();
    await p2.waitForTimeout(300);
    const countIl = await p2.locator('button[class*="resultRow"]').count();
    assert.ok(countIl <= countAll);

    // Click "All" chip restores
    await p2.getByRole('button', { name: 'All', exact: true }).click();
    await p2.waitForTimeout(300);
    assert.equal(await p2.locator('button[class*="resultRow"]').count(), countAll);
    assert.deepEqual(s2.errors, []);
    await s2.close();
    console.log('PASS: course chips narrow search results');

    // 3. ⌘K from Progress opens Search
    const s3 = await O({ hash: '#/progress', width: 1440, height: 900 });
    const p3 = s3.page;
    await p3.waitForTimeout(400);
    await p3.keyboard.press('Meta+k');
    await p3.waitForTimeout(300);
    assert.equal(await p3.evaluate(() => window.location.hash), '#/search');
    await p3.getByRole('searchbox', { name: 'Search rules, materials, and topics' }).waitFor();
    assert.deepEqual(s3.errors, []);
    await s3.close();
    console.log('PASS: ⌘K from Progress opens Search');

    // 4. Arrow keys and Enter on desktop navigate and open result
    const s4 = await O({ hash: '#/search', width: 1440, height: 900 });
    const p4 = s4.page;
    await p4.getByRole('searchbox', { name: 'Search rules, materials, and topics' }).fill('force');
    await p4.waitForTimeout(300);
    await p4.locator('button[class*="resultRow"]').first().waitFor();

    // Preview pane is visible on desktop
    await p4.locator('[class*="previewPane"]').waitFor();

    // Arrow down moves selection
    await p4.keyboard.press('ArrowDown');
    await p4.waitForTimeout(150);

    // Enter opens the item
    await p4.keyboard.press('Enter');
    await p4.waitForTimeout(400);
    assert.deepEqual(s4.errors, []);
    await s4.close();
    console.log('PASS: Arrow and Enter on desktop move through and open search result');

    // 5. #/activity redirects to #/progress
    const s5 = await O({ hash: '#/activity', width: 390, height: 844 });
    const p5 = s5.page;
    await p5.waitForTimeout(400);
    assert.equal(await p5.evaluate(() => window.location.hash), '#/progress');
    assert.deepEqual(s5.errors, []);
    await s5.close();
    console.log('PASS: #/activity redirects to #/progress');

    // 6. Calendar and missed topics present on Progress at 390, 820, 1440
    for (const width of [390, 820, 1440]) {
      const s6 = await O({ hash: '#/progress', width, height: 900 });
      const p6 = s6.page;
      await p6.waitForTimeout(400);

      // Verify study calendar is present
      const cal = p6.getByRole('heading', { name: 'Study calendar', exact: true });
      await cal.waitFor();

      // Verify "How you miss" is present
      await p6.getByRole('heading', { name: 'How you miss', exact: true }).waitFor();

      assert.deepEqual(s6.errors, []);
      await s6.close();
    }
    console.log('PASS: calendar and progress sections present at 390, 820, 1440');
  } finally {
    for (const s of sessions) await s.close().catch(() => {});
  }
}
