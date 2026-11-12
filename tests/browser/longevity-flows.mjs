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
 await s.goto('#/tool/Semester');
 await p.getByRole('textbox',{name:'Semester name',exact:true}).waitFor();
 await p.getByLabel('Pro Res exam date',{exact:true}).fill('2027-03-20');
 await p.screenshot({path:`artifacts/longevity/semester-${width}-${dark?'dark':'light'}.png`});
 await p.keyboard.press('Escape');await p.getByRole('dialog').waitFor({state:'hidden'});await p.waitForTimeout(600);
 await p.getByRole('navigation',{name:'Sections'}).getByRole('button',{name:'Study',exact:true}).click();
 assert.ok(s.rows.some(r=>r.key==='semester:v1' && JSON.parse(r.value).courses.find(c=>c.code==='pr').final==='2027-03-20'));count++;
 await p.locator('[data-pane="study"]').getByText('days · Mar 20',{exact:true}).waitFor();
 await p.getByRole('navigation',{name:'Sections'}).getByRole('button',{name:'Progress',exact:true}).click();await p.getByRole('button',{name:'Semester recap',exact:true}).click();
 await p.getByRole('dialog',{name:'Fall 2026 recap',exact:true}).waitFor();
 await p.screenshot({path:`artifacts/longevity/recap-${width}-${dark?'dark':'light'}.png`});
 await p.keyboard.press('Escape');count++;
 assert.deepEqual(s.errors,[]);await s.close();
 }console.log(`PASS: longevity workspaces, ${count} assertions, five size/theme combinations`);
 }finally{await closeAll();}
}
if(process.argv[1]?.endsWith('longevity-flows.mjs'))await longevityFlows();
