import test from 'node:test';
import assert from 'node:assert/strict';
import {finalsPlan,holdDayGoal,studyNumbers,readyCards,inferredDone,reconcileDayWork} from '../src/helpers/studySession';
import {studyEngine,COURSE_KEYS,FINALS,EXAMS} from '../src/helpers/studyEngine';
import {emptyStudyRecord} from '../src/helpers/studyMaterials';
import {reminderPlan,eveningHour,reminderText} from '../supabase/functions/_shared/reminderPlan';
import {DEFAULT_SEMESTER,configureSemester} from '../supabase/functions/_shared/semester';
import {dateKey,setStudyTimeZone} from '../supabase/functions/_shared/dateKey';
const state={questions:Array.from({length:12},(_,i)=>({id:`q${i}`,course:COURSE_KEYS[i%3],topic:'Treaties',subtopic:'Rule',rule:'A verified rule',authority:'Authority',classDay:1,classDate:'2026-10-01',choices:[],answer:'A'})),progress:[],days:[],runs:[]} as any;
test('app and reminder use identical counts and held plan after mixed question/card work',()=>{
 try{configureSemester(DEFAULT_SEMESTER);const today='2026-11-12',e=studyEngine(state,today),record=emptyStudyRecord();
 const cards=[{id:'il-card',course:'il',front:'front',back:'back'}] as any;
 const done=inferredDone(e,record,[],cards),work=reconcileDayWork(today,0,done,null);
 const counts=Object.fromEntries(COURSE_KEYS.map(c=>{const q=readyCards(cards,e.ruleCards(c),record,state,c,today);return [c,{due:q.due.length,fresh:q.fresh.length}];})) as any;
 const raw=finalsPlan(e,{cards:counts,lastEssay:{},fallbackGoal:20,done,totalDone:work.total}),plan=holdDayGoal(raw,today,null),ready=readyCards(cards,e.ruleCards(),record,state,'all',today);
 const expected=studyNumbers(e,ready,plan,done,'all',work.total);
 const settings={[`dayplan:v1:${today}`]:JSON.stringify({config:JSON.stringify([FINALS,EXAMS]),saved:plan.saved,work,enabled:true})};
 assert.deepEqual(reminderPlan(state,settings,cards,today).numbers,expected);
 assert.match(reminderText(reminderPlan(state,settings,cards,today),[{title:'Submit weekly hours'}]),/Intl Law.*to go today.*Submit weekly hours/);
 }finally{configureSemester(DEFAULT_SEMESTER);}
});
test('reminder hour defaults to 21 and accepts midnight without accepting invalid hours',()=>{assert.equal(eveningHour(undefined),21);assert.equal(eveningHour('0'),0);assert.equal(eveningHour('23'),23);assert.equal(eveningHour('24'),21);});
test('shared date clock keeps late-night Houston study on the correct day',()=>{try{setStudyTimeZone('America/Chicago');assert.equal(dateKey.today(new Date('2026-11-13T04:00:00Z')),'2026-11-12');assert.equal(dateKey.hour(new Date('2026-11-13T04:00:00Z')),22);}finally{setStudyTimeZone();}});
test('parity includes overdue exam-window cards, rule cards, essay credit and held course quotas',()=>{
 try{
 configureSemester(DEFAULT_SEMESTER);
 const today='2026-11-29',bank=structuredClone(state);
 const p=(questionId:string,due:string,lastAt:string)=>({questionId,seen:1,correct:1,wrong:0,box:2,due,lastAt,lastCorrect:true,lastChoice:'A',guessed:0,missSneaky:0,missAverage:0,missBad:0,starred:false,flagged:false});
 bank.progress=[p('q0','2026-12-12','2026-11-20T12:00:00Z'),p('q3','2026-12-12',`${today}T12:00:00Z`),p('q5','2026-12-15','2026-11-20T12:00:00Z')];bank.days=[{date:today,answered:10,correct:8}];
 const cards=[{id:'il-card',course:'il',kind:'flashcard',front:'Front',back:'Back',reason:'Reason',authority:'Authority',class_date:'2026-10-01'},{id:'pr-card',course:'pr',kind:'flashcard',front:'Front',back:'Back',reason:'Reason',authority:'Authority',class_date:'2026-10-01'}] as any;
 const record=emptyStudyRecord();record.cards={'il-card':{seen:1,correct:1,box:2,due:'2026-12-12',last_at:'2026-11-20T12:00:00Z'},'pr-card':{seen:1,correct:1,box:2,due:'2026-12-15',last_at:`${today}T12:00:00Z`}};
 const essays=[{day:today,course:'il',minutes:15}] as any,e=studyEngine(bank,today),done=inferredDone(e,record,essays,cards),work=reconcileDayWork(today,10,done,null);
 const counts=Object.fromEntries(COURSE_KEYS.map(c=>{const q=readyCards(cards,e.ruleCards(c),record,bank,c,today);return[c,{due:q.due.length,fresh:q.fresh.length}];})) as any;
 for(const enabled of [true,false]){
 const raw=finalsPlan(e,{cards:counts,lastEssay:{il:today},fallbackGoal:20,done,totalDone:work.total,planOn:enabled}),held={date:today,goal:20,targets:{il:8,asy:6,pr:6}},plan=holdDayGoal(raw,today,held,enabled?undefined:20);
 const ready=readyCards(cards,e.ruleCards(),record,bank,'all',today),expected=studyNumbers(e,ready,plan,done,'all',work.total);
 const settings:Record<string,string>={[`dayplan:v1:${today}`]:JSON.stringify({config:JSON.stringify([FINALS,EXAMS]),saved:held,work,enabled}),'written:v1:essay':JSON.stringify(essays[0])};
 for(const [id,value]of Object.entries(record.cards))settings[`study:v1:cards:${id}`]=JSON.stringify(value);
 assert.deepEqual(reminderPlan(bank,settings,cards,today).numbers,expected);
 }
 }finally{configureSemester(DEFAULT_SEMESTER);}
});
test('eve reminder uses the app’s held finite Last pass instead of its ordinary daily quota',()=>{
 try{const today='2026-12-01',plan=reminderPlan(state,{[`lastpass:v1:${today}`]:JSON.stringify({course:'il',ids:['q0','q3','q6'],done:['q0']})},[],today);assert.equal(plan.numbers.goal,3);assert.equal(plan.numbers.answered,1);assert.equal(plan.numbers.left,2);assert.equal(plan.next?.course,'il');}finally{configureSemester(DEFAULT_SEMESTER);}
});
