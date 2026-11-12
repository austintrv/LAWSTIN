import type { OutputType as State } from '../endpoints/state_GET.schema';
import type { UnitStatus } from './studySession';
import { streakHistory } from './studySession';
import type { WrittenEntry } from './useWritten';
export type SemesterRecap = {name:string;at:string;answers:number;days:number;streak:number;essays:number;average:number|null;solid:{course:string;count:number;total:number}[];rules:{id:string;rule:string;authority:string|null;wrong:number}[]};
export function makeSemesterRecap(name:string,state:State,units:UnitStatus[],essays:WrittenEntry[],today:string):SemesterRecap{
 const days=state.days.filter(d=>d.date<=today && d.answered>0), written=essays.filter(e=>e.day<=today);
 return {name,at:today,answers:days.reduce((n,d)=>n+d.answered,0),days:days.length,streak:streakHistory(days,today).best,essays:written.length,average:written.length?written.reduce((n,e)=>n+e.grade.score,0)/written.length:null,
 solid:['il','asy','pr'].map(course=>({course,count:units.filter(u=>u.course===course && u.status==='solid').length,total:units.filter(u=>u.course===course).length})),
 rules:[...state.progress].filter(p=>p.wrong>0).sort((a,b)=>b.wrong-a.wrong).flatMap(p=>{const q=state.questions.find(q=>q.id===p.questionId);return q?.rule?[{id:q.id,rule:q.rule,authority:q.authority,wrong:p.wrong}]:[];}).slice(0,5)};
}
