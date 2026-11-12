import assert from 'node:assert/strict';
import fs from 'node:fs';
import {open,closeAll} from './mock.mjs';
export async function feedbackFlows(){
 fs.mkdirSync('artifacts/longevity',{recursive:true});let checks=0;
 try{
 for(const [width,height,dark] of [[390,844,false],[390,844,true],[1440,900,false],[1440,900,true],[820,1180,false]]){
  const s=await open({width,height,dark,hash:'#/q/il-03',now:'2026-11-12',reducedMotion:true}),p=s.page;p.setDefaultTimeout(5000);
  const q=s.data.state.questions.find(q=>q.id==='il-03');
  await p.getByRole('group',{name:'Answer choices'}).getByRole('button',{name:new RegExp('^'+q.answer+' ')}).click();
  await p.getByRole('button',{name:'Check answer',exact:true}).click();await p.getByRole('heading',{name:'Correct',exact:true}).waitFor();
  assert.equal(await p.evaluate(()=>document.getAnimations().some(a=>a.playState==='running')),false);checks++;
  await p.screenshot({path:`artifacts/longevity/feedback-${width}-${dark?'dark':'light'}.png`});
  await p.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await p.getByRole('dialog').waitFor({state:'hidden'});
  await s.goto('#/progress');await p.getByRole('heading',{name:'This week',exact:true}).waitFor();await p.screenshot({path:`artifacts/longevity/weekly-${width}-${dark?'dark':'light'}.png`});
  assert.deepEqual(s.errors,[]);checks++;await s.close();
 }
 const s=await open({hash:'#/q/il-03',reducedMotion:false}),p=s.page;
 await p.evaluate(()=>{window.feedbackDurations=[];const original=Element.prototype.animate;Element.prototype.animate=function(frames,options){window.feedbackDurations.push(options.duration);return original.call(this,frames,options);};});
 const q=s.data.state.questions.find(q=>q.id==='il-03');await p.getByRole('group',{name:'Answer choices'}).getByRole('button',{name:new RegExp('^'+q.answer+' ')}).click();await p.getByRole('button',{name:'Check answer',exact:true}).click();await p.getByRole('heading',{name:'Correct',exact:true}).waitFor();
 assert.ok((await p.evaluate(()=>window.feedbackDurations)).some(n=>n>0 && n<400));checks++;assert.deepEqual(s.errors,[]);await s.close();
 console.log(`PASS: feedback and weekly summary, ${checks} assertions at five size/theme combinations, reduced motion and sub-400ms feedback`);
 }finally{await closeAll();}
}
if(process.argv[1]?.endsWith('feedback-flows.mjs'))await feedbackFlows();
