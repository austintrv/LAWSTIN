import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import libraryJson from "../data/study-materials.json";
import { materialErrors, type MaterialLibrary, type StudyRecord } from "./studyMaterials";
import { acknowledgeStudyRows, changeStudyRecord, emptyStudyCache, mergeStudyRows, restoreStudyCache, PROGRESS_PREFIX, type ProgressRow, type StudyCache } from "./studyProgressStore";
import { supabase } from "./supabase";
import { toast } from "./toast";

export const library = libraryJson as unknown as MaterialLibrary;
export const verifiedMaterials = library.materials.filter(m => materialErrors(m).length === 0);
function loadCache(key: string): StudyCache {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    return restoreStudyCache(parsed);
  } catch { /* Start clean if browser storage is unavailable. */ }
  return emptyStudyCache();
}

export function useStudyMaterials(userId: string) {
  const key = `lawstin-study-materials-v1:${userId}`;
  const [cache, setCache] = useState(() => loadCache(key));
  const [syncError, setSyncError] = useState(false);
  const current = useRef(cache), syncing = useRef(false);
  const commit = useCallback((next: StudyCache) => {
    current.current = next; setCache(next);
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { toast.error("Couldn’t save study progress on this device"); }
  }, [key]);
  const remote = useQuery({ queryKey: ["lawstin-material-progress", userId], queryFn: async () => {
    const rows: ProgressRow[] = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await supabase.from("app_settings").select("key,value,updated_at").like("key", `${PROGRESS_PREFIX}%`).order("key").range(start, start + 499);
      if (error) throw error;
      rows.push(...(data ?? [])); if ((data?.length ?? 0) < 500) break;
    }
    return rows;
  }, refetchOnWindowFocus: true });
  useEffect(() => { if (remote.data) commit(mergeStudyRows(current.current, remote.data)); }, [remote.data, commit]);
  const flush = useCallback(async () => {
    if (syncing.current || !navigator.onLine) return;
    const sent = Object.values(current.current.pending);
    if (!sent.length) return;
    syncing.current = true;
    try {
      const { error } = await supabase.from("app_settings").upsert(sent, { onConflict: "key" });
      if (error) throw error;
      commit(acknowledgeStudyRows(current.current, sent)); setSyncError(false);
    } catch { setSyncError(true); }
    finally { syncing.current = false; }
  }, [commit]);
  useEffect(() => {
    const t = window.setTimeout(() => { void flush(); }, 600);
    return () => window.clearTimeout(t);
  }, [cache.pending, flush]);
  useEffect(() => {
    const onOnline = () => { void flush(); void remote.refetch(); };
    const onFocus = () => { if (!document.hidden) void flush(); };
    window.addEventListener("online", onOnline); document.addEventListener("visibilitychange", onFocus);
    return () => { window.removeEventListener("online", onOnline); document.removeEventListener("visibilitychange", onFocus); };
  }, [flush, remote.refetch]);
  const update = useCallback((fn: (prev: StudyRecord) => StudyRecord) => commit(changeStudyRecord(current.current, fn(current.current.record))), [commit]);
  return { materials: verifiedMaterials, runs: library.runs, record: cache.record, update,
    syncStatus: syncError || remote.isError ? "offline" : Object.keys(cache.pending).length ? "pending" : "synced" };
}
