import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRepeatDate, repeatId, hoursTotal, weeklyHours, reorder } from '../src/helpers/workspace';
test('weekly and fortnightly repeats cross month and year ends from the due date',()=>{
 assert.equal(nextRepeatDate('2026-12-29','weekly'),'2027-01-05');assert.equal(nextRepeatDate('2026-12-29','fortnightly'),'2027-01-12');assert.equal(nextRepeatDate(null,'weekly','2026-11-12'),'2026-11-19');assert.equal(nextRepeatDate('2026-11-12',null),null);
 assert.equal(repeatId('a','2026-11-19'),repeatId('a','2026-11-19'));assert.notEqual(repeatId('a','2026-11-19'),repeatId('a','2026-11-26'));
 const ids=new Set(Array.from({length:3000},(_,i)=>repeatId(`task-${i}`,i%2?'2026-11-19':'2026-11-26')));assert.equal(ids.size,3000);assert.match([...ids][0],/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('hours preserve the starting total and include edits exactly once',()=>{const entries=[{id:'a',date:'2026-11-12',hours:1.26,note:''},{id:'b',date:'2026-11-11',hours:2,note:''}];assert.equal(hoursTotal({base:113.74,entries}),117);assert.equal(hoursTotal({base:113.74,entries:entries.slice(1)}),115.74);assert.equal(weeklyHours(entries,'2026-11-12').reduce((n,d)=>n+d.hours,0),3.26);});
test('reordering keeps every task once',()=>{assert.deepEqual(reorder(['a','b','c'],'c','a'),['c','a','b']);assert.deepEqual(reorder(['a','b','c'],'a','c'),['b','a','c']);});
