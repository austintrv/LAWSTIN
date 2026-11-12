import { useEffect, useRef } from "react";
import { dateKey } from "./dateKey";
import { toast } from "./toast";
import type { UnitStatus } from "./studySession";
export function useLearningMilestones(units: UnitStatus[], ready: boolean, userId: string) {
  const key = `lawstin-learning:${userId}`;
  const saved = useRef<{ seen: string[]; solid: Record<string,string> } | null>(null);
  if (!saved.current) { try { saved.current = JSON.parse(localStorage.getItem(key) ?? "null"); } catch {} }
  const yesterday = dateKey.addDays(dateKey.today(), -1);
  const solidYesterday = Object.values(saved.current?.solid ?? {}).includes(yesterday);
  useEffect(() => {
    if (!ready) return;
    const current = units.filter(u => u.status === "solid");
    const prior = saved.current;
    const next = prior ?? { seen: current.map(u => `${u.course}|${u.topic}`), solid: {} };
    for (const u of current) {
      const id = `${u.course}|${u.topic}`;
      if (next.seen.includes(id)) continue;
      next.seen.push(id); next.solid[id] = dateKey.today();
      toast.success(`${u.topic} · Solid`);
    }
    saved.current = next;
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  }, [JSON.stringify(units), ready, key]);
  return { solidYesterday };
}
