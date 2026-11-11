import { chromium } from 'playwright';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';

// All backend requests are intercepted. No real login or study writes are used.
const artifacts = process.env.LAWSTIN_ARTIFACTS_DIR ?? 'artifacts/browser';
fs.mkdirSync(artifacts, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } });
await server.listen();
import { applyLocalAnswer } from '../../src/helpers/localAnswer.ts';

const today = new Date().toISOString().slice(0,10);
const add = n => new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const question = (id, topic='Treaties', course='il') => ({id, course, topic, subtopic:topic, classDay:1, classDate:'2026-10-01', source:null,batch:'2026-11-10',stem:`Practice scenario ${id}. A change in the facts raises an issue for analysis. Consider the facts carefully before choosing your answer.`,prompt:`Which result follows in scenario ${id}?`,choices:['A','B','C','D'].map((id,i)=>({id,role:['correct','sneaky','average','bad'][i],text:['The first result follows.','The second result follows.','The third result follows.','The fourth result follows.'][i],why:`Explanation for choice ${id}.`})),answer:'A',rule:'Identify the issue and apply the governing rule to the facts.',authority:'Course rule'});
const progress = (id, patch={}) => ({questionId:id,seen:1,correct:1,wrong:0,box:2,due:add(5),lastChoice:'A',lastCorrect:true,lastAt:add(-1)+'T12:00:00Z',missSneaky:0,missAverage:0,missBad:0,guessed:0,starred:false,flagged:false,...patch});
const browser = await chromium.launch({executablePath:process.env.LAWSTIN_CHROMIUM_PATH ?? (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),headless:true,args:['--no-sandbox']}).catch(async error=>{await server.close();throw error});
const errors=[];
async function setup({width=390,height=844,dark=false,questions,prog=[],materials=[]}={}) {
  let state = {questions:questions ?? Array.from({length:14},(_,i)=>question(String(i+1))),progress:prog,runs:[],days:[]};
  let rows=[]; let answers=[]; let failNext=false; let down=false;
  const ctx=await browser.newContext({viewport:{width,height},colorScheme:dark?'dark':'light',reducedMotion:'reduce',serviceWorkers:'block'});
  await ctx.addInitScript(()=>{
    if (localStorage.getItem('lawstin-test-offline') === '1') Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});
    if (!localStorage.getItem('lawstin-auth')) localStorage.setItem('lawstin-auth',JSON.stringify({access_token:'mock-access-token',refresh_token:'mock-refresh-token',expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:'bearer',user:{id:'00000000-0000-0000-0000-000000000001',email:'test@example.com',aud:'authenticated',role:'authenticated'}}));
    if (!localStorage.getItem('lawstin-prefs')) localStorage.setItem('lawstin-prefs',JSON.stringify({recall:false,plan:true}));
  });
  await ctx.route('https://vbqfmgsrxurdazujbbuk.supabase.co/**',async route=>{
    if (down) return route.abort('internetdisconnected');
    const req=route.request(); const u=new URL(req.url()); const body=req.postDataJSON();
    const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if (u.pathname.endsWith('/get_state')) return json(state);
    if (u.pathname.endsWith('/record_answer')) {
      if(failNext) {failNext=false; return json({message:'Save refused for test'},400);}
      await new Promise(r=>setTimeout(r,150));
      const input={questionId:body.p_question_id,choice:body.p_choice,localDate:body.p_local_date};
      state=applyLocalAnswer(state,input,new Date().toISOString()); answers.push(input);
      return json({correct:input.choice==='A',progress:state.progress.find(p=>p.questionId===input.questionId)});
    }
    if (u.pathname.endsWith('/app_settings')) {
      if (req.method()==='POST') {
        for(const row of Array.isArray(body)?body:[body]) rows=[...rows.filter(r=>r.key!==row.key),row];
        return json(null);
      }
      const key=u.searchParams.get('key')??'';
      return json(rows.filter(r=>key.includes('study:v1')?r.key.startsWith('study:v1:'):key.includes('written:v1')?r.key.startsWith('written:v1:'):key.includes('syllabus:v1')?r.key.startsWith('syllabus:v1:'):false));
    }
    if (u.pathname.endsWith('/study_materials')) return json(materials.map(data=>({data})));
    if (u.pathname.endsWith('/answers')) return json([]);
    if (u.pathname.endsWith('/study_runs') || u.pathname.endsWith('/course_tasks')) return json([]);
    if (u.pathname.endsWith('/push_subscriptions')) return route.fulfill({status:200,headers:{'content-range':'0-0/0'},body:''});
    if (u.pathname.endsWith('/study_events')) return json(null);
    if (u.pathname.endsWith('/user')) return json({id:'00000000-0000-0000-0000-000000000001',email:'test@example.com'});
    errors.push(`Unhandled backend request: ${req.method()} ${u.pathname}`); return json({message:'Unexpected test request'},400);
  });
  const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5174/LAWSTIN/');
  await page.getByRole('button',{name:'How today’s plan is built',exact:true}).waitFor();
  return {ctx,page,setOffline:async on=>{down=on;await page.evaluate(v=>{localStorage.setItem('lawstin-test-offline',v?'1':'0');Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>!v});window.dispatchEvent(new Event(v?'offline':'online'));},on);},get state(){return state},get rows(){return rows},get answers(){return answers},fail(){failNext=true},miss(id){state=applyLocalAnswer(state,{questionId:id,choice:'B',localDate:today},new Date().toISOString())}};
}
async function answer(page) {
  const dlg=page.getByRole('dialog');
  await dlg.getByRole('button',{name:'A The first result follows.',exact:true}).click();
  await dlg.getByRole('button',{name:'Check answer',exact:true}).click();
  await dlg.getByRole('heading',{name:'Correct',exact:true}).waitFor();
}
async function close(page) {await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await page.waitForTimeout(450);if(await page.getByRole('dialog',{name:'Session recap',exact:true}).isVisible()) await page.getByRole('dialog').getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});}
try {
  const { Num } = await server.ssrLoadModule('/src/pages/StudyParts.tsx');
  assert.equal(renderToStaticMarkup(createElement(Num, { v: 37, suffix: '%' })), '37%');
  console.log('PASS: number first paint shows its final value before effects run');

  // Multi-batch practice: no repeated IDs, no future review fill, and recovery across a reload.
  const run=await setup({questions:[...Array.from({length:13},(_,i)=>question(String(i+1))),question('ahead')],prog:[progress('ahead')]});
  const {page}=run;
  await page.screenshot({path:`${artifacts}/study-phone.png`});
  await page.getByRole('button',{name:'Start studying',exact:true}).click();
  await answer(page);
  await page.getByText('Next review',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Next question',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'A The first result follows.',exact:true}).waitFor();
  const next=await page.getByRole('dialog').locator('p').filter({hasText:/Which result follows/}).textContent();
  await page.reload();
  await page.getByRole('button',{name:'Resume studying',exact:true}).click();
  await page.getByRole('dialog').locator('p').filter({hasText:next}).waitFor();
  for (let n=1;n<13;n++) {await answer(page);await page.getByRole('button',{name:'Next question',exact:true}).click();}
  await page.getByRole('heading',{name:'Session complete'}).waitFor();
  assert.equal(run.answers.length,13);assert.equal(new Set(run.answers.map(a=>a.questionId)).size,13);assert(!run.answers.some(a=>a.questionId==='ahead'));
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:'All caught up',exact:true}).waitFor();
  await page.getByRole('button',{name:'Review ahead',exact:true}).waitFor();
  await page.screenshot({path:`${artifacts}/caught-up-phone.png`});
  await run.ctx.close();
  console.log('PASS: multi-batch practice, no repeats, reload resume, caught-up state');

  // Successful topic check retires all the misses in that topic; the checkpoint is synced.
  const lesson=await setup({width:1440,height:1000,questions:[question('missed'),question('check'),question('future','Immunity')],prog:[progress('missed',{lastCorrect:false,lastChoice:'B',wrong:1,due:add(1)}),progress('future')]});
  const p=lesson.page;
  await p.getByRole('button',{name:'Review 1 missed topics',exact:true}).click();
  await p.getByRole('heading',{name:'The rule',exact:true}).waitFor();
  await p.screenshot({path:`${artifacts}/lesson-desktop.png`});
  await p.getByRole('button',{name:'Next',exact:true}).click();
  await p.getByRole('heading',{name:'Where you slipped',exact:true}).waitFor();
  await p.getByRole('button',{name:'Next',exact:true}).click();
  await p.getByRole('heading',{name:'Check yourself',exact:true}).waitFor();
  await p.getByRole('button',{name:'A The first result follows.',exact:true}).click();
  await p.getByRole('button',{name:'Check answer',exact:true}).click();
  await p.getByText('Correct · Topic reviewed',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Next',exact:true}).click();
  await p.getByRole('heading',{name:'Topics reviewed',exact:true}).waitFor();
  await p.screenshot({path:`${artifacts}/lesson-complete-desktop.png`});
  await p.getByRole('button',{name:'Done',exact:true}).click();
  await p.getByRole('button',{name:'Review 0 missed topics',exact:true}).waitFor();
  await p.waitForTimeout(1000);
  assert(lesson.rows.some(r=>r.key==='study:v1:reviews:il|Treaties'));
  await p.reload();
  await p.getByRole('button',{name:'Review 0 missed topics',exact:true}).waitFor();
  lesson.miss('missed');
  await p.reload();
  await p.getByRole('button',{name:'Review 1 missed topics',exact:true}).waitFor();
  await lesson.ctx.close();
  console.log('PASS: topic completion, cloud checkpoint, reload, later miss reopens topic');

  // Saving failure never counts as a completed answer; rapid clicks never count twice.
  const failure=await setup({questions:[question('save')]});
  await failure.page.getByRole('button',{name:'Start studying',exact:true}).click();
  failure.fail();
  await failure.page.getByRole('button',{name:'A The first result follows.',exact:true}).click();
  await failure.page.getByRole('button',{name:'Check answer',exact:true}).click();
  await failure.page.getByText('Couldn’t save that answer',{exact:true}).waitFor();
  assert.equal(failure.answers.length,0);
  await failure.page.getByRole('button',{name:'Check answer',exact:true}).click();
  await failure.page.getByRole('heading',{name:'Correct',exact:true}).waitFor();
  assert.equal(failure.answers.length,1);
  await failure.ctx.close();
  console.log('PASS: failed save stays retryable and does not increment score');

  const modes=await setup({questions:[question('new1'),question('new2'),question('due'),question('later')],prog:[progress('due',{due:today}),progress('later')]});
  await modes.page.getByRole('button',{name:'Study 2 new items',exact:true}).click();
  for(let n=0;n<2;n++){await answer(modes.page);await modes.page.getByRole('button',{name:'Next question',exact:true}).click();}
  await modes.page.getByRole('dialog').waitFor({state:'hidden'});
  assert.deepEqual(modes.answers.map(a=>a.questionId).sort(),['new1','new2']);
  await modes.page.getByRole('button',{name:'Review 1 due items',exact:true}).click();
  await modes.page.keyboard.press('a');
  await modes.page.keyboard.press('Enter');
  await modes.page.getByRole('heading',{name:'Correct',exact:true}).waitFor();
  await close(modes.page);
  await modes.page.reload();
  await modes.page.getByRole('button',{name:'Resume studying',exact:true}).click();
  await modes.page.getByRole('heading',{name:'Correct',exact:true}).waitFor();
  assert.equal(modes.answers.length,3);
  await modes.page.getByRole('button',{name:'Next question',exact:true}).click();
  await modes.page.getByRole('dialog').waitFor({state:'hidden'});
  await modes.ctx.close();
  console.log('PASS: New and Due sessions, keyboard answers, targeted-session reload recovery');

  const wrong=await setup({questions:[question('oldmiss'),question('newcheck')],prog:[progress('oldmiss',{lastCorrect:false,lastChoice:'B',wrong:1})]});
  await wrong.page.getByRole('button',{name:'Review 1 missed topics',exact:true}).click();
  for(let n=0;n<2;n++){await wrong.page.getByRole('button',{name:'Next',exact:true}).click();}
  await wrong.page.getByRole('heading',{name:'Check yourself',exact:true}).waitFor();
  await wrong.page.keyboard.press('b');await wrong.page.keyboard.press('Enter');
  await wrong.page.getByText('Answer: A',{exact:true}).waitFor();
  await wrong.page.getByRole('button',{name:'Next',exact:true}).click();
  await wrong.page.getByRole('heading',{name:'Lesson complete',exact:true}).waitFor();
  await wrong.page.getByText('0 reviewed · 1 to revisit',{exact:true}).waitFor();
  assert.equal(wrong.rows.some(r=>r.key.startsWith('study:v1:reviews:')),false);
  await wrong.page.getByRole('button',{name:'Done',exact:true}).click();
  await wrong.page.getByRole('button',{name:'Review 1 missed topics',exact:true}).waitFor();
  await wrong.ctx.close();
  console.log('PASS: missed check stays in queue and never writes a completion checkpoint');

  const offline=await setup({questions:[question('offline')]});
  await offline.page.getByRole('button',{name:'Start studying',exact:true}).click();
  const offlineGoal=await offline.page.getByRole('dialog').getByRole('progressbar').getAttribute('aria-valuemax');
  await offline.setOffline(true);
  await answer(offline.page);
  assert.equal(offline.answers.length,0);
  const queue=await offline.page.evaluate(()=>JSON.parse(localStorage.getItem('lawstin-answer-queue')));
  assert.equal(queue.length,1);
  await offline.page.getByRole('button',{name:'Next question',exact:true}).click();
  await offline.page.getByRole('dialog').waitFor({state:'hidden'});
  await offline.page.getByRole('button',{name:'All caught up',exact:true}).waitFor();
  await offline.page.reload();
  await offline.page.getByRole('button',{name:'All caught up',exact:true}).waitFor();
  assert.equal(await offline.page.locator('[data-pane="study"]').getByRole('progressbar').getAttribute('aria-valuemax'),offlineGoal);
  assert.equal(offline.answers.length,0);
  await offline.setOffline(false);
  await offline.page.waitForFunction(()=>!localStorage.getItem('lawstin-answer-queue'));
  assert.equal(offline.answers.length,1);
  await offline.ctx.close();
  console.log('PASS: offline answer leaves daily queue immediately and syncs once on reconnect');

  const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/study-library.json',import.meta.url),'utf8'));
  const cards=fixture.materials.filter(m=>m.kind==='flashcard' && m.course==='il').slice(0,2);
  const mixed=await setup({questions:[question('mixed')],materials:cards});
  await mixed.page.getByRole('button',{name:'Start studying',exact:true}).click();
  await answer(mixed.page);
  await mixed.page.getByRole('button',{name:'Next question',exact:true}).click();
  await mixed.page.waitForTimeout(2100);
  for(let n=0;n<cards.length;n++) {
    await mixed.page.getByRole('button',{name:'Reveal answer',exact:true}).click();
    await mixed.page.getByRole('button',{name:'Got it',exact:true}).click();
  }
  await mixed.page.getByRole('heading',{name:'Session complete'}).waitFor();
  await mixed.page.waitForTimeout(1000);
  const grades=mixed.rows.filter(r=>r.key.startsWith('study:v1:cards:'));
  assert.equal(grades.length,2);assert(grades.every(r=>JSON.parse(r.value).seen===1));
  await mixed.ctx.close();
  console.log('PASS: mixed questions and flashcards grade once, finish, and save spaced progress');

  const empty = await setup({ questions: [] });
  await empty.page.getByText('Nothing ready today', { exact: true }).waitFor();
  assert.equal(await empty.page.getByRole('button', { name: 'All caught up', exact: true }).isDisabled(), true);
  await empty.page.screenshot({ path: `${artifacts}/empty-ready-phone.png` });
  await empty.ctx.close();
  const onlyCards = await setup({ width: 1440, height: 900, questions: [], materials: cards.slice(0, 1) });
  await onlyCards.page.getByRole('button', { name: 'Study 1 new items', exact: true }).waitFor();
  await onlyCards.page.getByText('1 to go today', { exact: true }).waitFor();
  await onlyCards.page.getByRole('button', { name: 'Start studying', exact: true }).click();
  await onlyCards.page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await onlyCards.page.getByRole('button', { name: 'Got it', exact: true }).click();
  await onlyCards.page.getByRole('dialog').waitFor({state:'hidden'});
  await onlyCards.page.getByText('Nothing ready today', { exact: true }).waitFor();
  await onlyCards.page.screenshot({ path: `${artifacts}/cards-only-desktop.png` });
  await onlyCards.ctx.close();
  console.log('PASS: empty bank shows nothing ready, and cards alone remain studyable');

  const numbers = await setup({ questions: ['il', 'asy', 'pr'].flatMap(c => Array.from({ length: 30 }, (_, i) => question(`${c}-${i}`, 'Topic', c))) });
  const hero = numbers.page.locator('[data-pane="study"]');
  const ring = hero.getByRole('progressbar', { name: 'Today’s goal' });
  const goal = Number(await ring.getAttribute('aria-valuemax'));
  const toGo = async () => Number((await hero.getByText(/\d+ to go today/).textContent()).match(/\d+/)[0]);
  const before = await toGo();
  await hero.getByRole('button', { name: 'Start studying', exact: true }).click();
  for (let i = 0; i < 5; i++) {
    await answer(numbers.page);
    assert.equal(Number(await numbers.page.getByRole('dialog').getByRole('progressbar', { name: 'Today’s goal' }).getAttribute('aria-valuemax')), goal);
    if (i < 4) await numbers.page.getByRole('button', { name: 'Next question', exact: true }).click();
  }
  await close(numbers.page);
  assert.equal(Number(await ring.getAttribute('aria-valuemax')), goal);
  assert.equal(await toGo(), before - 5);
  await numbers.page.reload();
  await ring.waitFor();
  assert.equal(Number(await ring.getAttribute('aria-valuemax')), goal);
  for (const label of ['Intl Law', 'Asylum', 'Pro Res']) {
    await hero.getByRole('group', { name: 'Course filter' }).getByRole('button', { name: label, exact: true }).click();
    const tile = hero.getByRole('button').filter({ has: numbers.page.locator('span', { hasText: label }).filter({ hasText: new RegExp(`^${label}$`) }) }).filter({ hasText: /days ·/ });
    const left = Number((await tile.getByText(/\d+ to go|Done today/).textContent()).match(/(\d+) to go/)?.[1] ?? 0);
    const headline = left ? await toGo() : (await hero.getByText('Done for today', { exact: true }).count() ? 0 : await toGo());
    assert.equal(headline, left);
    if (left) {
      await hero.getByRole('button', { name: /studying|Keep going/ }).click();
      const bar = numbers.page.getByRole('dialog').getByRole('progressbar', { name: 'Today’s goal' });
      assert.equal(await bar.getAttribute('aria-valuemax'), await ring.getAttribute('aria-valuemax'));
      await close(numbers.page);
    }
  }
  await numbers.ctx.close();
  console.log('PASS: five answers keep the goal fixed, to go drops by five, reload and every course tile agree');

  const continuation = await setup({ questions: Array.from({ length: 6 }, (_, i) => [question(`miss-${i}`, `Topic ${i}`), question(`check-${i}`, `Topic ${i}`)]).flat(), prog: Array.from({ length: 6 }, (_, i) => progress(`miss-${i}`, { lastCorrect: false, lastChoice: 'B', wrong: 1 })) });
  await continuation.page.getByRole('button', { name: 'Review 6 missed topics', exact: true }).click();
  for (let i = 0; i < 4; i++) {
    await continuation.page.getByRole('heading', { name: 'The rule', exact: true }).waitFor();
    await continuation.page.getByRole('button', { name: 'Next', exact: true }).click();
    await continuation.page.getByRole('button', { name: 'Next', exact: true }).click();
    await continuation.page.keyboard.press('a'); await continuation.page.keyboard.press('Enter');
    await continuation.page.getByText('Correct · Topic reviewed', { exact: true }).waitFor();
    await continuation.page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await continuation.page.getByRole('button', { name: 'Review 2 more', exact: true }).click();
  await continuation.page.getByRole('heading', { name: 'The rule', exact: true }).waitFor();
  await continuation.page.getByRole('dialog').getByText(/Topic 4/, { exact: false }).first().waitFor();
  await close(continuation.page);
  await continuation.page.getByRole('button', { name: 'Review 2 missed topics', exact: true }).waitFor();
  await continuation.ctx.close();
  console.log('PASS: six missed topics continue in batches of four with keyboard checks');

  // Desktop, phone and narrow-phone appearance; no horizontal overflow in either theme.
  for (const [width,height,dark] of [[1440,1000,false],[1440,1000,true],[390,844,true],[320,740,false]]) {
    const view=await setup({width,height,dark,questions:[question('one'),question('two'),question('three','Fees','pr')],prog:[progress('two',{due:today,lastCorrect:false,lastChoice:'B',wrong:1})]});
    await view.page.screenshot({path:`${artifacts}/study-${width}-${dark?'dark':'light'}.png`});
    const overflow=await view.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth || [...document.querySelectorAll('[data-pane="study"] button')].some(el=>{const b=el.getBoundingClientRect();return b.width>0 && (b.left < -1 || b.right > innerWidth+1)}));
    assert.equal(overflow,false,`Overflow at ${width}`);
    await view.page.getByRole('button',{name:'Start studying',exact:true}).click();
    await answer(view.page);
    await view.page.screenshot({path:`${artifacts}/review-${width}-${dark?'dark':'light'}.png`});
    await view.ctx.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: 320, 390 and 1440 layouts, light and dark, no runtime errors');
} finally {await browser.close();await server.close();}

const { safetyFlows } = await import('./safety-flows.mjs');
await safetyFlows();

const { nextExamFlows } = await import('./next-exam-flows.mjs');
await nextExamFlows();
const { essayFlows } = await import('./essay-flows.mjs');
await essayFlows();
const { examFlows } = await import('./exam-flows.mjs');
await examFlows();
