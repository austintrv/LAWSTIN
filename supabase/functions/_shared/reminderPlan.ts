import {dateKey} from './dateKey.ts';
import type {TopicReview} from './topicReview.ts';
import { studyEngine,COURSE_KEYS,COURSES,FINALS,EXAMS,type CourseCode,type SessionCard,type Syllabus,itemId } from './studyEngine.ts';
import { finalsPlan,holdDayGoal,inferredDone,reconcileDayWork,readyCardCounts,studyNumbers,examMoment,lastPass,type DayGoal,type DayWork } from './studyPlan.ts';
import { configureSemester,parseSemester } from './semester.ts';
import type { State } from './types.ts';
export type DayPlanSnapshot={config:string;saved:DayGoal;work:DayWork;enabled:boolean};
const json=<T>(value:string|undefined,fallback:T):T=>{try{return value===undefined?fallback:JSON.parse(value);}catch{return fallback;}};
export function reminderPlan(state:State,settings:Record<string,string>,cards:(Pick<SessionCard,"id"|"course"> & Partial<SessionCard>)[],today:string){
 configureSemester(parseSemester(settings['semester:v1']));
 const reviews:Record<string,TopicReview>={},weak=new Map<string,{at:string;day:string;weak:boolean}>();
 const progress:Record<string,{due:string;last_at:string}>={},essays:{day:string;course:CourseCode;minutes?:number}[]=[],lastEssay:Partial<Record<CourseCode,string>>={};
 for(const [key,value] of Object.entries(settings)){
  if(key.startsWith('study:v1:reviews:')){const r=json<TopicReview|null>(value,null);if(r?.questions)reviews[key.slice('study:v1:reviews:'.length)]=r;}
  if(key.startsWith('study:v1:cards:')){const p=json<any>(value,null);if(p && typeof p.due==='string' && typeof p.last_at==='string')progress[key.slice('study:v1:cards:'.length)]=p;}
  if(key.startsWith('written:v1:') || key.startsWith('spot:v1:')){const r=json<any>(value,null);if(r?.topic && r?.course && r?.day){const id=`${r.course}|${r.topic}`;if(!weak.has(id) || r.at>weak.get(id)!.at)weak.set(id,{at:r.at,day:r.day,weak:r.grade?r.grade.score<7:r.caught*2<r.total});}}
  if(key.startsWith('written:v1:')){const essay=json<any>(value,null);if(essay && COURSE_KEYS.includes(essay.course) && typeof essay.day==='string'){essays.push(essay);if(!lastEssay[essay.course as CourseCode] || essay.day>lastEssay[essay.course as CourseCode]!)lastEssay[essay.course as CourseCode]=essay.day;}}
 }
 const e=studyEngine(state,today,{reviews,weakExtra:[...weak].filter(([,r])=>r.weak && r.day>=dateKey.addDays(today,-14)).map(([id])=>id)});
 const held=json<DayPlanSnapshot|null>(settings[`dayplan:v1:${today}`],null);
 const config=JSON.stringify([FINALS,EXAMS]);
 const work=reconcileDayWork(today,e.todayCount?.answered??0,inferredDone(e,{cards:progress},essays,cards),held?.work??null);
 const counts=Object.fromEntries(COURSE_KEYS.map(c=>[c,readyCardCounts(e,cards,progress,c)])) as Record<CourseCode,{due:number;fresh:number}>;
 const fallbackGoal=Number(settings.daily_goal??20),raw=finalsPlan(e,{cards:counts,lastEssay,fallbackGoal,done:work.done,totalDone:work.total,planOn:held?.enabled??true});
 const plan=holdDayGoal(raw,today,held?.config===config?held.saved:null,raw.active?undefined:fallbackGoal);
 const active=plan.courses.map(c=>c.course),due=active.reduce((n,c)=>n+counts[c].due,0),fresh=active.reduce((n,c)=>n+counts[c].fresh,0);
 let numbers=studyNumbers(e,{due:Array(due),fresh:Array(fresh)},plan,work.done,'all',work.total);
 const moment=examMoment(today);
 if(moment.kind==="morning" || moment.kind==="done")numbers={...numbers,goal:0,left:0};
 if(moment.kind==="eve" && moment.course){
  const saved=json<{course:CourseCode;ids:string[];done:string[]}|null>(settings[`lastpass:v1:${today}`],null);
  const syllabus:Syllabus={};for(const c of COURSE_KEYS)syllabus[c]=json<{units:Syllabus[CourseCode]}>(settings[`syllabus:v1:${c}`],{units:[]}).units;
  const pool=[...cards.map(c=>({...c,topic:c.topic??'',front:c.front??'',back:c.back??'',reason:c.reason??'',authority:c.authority??''})),...e.ruleCards(moment.course)] as SessionCard[];
  const ids=saved?.course===moment.course?saved.ids:lastPass(e,moment.course,pool,{cards:progress},syllabus).map(itemId);
  const answered=saved?.course===moment.course?ids.filter(id=>saved.done.includes(id)).length:0;
  numbers={...numbers,goal:ids.length,answered,left:Math.max(0,ids.length-answered)};
 }
 const next=COURSE_KEYS.filter(c=>FINALS[c]>today || FINALS[c]===today && dateKey.hour()<18).sort((a,b)=>FINALS[a].localeCompare(FINALS[b]))[0];
 return {numbers,next:next?{course:next,name:COURSES[next].short,date:FINALS[next]}:null,plan};
}
export function eveningHour(value:string|undefined){const n=Number(value??21);return Number.isInteger(n)&&n>=0&&n<=23?n:21;}
export function reminderText(plan:ReturnType<typeof reminderPlan>,tasks:{title:string}[]){
 return [plan.next?`${plan.next.name} · ${plan.numbers.left} to go today`:`${plan.numbers.left} to go today`,...tasks.map(t=>t.title)].join(' · ');
}
