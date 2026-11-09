import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { GradeDTO } from "../endpoints/ai_POST.schema";
import { dateKey } from "./dateKey";
import { readCache, writeCache } from "./offlineCache";
import { supabase } from "./supabase";
import type { CourseCode } from "./studyEngine";

export const WRITTEN_PREFIX = "written:v1:";
const PENDING = "lawstin-written-pending";
/** One graded essay, kept with its prompt so it can be reread later. */
export type WrittenEntry = {
  id: string; at: string; day: string; course: CourseCode; topic: string;
  /** The study material the prompt came from, when it was a verified hypothetical. */
  materialId?: string;
  facts: string; call: string; answer: string; words: number; seconds: number; minutes?: number; grade: GradeDTO;
};
const valid = (e: unknown): e is WrittenEntry => {
  const x = e as WrittenEntry;
  return !!x && typeof x.id === "string" && typeof x.day === "string" && typeof x.topic === "string" && !!x.grade && typeof x.grade.score === "number";
};
const readPending = (): WrittenEntry[] => { try { return (JSON.parse(localStorage.getItem(PENDING) ?? "[]") as unknown[]).filter(valid); } catch { return []; } };
const writePending = (list: WrittenEntry[]) => { try { if (list.length) localStorage.setItem(PENDING, JSON.stringify(list)); else localStorage.removeItem(PENDING); } catch { /* storage blocked */ } };
const KEY = ["lawstin-written"] as const;
const sort = (list: WrittenEntry[]) => [...new Map(list.map((e) => [e.id, e])).values()].sort((a, b) => b.at.localeCompare(a.at));

/** Graded essays (`written:v1:<id>` rows), newest first. An essay graded offline is sent when the connection returns. */
export function useWritten() {
  const qc = useQueryClient();
  const send = useCallback(async (list: WrittenEntry[]) => {
    if (!list.length) return;
    const { error } = await supabase.from("app_settings").upsert(list.map((e) => ({ key: `${WRITTEN_PREFIX}${e.id}`, value: JSON.stringify(e), updated_at: e.at })), { onConflict: "key" });
    if (error) throw error;
    const sent = new Set(list.map((e) => e.id));
    writePending(readPending().filter((e) => !sent.has(e.id)));
  }, []);
  const query = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<WrittenEntry[]> => {
      await send(readPending()).catch(() => {});
      const { data, error } = await supabase.from("app_settings").select("value").like("key", `${WRITTEN_PREFIX}%`).order("updated_at", { ascending: false }).limit(200);
      if (error) throw error;
      const rows: WrittenEntry[] = [];
      for (const r of data ?? []) { try { const e = JSON.parse(r.value); if (valid(e)) rows.push(e); } catch { /* skip a malformed row */ } }
      return sort([...readPending(), ...rows]);
    },
    initialData: () => readCache<WrittenEntry[]>("written"),
    initialDataUpdatedAt: 0,
  });
  useEffect(() => { if (query.data) writeCache("written", query.data); }, [query.data]);
  const add = useCallback((entry: WrittenEntry) => {
    writePending([...readPending(), entry]);
    qc.setQueryData<WrittenEntry[]>(KEY, (old) => sort([entry, ...(old ?? [])]));
    void send([entry]).catch(() => {});
  }, [qc, send]);
  const list = query.data ?? [];
  return useMemo(() => {
    const lastEssay: Partial<Record<CourseCode, string>> = {};
    const latest = new Map<string, WrittenEntry>();
    for (const e of list) {
      if (!lastEssay[e.course] || e.day > lastEssay[e.course]!) lastEssay[e.course] = e.day;
      const k = `${e.course}|${e.topic}`;
      if (!latest.has(k)) latest.set(k, e);
    }
    // A low score on a topic in the last two weeks sends its questions and cards to the front.
    const cutoff = dateKey.addDays(dateKey.today(), -14);
    const weak = [...latest].filter(([, e]) => e.grade.score < 7 && e.day >= cutoff).map(([k]) => k);
    return { list, add, lastEssay, weak, done: new Set(list.map((e) => e.materialId).filter(Boolean) as string[]) };
  }, [list, add]);
}
