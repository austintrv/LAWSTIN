import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { OutputType as State } from "../endpoints/state_GET.schema";
import { dateKey } from "./dateKey";
import { supabase } from "./supabase";
import { applyStudyEvents, enqueueStudy, readStudyQueue, writeStudyQueue, type StudyEvent } from "./offlineCache";
import { toast } from "./toast";

let sending: Promise<void> | null = null;
export async function confirmQueuedStudy() {
  await sending;
  const pending = readStudyQueue();
  if (!pending.length || !navigator.onLine) return;
  for (let start = 0; start < pending.length; start += 100) {
    const ids = pending.slice(start, start + 100).map(e => e.id);
    const { data, error } = await supabase.from("study_events").select("id").in("id", ids).abortSignal(AbortSignal.timeout(10000));
    if (error) throw error;
    const accepted = new Set((data ?? []).map(e => Number(e.id)));
    writeStudyQueue(readStudyQueue().filter(e => !accepted.has(e.id)));
  }
}
/** Stable negative client ids share the existing primary key without using the server's positive sequence. */
export function useLogStudy() {
  const qc = useQueryClient();
  const flush = useCallback(() => {
    if (sending || !navigator.onLine || !readStudyQueue().length) return sending;
    sending = (async () => {
      await qc.cancelQueries({ queryKey: ["lawstin-state"] });
      try {
        for (let rows = readStudyQueue(); rows.length && navigator.onLine; rows = readStudyQueue()) {
          const row = rows[0];
          const { error } = await supabase.from("study_events").upsert(row, { onConflict: "id", ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(10000));
          if (error) break;
          writeStudyQueue(readStudyQueue().filter(e => e.id !== row.id));
        }
      } catch { /* Retain the same ids until the server acknowledges them. */ }
      finally { sending = null; void qc.invalidateQueries({ queryKey: ["lawstin-state"] }); }
    })();
    return sending;
  }, [qc]);
  useEffect(() => {
    void flush();
    const retry = () => { if (!document.hidden) void flush(); };
    const timer = window.setInterval(retry, 15000);
    window.addEventListener("online", retry); document.addEventListener("visibilitychange", retry);
    return () => { clearInterval(timer); window.removeEventListener("online", retry); document.removeEventListener("visibilitychange", retry); };
  }, [flush]);
  return useCallback((kind: StudyEvent["kind"], itemId: string, correct: boolean, count = 1, right = correct ? count : 0) => {
    try {
      const rows = enqueueStudy(kind, itemId, correct, dateKey.today(), count, right);
      if (!rows.length) return;
      qc.setQueryData<State>(["lawstin-state"], old => old && applyStudyEvents(old, rows));
      void flush();
    } catch { toast.error("Couldn’t save study progress on this device"); }
  }, [qc, flush]);
}
