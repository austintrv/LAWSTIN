import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SEMESTER,parseSemester} from '../src/helpers/semester';
import {applySemester} from '../src/helpers/useSemester';
import {FINALS,studyEngine} from '../src/helpers/studyEngine';
import {examMoment,finalsPlan} from '../src/helpers/studySession';
import {makeSemesterRecap} from '../src/helpers/semesterRecap';
test('semester parsing preserves defaults and rejects invalid dates and unknown codes',()=>{
 assert.deepEqual(parseSemester(null),DEFAULT_SEMESTER);assert.deepEqual(parseSemester('broken'),DEFAULT_SEMESTER);
 const next=parseSemester({name:'MPRE',courses:[{code:'pr',final:'2027-03-20',format:'mc',notes:'closed'},{code:'il',final:'2026-02-30'},{code:'new'}]});
 assert.equal(next.courses[2].final,'2027-03-20');assert.equal(next.courses[0].final,'2026-12-02');assert.equal(next.courses.length,5);
});
test('moving an exam date brings its existing bank back into the plan and eve view',()=>{
 try{applySemester(parseSemester({courses:[{code:'pr',final:'2027-03-20'}]}));assert.equal(FINALS.pr,'2027-03-20');assert.deepEqual(examMoment('2027-03-19',12),{kind:'eve',course:'pr'});assert.equal(finalsPlan(studyEngine(undefined,'2027-03-18'),{cards:{il:{due:0,fresh:0},asy:{due:0,fresh:0},pr:{due:0,fresh:0}},lastEssay:{},fallbackGoal:20}).active,true);}finally{applySemester(DEFAULT_SEMESTER);}
});
test('recap captures totals, essays, solid units and five most-missed rules',()=>{
 const state={questions:[{id:'q',rule:'A rule',authority:'An authority'}],progress:[{questionId:'q',wrong:3}],days:[{date:'2026-11-10',answered:5,correct:3},{date:'2026-11-11',answered:2,correct:2}],runs:[]} as any;
 const recap=makeSemesterRecap('Fall 2026',state,[{course:'il',topic:'Treaties',status:'solid'}],[{day:'2026-11-10',grade:{score:8}}] as any,'2026-12-10');
 assert.equal(recap.answers,7);assert.equal(recap.days,2);assert.equal(recap.average,8);assert.equal(recap.solid[0].count,1);assert.equal(recap.rules[0].wrong,3);
});
