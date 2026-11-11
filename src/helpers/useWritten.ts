import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { GradeDTO, SpotterDTO } from "../endpoints/ai_POST.schema";
import { dateKey } from "./dateKey";
import { readCache, writeCache } from "./offlineCache";
import { supabase } from "./supabase";
import { FINALS, type CourseCode } from "./studyEngine";
import type { Hypothetical } from "./studyMaterials";

export const WRITTEN_PREFIX = "written:v1:";
export type EssayLength = "short" | "full";
export type WrittenDraft = { spot: SpotterDTO; answer: string; seconds?: number; ready?: boolean; attemptOf?: string };
export const draftKey = (spot: SpotterDTO) => spot.materialId ?? JSON.stringify([spot.course, spot.topic, spot.facts, spot.call]);
export function readDrafts(): Record<string, WrittenDraft> {
  const drafts = readCache<Record<string, WrittenDraft>>("written-drafts") ?? {};
  try {
    const old = JSON.parse(localStorage.getItem("lawstin-written") ?? "null");
    if (old?.spot && !old.grade) { drafts[draftKey(old.spot)] ??= old; writeCache("written-drafts", drafts); }
    localStorage.removeItem("lawstin-written");
  } catch { /* No legacy draft. */ }
  return drafts;
}
export function saveDraft(draft: WrittenDraft) {
  localStorage.setItem("lawstin-cache:written-drafts", JSON.stringify({ ...readDrafts(), [draftKey(draft.spot)]: draft }));
}
export function removeDraft(spot: SpotterDTO) {
  const drafts = readDrafts(); delete drafts[draftKey(spot)];
  localStorage.setItem("lawstin-cache:written-drafts", JSON.stringify(drafts));
}
export type WrittenEntry = {
  id: string; at: string; day: string; course: CourseCode; topic: string; materialId?: string; attemptOf?: string;
  facts: string; call: string; answer: string; words: number; seconds: number; minutes?: number; grade: GradeDTO;
};
export type SpotEntry = {
  id: string; at: string; day: string; course: CourseCode; topic: string;
  caught: number; total: number; missed: string[]; lines: string;
};
const valid = (e: unknown): e is WrittenEntry => {
  const x = e as WrittenEntry;
  return !!x && typeof x.id === "string" && typeof x.at === "string" && typeof x.day === "string" && typeof x.topic === "string" && !!x.grade && typeof x.grade.score === "number";
};
const validSpot = (e: unknown): e is SpotEntry => {
  const x = e as SpotEntry;
  return !!x && typeof x.id === "string" && typeof x.at === "string" && typeof x.day === "string" && ["il", "asy"].includes(x.course) && typeof x.topic === "string"
    && Number.isInteger(x.total) && x.total > 0 && Number.isInteger(x.caught) && x.caught >= 0 && x.caught <= x.total && Array.isArray(x.missed) && typeof x.lines === "string";
};
export function scoreSpot(h: Hypothetical, marks: Record<number, boolean>, lines: string, at = new Date().toISOString()): SpotEntry {
  const missed = h.answer.filter((_, i) => !marks[i]).map(a => a.issue);
  return { id: h.id, at, day: dateKey.today(new Date(at)), course: h.course, topic: h.topic, caught: h.answer.length - missed.length, total: h.answer.length, missed, lines };
}
export function nextSpotHypo(hypos: Hypothetical[], course: CourseCode, spots: SpotEntry[], weak: Set<string>, skip?: string) {
  return hypos.filter(h => h.course === course && h.course !== "pr" && h.id !== skip && !spots.some(s => s.id === h.id))
    .sort((a, b) => Number(weak.has(`${b.course}|${b.topic}`)) - Number(weak.has(`${a.course}|${a.topic}`)) || b.class_date.localeCompare(a.class_date))[0];
}
export const spotCredit = (e: SpotEntry) => Math.round(e.caught / e.total * 2);
export function defaultEssayLength(course: CourseCode, last: EssayLength = "short", today = dateKey.today()): EssayLength {
  const days = dateKey.diff(today, FINALS[course]);
  return days >= 0 && days <= 7 ? "full" : last;
}
export function essayGroups(list: WrittenEntry[]) {
  const groups = new Map<string, WrittenEntry[]>();
  const roots = new Map(list.map(e => [e.id, e]));
  const prompt = (e: WrittenEntry) => JSON.stringify([e.course, e.materialId ?? [e.facts, e.call]]);
  for (const e of [...list].sort((a, b) => a.at.localeCompare(b.at))) {
    const key = prompt(roots.get(e.attemptOf ?? "") ?? e);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.values()].sort((a, b) => b[b.length - 1].at.localeCompare(a[a.length - 1].at));
}
export function essayTrend(list: WrittenEntry[], course: CourseCode) {
  const essays = list.filter(e => e.course === course).sort((a, b) => a.at.localeCompare(b.at));
  const graded = essays.filter(e => e.grade.rubric);
  const average = (part: "issues" | "rules" | "application") => graded.length ? graded.reduce((n, e) => n + e.grade.rubric![part], 0) / graded.length : null;
  return { essays, rubric: { issues: average("issues"), rules: average("rules"), application: average("application") } };
}
export function weakWrittenTopics(essays: WrittenEntry[], spots: SpotEntry[], today = dateKey.today()) {
  const latest = new Map<string, { at: string; day: string; weak: boolean }>();
  const entries = [...essays.map(e => ({ ...e, weak: e.grade.score < 7 })), ...spots.map(e => ({ ...e, weak: e.caught * 2 < e.total }))];
  for (const e of entries.sort((a, b) => b.at.localeCompare(a.at))) {
    const key = `${e.course}|${e.topic}`; if (!latest.has(key)) latest.set(key, e);
  }
  return [...latest].filter(([, e]) => e.weak && e.day >= dateKey.addDays(today, -14)).map(([key]) => key);
}

type Entry = { id: string; at: string };
const pendingKey = (name: string) => name === "written" ? "lawstin-written-pending" : "lawstin-cache:spot-pending";
function pending<T>(name: string, check: (x: unknown) => x is T): T[] {
  try { return (JSON.parse(localStorage.getItem(pendingKey(name)) ?? "[]") as unknown[]).filter(check); } catch { return []; }
}
function writePending(name: string, list: Entry[]) {
  if (list.length) localStorage.setItem(pendingKey(name), JSON.stringify(list)); else localStorage.removeItem(pendingKey(name));
}
export const readPendingWritten = () => pending("written", valid);
const sort = <T extends Entry>(list: T[]): T[] => [...new Map([...list].sort((a, b) => a.at.localeCompare(b.at)).map(e => [e.id, e])).values()].sort((a, b) => b.at.localeCompare(a.at));
const sending = new Map<string, Promise<void>>();
function useEntries<T extends Entry>(name: string, prefix: string, check: (x: unknown) => x is T) {
  const qc = useQueryClient();
  const key = useMemo(() => [`lawstin-${name}`], [name]);
  const send = useCallback(() => {
    if (sending.has(name)) return sending.get(name)!;
    if (!navigator.onLine || !pending(name, check).length) return Promise.resolve();
    const promise = (async () => {
      for (let list = pending(name, check); list.length && navigator.onLine; list = pending(name, check)) {
        const { error } = await supabase.from("app_settings").upsert(list.map(e => ({ key: `${prefix}${e.id}`, value: JSON.stringify(e), updated_at: e.at })), { onConflict: "key" }).abortSignal(AbortSignal.timeout(10000));
        if (error) throw error;
        writePending(name, pending(name, check).filter(e => !list.some(sent => sent.id === e.id && sent.at === e.at)));
      }
    })().finally(() => sending.delete(name));
    sending.set(name, promise); return promise;
  }, [name, prefix, check]);
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<T[]> => {
      await send().catch(() => {});
      const rows: T[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error } = await supabase.from("app_settings").select("value").like("key", `${prefix}%`).order("key").range(start, start + 999);
        if (error) throw error;
        for (const r of data ?? []) { try { const e = JSON.parse(r.value); if (check(e)) rows.push(e); } catch { /* Skip malformed rows. */ } }
        if ((data?.length ?? 0) < 1000) break;
      }
      return sort([...rows, ...pending(name, check)]);
    },
    initialData: () => sort([...(readCache<T[]>(name) ?? []).filter(check), ...pending(name, check)]), initialDataUpdatedAt: 0,
  });
  useEffect(() => {
    const retry = () => { void send().catch(() => {}); };
    const timer = setInterval(retry, 15000); window.addEventListener("online", retry);
    return () => { clearInterval(timer); window.removeEventListener("online", retry); };
  }, [send]);
  useEffect(() => { if (query.data) writeCache(name, query.data); }, [name, query.data]);
  const add = useCallback((entry: T) => {
    writePending(name, sort([...pending(name, check), entry]));
    void qc.cancelQueries({ queryKey: key });
    qc.setQueryData<T[]>(key, old => { const list = sort([...(old ?? []), entry]); writeCache(name, list); return list; });
    void send().catch(() => {});
  }, [name, check, key, qc, send]);
  return { list: query.data ?? [], add };
}
export function useWritten() {
  const { list, add } = useEntries("written", WRITTEN_PREFIX, valid);
  const { list: spots, add: addSpot } = useEntries("spot", "spot:v1:", validSpot);
  return useMemo(() => {
    const lastEssay: Partial<Record<CourseCode, string>> = {};
    for (const e of list) if (!lastEssay[e.course] || e.day > lastEssay[e.course]!) lastEssay[e.course] = e.day;
    return { list, add, spots, addSpot, lastEssay, weak: weakWrittenTopics(list, spots), done: new Set(list.map(e => e.materialId).filter(Boolean) as string[]) };
  }, [list, add, spots, addSpot]);
}
