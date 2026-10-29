import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cardQueue, type Flashcard, type StudyMaterial, type StudyRecord, type StudyRun } from "./studyMaterials";
import type { OutputType as QuestionState } from "../endpoints/state_GET.schema";
import { acknowledgeStudyRows, changeStudyRecord, emptyStudyCache, mergeStudyRows, restoreStudyCache, PROGRESS_PREFIX, type ProgressRow, type StudyCache } from "./studyProgressStore";
import { supabase } from "./supabase";
import { toast } from "./toast";
import { useStudyLibrary } from "./useStudyLibrary";

function loadCache(key: string): StudyCache {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    return restoreStudyCache(parsed);
  } catch { /* Start clean if browser storage is unavailable. */ }
  return emptyStudyCache();
}

// Stable empties so effects that depend on the lists do not rerun on every render while loading.
const NONE: StudyMaterial[] = [];
const NO_RUNS: StudyRun[] = [];

async function fetchProgressRows() {
  const rows: ProgressRow[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase.from("app_settings").select("key,value,updated_at").like("key", `${PROGRESS_PREFIX}%`).order("key").range(start, start + 499);
    if (error) throw error;
    rows.push(...(data ?? [])); if ((data?.length ?? 0) < 500) break;
  }
  return rows;
}

/** Flashcards ready now, for the Study tab, read without taking over the Courses tab's sync. */
export function useReadyCards(userId: string, state: QuestionState | undefined) {
  const library = useStudyLibrary();
  const remote = useQuery({ queryKey: ["lawstin-material-progress", userId], queryFn: fetchProgressRows, refetchOnWindowFocus: true });
  return useMemo(() => {
    const cards = (library.data?.materials ?? NONE).filter((m): m is Flashcard => m.kind === "flashcard");
    if (!cards.length) return 0;
    const record = mergeStudyRows(loadCache(`lawstin-study-materials-v1:${userId}`), remote.data ?? []).record;
    return cardQueue(cards, record, state).length;
  }, [library.data, remote.data, state, userId]);
}

export function useStudyMaterials(userId: string) {
  const key = `lawstin-study-materials-v1:${userId}`;
  const [cache, setCache] = useState(() => loadCache(key));
  const [syncError, setSyncError] = useState(false);
  const library = useStudyLibrary();
  const qc = useQueryClient();
  const current = useRef(cache), syncing = useRef(false);
  const commit = useCallback((next: StudyCache) => {
    current.current = next; setCache(next);
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { toast.error("Couldn’t save study progress on this device"); }
  }, [key]);
  const remote = useQuery({ queryKey: ["lawstin-material-progress", userId], queryFn: fetchProgressRows, refetchOnWindowFocus: true });
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
      // Lets the Study tab's ready-card count catch up.
      void qc.invalidateQueries({ queryKey: ["lawstin-material-progress", userId] });
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
  return { materials: library.data?.materials ?? NONE, runs: library.data?.runs ?? NO_RUNS, loading: library.isLoading,
    // No copy on this device and no connection: say so instead of showing an empty library.
    unavailable: !library.data && (library.isError || library.fetchStatus === "paused"), record: cache.record, update,
    syncStatus: syncError || remote.isError ? "offline" : Object.keys(cache.pending).length ? "pending" : "synced" };
}
