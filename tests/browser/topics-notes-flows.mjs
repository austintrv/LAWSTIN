import assert from 'node:assert/strict';
import fs from 'node:fs';
import { open, closeAll } from './mock.mjs';

const out = process.env.LAWSTIN_ARTIFACTS_DIR ?? 'artifacts/topics-notes';
fs.mkdirSync(out, { recursive: true });

export async function topicsNotesFlows() {
  try {
    // 1. Open topic from the course page at 390 and 1440
    for (const [width, height] of [[390, 844], [1440, 900]]) {
      const s = await open({ width, height, hash: '#/courses/il' });
      const p = s.page;

      // See "Topics" section on the course page
      await p.getByRole('heading', { name: 'Topics', exact: true }).waitFor();

      // See "My notes" button in course header
      await p.getByRole('button', { name: 'My notes', exact: true }).waitFor();

      // Click "Laws of War" topic row
      await p.getByRole('button', { name: /Laws of War/ }).first().click();

      // Topic modal opens
      const dialog = p.getByRole('dialog', { name: 'Laws of War' });
      await dialog.waitFor();
      await p.screenshot({ path: `${out}/topic-open-${width}.png` });

      // Check header chips: course, status, class dates
      await dialog.getByText('International Law').first().waitFor();
      await dialog.getByText(/Solid|Learning|Shaky|New|Not covered/).first().waitFor();

      // Check Rules and My notes sections appear
      await dialog.getByRole('heading', { name: 'Rules', exact: true }).waitFor();
      await dialog.getByRole('heading', { name: 'My notes', exact: true }).waitFor();

      // Close topic modal
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await p.getByRole('dialog').waitFor({ state: 'hidden' });

      await s.close();
    }
    console.log('PASS: open topic from course page at 390 and 1440');

    // 2. Type notes, leave within 300 ms, return, text is there
    {
      const s = await open({ width: 390, height: 844, hash: '#/tool/Topic/il/Laws%20of%20War' });
      const p = s.page;
      await p.getByRole('dialog', { name: 'Laws of War' }).waitFor();

      const textarea = p.getByRole('textbox', { name: 'Notes for Laws of War' });
      await textarea.waitFor();
      const initialText = await textarea.inputValue();
      const typed = `${initialText}\nFast typed note at ${Date.now()}`;

      // Type note
      await textarea.fill(typed);

      // Leave within 300 ms
      const leaveStart = Date.now();
      await p.keyboard.press('Escape');
      await p.getByRole('dialog').waitFor({ state: 'hidden' });
      const leaveDuration = Date.now() - leaveStart;
      assert(leaveDuration < 500, `Left within expected time: ${leaveDuration}ms`);

      // Wait for back navigation to settle, then return to topic
      await p.waitForTimeout(350);
      await s.goto('#/tool/Topic/il/Laws%20of%20War');
      await p.getByRole('dialog', { name: 'Laws of War' }).waitFor();

      // Verify text is preserved
      const returnedTextarea = p.getByRole('textbox', { name: 'Notes for Laws of War' });
      await returnedTextarea.waitFor();
      const preservedText = await returnedTextarea.inputValue();
      assert(preservedText.includes('Fast typed note'), 'Typed text is preserved after rapid exit');

      await s.close();
    }
    console.log('PASS: type notes, leave within 300 ms, return, text is there');

    // 3. Offline edit syncs once after reconnect
    {
      const s = await open({ width: 1440, height: 900, hash: '#/tool/Topic/il/Laws%20of%20War' });
      const p = s.page;
      await p.getByRole('dialog', { name: 'Laws of War' }).waitFor();

      // Go offline
      await s.setOffline(true);

      const textarea = p.getByRole('textbox', { name: 'Notes for Laws of War' });
      const offlineText = `Offline text addition ${Date.now()}`;
      await textarea.fill(offlineText);
      await textarea.blur();

      // Ensure backend hasn't received it yet while offline
      const rowBefore = s.rows.find(r => r.key === 'notes:v1:il:Laws of War');
      assert(!rowBefore?.value?.includes(offlineText), 'Backend has not received offline edit yet');

      // Go back online
      await s.setOffline(false);

      // Wait for sync to backend
      for (let i = 0; i < 40; i++) {
        const rowAfter = s.rows.find(r => r.key === 'notes:v1:il:Laws of War');
        if (rowAfter?.value?.includes(offlineText)) break;
        await new Promise(r => setTimeout(r, 100));
      }
      const rowFinal = s.rows.find(r => r.key === 'notes:v1:il:Laws of War');
      assert(rowFinal?.value?.includes(offlineText), 'Offline edit synced to backend once reconnected');

      await s.close();
    }
    console.log('PASS: offline edit syncs once after reconnect');

    // 4. Tick "In my notes" and see the strip move
    {
      const s = await open({ width: 1440, height: 900, hash: '#/tool/Notes/il' });
      const p = s.page;
      await p.getByRole('dialog', { name: /International Law notes/ }).waitFor();

      // Check initial progress strip
      await p.locator('div[class*="_stripTrack_"]').waitFor();
      const stripFill = p.locator('div[class*="_stripFill_"]');
      const initialWidth = await stripFill.evaluate(el => el.style.width);

      // Find an unticked unit's checkbox
      const tickBtn = p.getByRole('button', { name: /Tick .* in notes/ }).first();
      await tickBtn.click();

      // Check that the progress strip updated
      await p.waitForTimeout(300);
      const updatedWidth = await stripFill.evaluate(el => el.style.width);
      assert.notEqual(initialWidth, updatedWidth, 'Progress strip width updated after ticking in notes');

      await s.close();
    }
    console.log('PASS: tick In my notes and see the strip move');

    // 5. Copy all puts expected text on the clipboard
    {
      const s = await open({ width: 390, height: 844, hash: '#/tool/Notes/il' });
      const p = s.page;
      await s.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
      await p.getByRole('dialog', { name: /International Law notes/ }).waitFor();

      // Click "Copy all"
      await p.getByRole('button', { name: 'Copy all', exact: true }).click();
      await p.waitForTimeout(300);

      // Read clipboard
      const clipText = await p.evaluate(() => navigator.clipboard.readText());
      assert(clipText.length > 0, 'Clipboard text is not empty');
      assert(clipText.includes('# Laws of War'), 'Clipboard text contains unit heading');
      assert(clipText.includes('Customary rules require'), 'Clipboard text contains unit note text');

      await s.close();
    }
    console.log('PASS: Copy all puts expected text on the clipboard');

  } finally {
    await closeAll();
  }
}

if (process.argv[1]?.endsWith('topics-notes-flows.mjs')) {
  topicsNotesFlows().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
