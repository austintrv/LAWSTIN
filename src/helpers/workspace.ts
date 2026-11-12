import { dateKey } from './dateKey';
export type RepeatRule = 'weekly' | 'fortnightly' | null;
export function nextRepeatDate(due: string | null, repeat: RepeatRule, today = dateKey.today()) { return repeat ? dateKey.addDays(due ?? today, repeat === 'weekly' ? 7 : 14) : null; }
/** The next occurrence's id: stable for one task and date (so a replay never makes two), 128 bits so it never meets another task. */
export function repeatId(id: string, due: string) {
  const text = `${id}:${due}`;
  const hex = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; }
    return (h ^ (h >>> 15)).toString(16).padStart(8, "0").slice(-8);
  }).join("");
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
