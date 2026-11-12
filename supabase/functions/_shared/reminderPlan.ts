import {dateKey} from './dateKey.ts';
import { studyEngine,COURSE_KEYS,COURSES,FINALS,EXAMS,type CourseCode } from './studyEngine.ts';
import { finalsPlan,holdDayGoal,inferredDone,reconcileDayWork,readyCardCounts,studyNumbers,type DayGoal,type DayWork } from './studyPlan.ts';
import { configureSemester,parseSemester } from './semester.ts';
import type { State } from './types.ts';
export type DayPlanSnapshot={config:string;saved:DayGoal;work:DayWork;enabled:boolean};
const json=<T>(value:string|undefined,fallback:T):T=>{try{return value===undefined?fallback:JSON.parse(value);}catch{return fallback;}};
export function reminderPlan(state:State,settings:Record<string,string>,cards:{id:string;course:CourseCode}[],today:string){
 configureSemester(parseSemester(settings['semester:v1']));
 const e=studyEngine(state,today),progress:Record<string,{due:string;last_at:string}>={},essays:{day:string;course:CourseCode;minutes?:number}[]=[],lastEssay:Partial<Record<CourseCode,string>>={};
 for(const [key,value] of Object.entries(settings)){
  if(key.startsWith('study:v1:cards:')){const p=json<any>(value,null);if(p && typeof p.due==='string' && typeof p.last_at==='string')progress[key.slice('study:v1:cards:'.length)]=p;}
  if(key.startsWith('written:v1:')){const essay=json<any>(value,null);if(essay && COURSE_KEYS.includes(essay.course) && typeof essay.day==='string'){essays.push(essay);if(!lastEssay[essay.course as CourseCode] || essay.day>lastEssay[essay.course as CourseCode]!)lastEssay[essay.course as CourseCode]=essay.day;}}
 }
 const held=json<DayPlanSnapshot|null>(settings[`dayplan:v1:${today}`],null);
 const config=JSON.stringify([FINALS,EXAMS]);
 const work=reconcileDayWork(today,e.todayCount?.answered??0,inferredDone(e,{cards:progress},essays,cards),held?.work??null);
 const counts=Object.fromEntries(COURSE_KEYS.map(c=>[c,readyCardCounts(e,cards,progress,c)])) as Record<CourseCode,{due:number;fresh:number}>;
 const fallbackGoal=Number(settings.daily_goal??20),raw=finalsPlan(e,{cards:counts,lastEssay,fallbackGoal,done:work.done,totalDone:work.total,planOn:held?.enabled??true});
 const plan=holdDayGoal(raw,today,held?.config===config?held.saved:null,raw.active?undefined:fallbackGoal);
 const active=plan.courses.map(c=>c.course),due=active.reduce((n,c)=>n+counts[c].due,0),fresh=active.reduce((n,c)=>n+counts[c].fresh,0);
 const numbers=studyNumbers(e,{due:Array(due),fresh:Array(fresh)},plan,work.done,'all',work.total);
 const next=COURSE_KEYS.filter(c=>FINALS[c]>today || FINALS[c]===today && dateKey.hour()<18).sort((a,b)=>FINALS[a].localeCompare(FINALS[b]))[0];
 return {numbers,next:next?{course:next,name:COURSES[next].short,date:FINALS[next]}:null,plan};
}
export function eveningHour(value:string|undefined){const n=Number(value??21);return Number.isInteger(n)&&n>=0&&n<=23?n:21;}
export function reminderText(plan:ReturnType<typeof reminderPlan>,tasks:{title:string}[]){
 return [plan.next?`${plan.next.name} · ${plan.numbers.left} to go today`:`${plan.numbers.left} to go today`,...tasks.map(t=>t.title)].join(' · ');
}
