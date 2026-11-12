import { dateKey } from "./dateKey";
import type { UnitStatus } from "./studySession";
import type { WrittenEntry } from "./useWritten";
import type { CoverageStatus } from "./studyEngine";
export type WeekSnapshot = { week:string; units:UnitStatus[]; missed:string[] };
export function weekStart(today: string) {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return dateKey.addDays(today, -((weekday+6)%7));
}
const rank:Record<CoverageStatus,number> = {none:0,unseen:1,shaky:2,learning:3,solid:4};
export function weeklyDiff(snapshot:WeekSnapshot, units:UnitStatus[], missed:string[], essays:WrittenEntry[], today:string) {
  const before=new Map(snapshot.units.map(u=>[`${u.course}|${u.topic}`,u.status]));
  const moved=units.flatMap(u=>{const from=before.get(`${u.course}|${u.topic}`);return from && rank[u.status]>rank[from] ? [{...u,from}] : [];});
  const written=essays.filter(e=>e.day>=snapshot.week && e.day<=today);
  return {moved,cleaned:snapshot.missed.filter(id=>!missed.includes(id)),essays:written.length,average:written.length ? written.reduce((n,e)=>n+e.grade.score,0)/written.length : null};
}
