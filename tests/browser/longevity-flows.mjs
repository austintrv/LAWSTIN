import assert from 'node:assert/strict';
import fs from 'node:fs';
import {open,closeAll} from './mock.mjs';
export async function longevityFlows(){
 fs.mkdirSync('artifacts/longevity',{recursive:true});let count=0;
 try{for(const [width,height,dark] of [[390,844,false],[390,844,true],[1440,900,false],[1440,900,true],[820,1180,false]]){
 const s=await open({width,height,dark,hash:'#/courses/clinic',now:'2026-11-12'}),p=s.page;p.setDefaultTimeout(5000);
 await p.getByRole('button',{name:/^87.5 of 200/}).waitFor();
 await p.getByRole('button',{name:/^Submit weekly hour log/}).click();
 await p.getByRole('combobox',{name:'Repeat task'}).selectOption('weekly');
 const before=s.tasks.length;await p.getByRole('button',{name:'Mark done',exact:true}).first().click();
 await p.waitForTimeout(800);assert.equal(s.tasks.length,before+1);assert.ok(s.tasks.some(t=>t.due==='2026-11-17'));count++;
 await p.getByRole('button',{name:'Add hours',exact:true}).click();await p.getByRole('spinbutton',{name:'Hours logged'}).fill('2');await p.getByRole('button',{name:'Save hours',exact:true}).click();
 await p.getByRole('button',{name:/^89.5 of 200/}).waitFor();await p.getByRole('button',{name:'Undo',exact:true}).click();await p.getByRole('button',{name:/^87.5 of 200/}).waitFor();count++;
 await p.screenshot({path:`artifacts/longevity/workspace-${width}-${dark?'dark':'light'}.png`});
 const handle=p.getByRole('button',{name:/^Reorder /}).first();await handle.focus();await p.keyboard.press('ArrowDown');await p.waitForTimeout(200);assert.ok(s.rows.some(r=>r.key==='workspace:task-order:clinic'));count++;
 assert.deepEqual(s.errors,[]);await s.close();
 }console.log(`PASS: longevity workspaces, ${count} assertions, five size/theme combinations`);
 }finally{await closeAll();}
}
if(process.argv[1]?.endsWith('longevity-flows.mjs'))await longevityFlows();
