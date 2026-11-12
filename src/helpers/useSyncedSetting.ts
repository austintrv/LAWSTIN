import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { readCache, writeCache, queueSetting, settingQueue } from "./offlineCache";
import { flushSettings, useWorkspaceSync } from "./useCourseTasks";

export function useSyncedSetting<T>(key: string, fallback: T, localKey?: string) {
  useWorkspaceSync();
  const qc = useQueryClient(), queryKey = ["lawstin-setting", key];
  const parse = (value: string | undefined): T => { try { return value === undefined ? fallback : JSON.parse(value); } catch { return fallback; } };
  const cached = () => { try { return parse(settingQueue()[key]?.value ?? readCache<string>(key) ?? (localKey ? localStorage.getItem(localKey) ?? undefined : undefined)); } catch { return fallback; } };
  const query = useQuery({ queryKey, queryFn: async () => {
    const {data,error} = await supabase.from("app_settings").select("key,value").eq("key",key);
    if (error) throw error;
    return parse(settingQueue()[key]?.value ?? data?.[0]?.value);
  }, initialData: cached, initialDataUpdatedAt: 0, staleTime:60000 });
  useEffect(() => { if (query.data !== undefined) { writeCache(key,JSON.stringify(query.data)); if (localKey) { try { localStorage.setItem(localKey,JSON.stringify(query.data)); } catch {} } } },[query.data,key,localKey]);
  useEffect(() => {
    const refresh = () => { void qc.invalidateQueries({queryKey}); };
    window.addEventListener("online",refresh); window.addEventListener("lawstin-settings-synced",refresh);
    return () => { window.removeEventListener("online",refresh); window.removeEventListener("lawstin-settings-synced",refresh); };
  },[key,qc]);
  const save = (next: T) => {
    queueSetting(key,JSON.stringify(next));
    if (localKey) { try { localStorage.setItem(localKey,JSON.stringify(next)); } catch {} }
    qc.setQueryData(queryKey,next); void flushSettings();
  };
  return { value:query.data ?? fallback, save, loaded:query.isFetched || !navigator.onLine, error:query.isError };
}
