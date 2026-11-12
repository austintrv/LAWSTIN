import { dateKey } from './dateKey';
export type RepeatRule = 'weekly' | 'fortnightly' | null;
export function nextRepeatDate(due: string | null, repeat: RepeatRule, today = dateKey.today()) { return repeat ? dateKey.addDays(due ?? today, repeat === 'weekly' ? 7 : 14) : null; }
export function repeatId(id: string, due: string) {
  let h = 2166136261;
  const hex = Array.from({length:32}, (_,i) => { h = Math.imul(h ^ `${id}:${due}:${i}`.split('').reduce((n,c)=>n+c.charCodeAt(0),0),16777619); return (h>>>0).toString(16).slice(-1); }).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20)}`;
}
export type HoursEntry = { id: string; date: string; hours: number; note: string };
export type HoursLog = { base: number; entries: HoursEntry[] };
export const hoursTotal = (log: HoursLog) => Math.round((log.base + log.entries.reduce((n,e)=>n+e.hours,0))*100)/100;
export function weeklyHours(entries: HoursEntry[], today = dateKey.today()) {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = dateKey.addDays(today,-((weekday+6)%7));
  return Array.from({length:7},(_,i)=> { const date=dateKey.addDays(monday,i); return { date, hours: entries.filter(e=>e.date===date).reduce((n,e)=>n+e.hours,0) }; });
}
export function reorder(ids: string[], id: string, before: string) { const next=ids.filter(x=>x!==id), at=next.indexOf(before); next.splice(at<0?next.length:at,0,id); return next; }
