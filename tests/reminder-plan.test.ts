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
