import assert from 'node:assert/strict';
import { open, closeAll } from './mock.mjs';

export async function consistencyFlows() {
  try {
    for (const width of [390, 1440]) {
      const s = await open({width, height:900, reducedMotion:true});
      const p = s.page;
      await p.getByRole('button', {name:'How today’s plan is built'}).click();
      const sheet = p.getByRole('dialog', {name:'How Lawstin works'});
      await sheet.waitFor();
      const targets = await sheet.locator('[class*="_status_"]').allTextContents();
      const courseTargets = targets.slice(0,3).map(t => Number(t.split('·')[1]));
      const goal = Number(await sheet.locator('.finish-number').innerText());
      assert.equal(courseTargets.reduce((a,b)=>a+b,0),goal);
      await sheet.getByRole('button',{name:/Ready to review/}).click();
      await p.getByRole('dialog',{name:'Practice',exact:true}).waitFor();
      await p.keyboard.press('Escape');
      await s.goto('#/courses');
      await p.getByRole('heading',{name:'Your courses',exact:true}).waitFor();
      assert.equal(await p.getByRole('button',{name:/Review \d+ cards/}).count(),1,'Courses home has one Flashcards tile');
      await s.setOffline(true);
      await p.getByRole('button',{name:/Flashcards/}).first().click();
      await p.getByRole('dialog',{name:'Flashcards'}).waitFor();
      await p.keyboard.press('Escape');
      assert.deepEqual(s.errors,[]);
      await s.close();
    }
    const empty = await open({emptyState:true});
    assert.equal(await empty.page.getByRole('button',{name:'Review 0 due items',exact:true}).count(),0);
    assert.equal(await empty.page.getByRole('button',{name:'Starred',exact:true}).count(),0);
    await empty.goto('#/progress');
    await empty.page.getByRole('heading',{name:'Study calendar'}).waitFor();
    assert.equal(await empty.page.getByText('Answers given',{exact:true}).count(),0);
    assert.equal(await empty.page.getByRole('heading',{name:'How you miss',exact:true}).count(),0);
    await empty.page.screenshot({path:'artifacts/final-review/first-run-progress-390-current.png'});
    assert.deepEqual(empty.errors,[]); await empty.close();
    const s = await open({hash:'#/q/il-03'}), p = s.page;
    const q = s.data.state.questions.find(q => q.id === 'il-03');
    await p.getByRole('group',{name:'Answer choices'}).getByRole('button',{name:new RegExp('^'+q.answer+' ')}).click();
    await p.getByRole('button',{name:'Check answer',exact:true}).click();
    await p.getByRole('heading',{name:'Correct',exact:true}).waitFor();
    await p.getByRole('button',{name:q.topic,exact:true}).click();
    const topic = p.getByRole('dialog',{name:q.topic,exact:true});
    await topic.getByRole('button',{name:'Close',exact:true}).click();
    await p.getByRole('heading',{name:'Correct',exact:true}).waitFor();
    assert.equal(s.answers.length,1);
    assert.deepEqual(s.errors,[]);
    await s.close();
    console.log('PASS: quiz Topic link opens above review and returns with the same answer');
    console.log('PASS: plan chips add up, real review action, one Flashcards door, offline and reduced motion at 390/1440');
  } finally { await closeAll(); }
}
