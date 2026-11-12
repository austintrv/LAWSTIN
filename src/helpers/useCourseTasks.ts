import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { dateKey } from "./dateKey";
import { toast } from "./toast";
import { readCache, writeCache, settingQueue, acknowledgeSetting } from "./offlineCache";
import { nextRepeatDate, repeatId, type RepeatRule } from "./workspace";
import { queueSetting } from "./offlineCache";
import { useEffect } from "react";

export type TaskCourse = "clinic" | "tutoring";
export type CourseTask = {
  id: string; course: TaskCourse; title: string; notes: string; due: string | null;
  repeat?: RepeatRule;
  flagged: boolean; done_at: string | null; created_at: string; updated_at: string;
};
export type TaskPatch = Partial<Pick<CourseTask, "title" | "notes" | "due" | "flagged" | "done_at" | "repeat">>;

const KEY = ["lawstin-course-tasks"] as const;
let repeatColumn = false;

/** Open tasks first by due date (overdue, today, later, undated), then completed ones newest first. */
export function sortTasks(list: CourseTask[]) {
  const open = list.filter((t) => !t.done_at).sort((a, b) =>
    (a.due ?? "9999") .localeCompare(b.due ?? "9999") || Number(b.flagged) - Number(a.flagged) || a.created_at.localeCompare(b.created_at));
  const done = list.filter((t) => t.done_at).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  return { open, done };
}

/** Open tasks that are overdue or due within the next two days, across both workspaces. */
export function dueSoon(list: CourseTask[], today = dateKey.today()) {
  const limit = dateKey.addDays(today, 2);
  return sortTasks(list).open.filter((t) => t.due && t.due <= limit);
}

export function useCourseTasks() {
  useWorkspaceSync();
  const qc = useQueryClient();
  const repeatKey = "workspace:task-repeat";
  const repeatRules = () => { try { return JSON.parse(settingQueue()[repeatKey]?.value ?? readCache<string>(repeatKey) ?? "{}") as Record<string, RepeatRule>; } catch { return {}; } };
  const repeats = useQuery({queryKey:["lawstin-task-repeats"],initialData:repeatRules,initialDataUpdatedAt:0,queryFn:async()=>{
    const {data,error}=await supabase.from("app_settings").select("key,value").eq("key",repeatKey); if(error)throw error;
    const value=settingQueue()[repeatKey]?.value ?? data?.[0]?.value ?? "{}";writeCache(repeatKey,value);return JSON.parse(value) as Record<string,RepeatRule>;
  }});
  const saveRepeat = (id: string, repeat: RepeatRule) => { const next={...repeats.data,...repeatRules(),[id]:repeat};queueSetting(repeatKey,JSON.stringify(next));qc.setQueryData(["lawstin-task-repeats"],next);void flushSettings(); };

  const query = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("course_tasks").select("*").order("created_at");
      if (error) throw error;
      repeatColumn = (data ?? []).some(t => Object.prototype.hasOwnProperty.call(t,"repeat"));
      const rules = repeatRules();
      const remote=(data ?? []).map(t => ({...t, repeat: t.repeat ?? rules[t.id] ?? null})) as CourseTask[];
      return [...new Map([...remote,...Object.values(pendingTasks())].map(t=>[t.id,t])).values()];
    },
    initialData: () => readCache<CourseTask[]>("tasks"),
    initialDataUpdatedAt: 0,
    staleTime: 60 * 1000,
  });
  useEffect(() => { if (query.data) writeCache("tasks", query.data); }, [query.data]);
  const set = (fn: (list: CourseTask[]) => CourseTask[]) => qc.setQueryData<CourseTask[]>(KEY, (old) => fn(old ?? []));
  const settle = () => qc.invalidateQueries({ queryKey: KEY });

  const add = useMutation({
    mutationFn: async (t: { course: TaskCourse; title: string; due: string | null }) => {
      const { data, error } = await supabase.from("course_tasks").insert(t).select().single();
      if (error) throw error;
      return data as CourseTask;
    },
    onMutate: (t) => {
      const now = new Date().toISOString();
      const temp: CourseTask = { id: `temp-${now}`, notes: "", flagged: false, done_at: null, created_at: now, updated_at: now, ...t };
      set((list) => [...list, temp]);
      return { temp };
    },
    onSuccess: (row, _t, ctx) => set((list) => list.map((x) => (x.id === ctx?.temp.id ? row : x))),
    onError: () => { toast.error("Couldn’t add that task"); settle(); },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TaskPatch }) => {
      if (patch.repeat !== undefined) saveRepeat(id, patch.repeat);
      const { repeat, ...rest } = patch;
      if (!Object.keys(rest).length && (!repeatColumn || repeat === undefined)) return;
      const { error } = await supabase.from("course_tasks").update({ ...rest, ...(repeatColumn && repeat !== undefined ? {repeat} : {}), updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, patch }) => {
      const old=qc.getQueryData<CourseTask[]>(KEY)?.find(x=>x.id===id);
      if (old) queueTask({...old,...patch,updated_at:new Date().toISOString()});
      set((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    },
    onError: () => { toast.error("Couldn’t save that change"); settle(); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // A queued edit must not bring a deleted task back.
      const rest = pendingTasks(); if (rest[id]) { delete rest[id]; writeCache("tasks-pending", rest); }
      const { error } = await supabase.from("course_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) => set((list) => list.filter((x) => x.id !== id)),
    onError: () => { toast.error("Couldn’t delete that task"); settle(); },
  });

  const restore = useMutation({
    mutationFn: async (t: CourseTask) => {
      const { error } = await supabase.from("course_tasks").insert({ id: t.id, course: t.course, title: t.title, notes: t.notes, due: t.due, flagged: t.flagged, done_at: t.done_at, created_at: t.created_at });
      if (error) throw error;
    },
    onMutate: (t) => set((list) => [...list.filter((x) => x.id !== t.id), t]),
    onError: () => { toast.error("Couldn’t restore that task"); settle(); },
  });

  /** Deletes with an Undo; marks done with an Undo. */
  const removeWithUndo = (t: CourseTask) => {
    remove.mutate(t.id);
    toast("Task deleted", { action: { label: "Undo", onClick: () => restore.mutate(t) } });
  };
  const completeWithUndo = (t: CourseTask) => {
    const due = nextRepeatDate(t.due, t.repeat ?? null);
    if (due) {
      const id = repeatId(t.id, due), now = new Date().toISOString();
      const next = {...t, id, due, done_at: null, created_at: now, updated_at: now};
      saveRepeat(id, t.repeat ?? null);
      queueTask(next);
      set(list => [...list.filter(x=>x.id!==id), next]);
    }
    update.mutate({ id: t.id, patch: { done_at: new Date().toISOString() } });
    toast("Done", { action: { label: "Undo", onClick: () => {
      if (due) { const id=repeatId(t.id,due); const next=qc.getQueryData<CourseTask[]>(KEY)?.find(x=>x.id===id); if(next) { const hidden={...next,done_at:new Date().toISOString()}; queueTask(hidden); set(list=>list.filter(x=>x.id!==id)); } }
      update.mutate({ id: t.id, patch: { done_at: null } });
    } } });
  };

  return { tasks: (query.data ?? []).map(t=>({...t,repeat:repeatRules()[t.id] ?? repeats.data?.[t.id] ?? t.repeat ?? null})), loading: query.isLoading, add, update, remove, removeWithUndo, completeWithUndo };
}

const pendingTasks = (): Record<string, CourseTask> => readCache("tasks-pending") ?? {};
function queueTask(task: CourseTask) { localStorage.setItem("lawstin-cache:tasks-pending", JSON.stringify({...pendingTasks(),[task.id]:task})); void flushSettings(); }
async function flushTasks() {
  for(const task of Object.values(pendingTasks())) {
    const {repeat,...row}=task;
    const {error}=await supabase.from("course_tasks").upsert({...row,...(repeatColumn ? {repeat:repeat??null} : {})},{onConflict:"id"});
    if(error) throw error;
    const rest=pendingTasks(); if(rest[task.id]?.updated_at===task.updated_at) { delete rest[task.id]; writeCache("tasks-pending",rest); }
  }
}
let syncingSettings: Promise<void> | null = null;
let settingsRetry: ReturnType<typeof setTimeout> | undefined;
let settingsDelay = 1000;
export function flushSettings() {
  if (syncingSettings || !navigator.onLine || !Object.keys(settingQueue()).length && !Object.keys(pendingTasks()).length) return syncingSettings;
  clearTimeout(settingsRetry);
  syncingSettings = (async () => {
    try {
      for (const row of Object.values(settingQueue())) {
        const { error } = await supabase.from("app_settings").upsert(row, { onConflict: "key", ignoreDuplicates: row.key.startsWith("snapshot:v1:") || row.key.startsWith("recap:v1:") }).abortSignal(AbortSignal.timeout(10000));
        if (error) throw error;
        acknowledgeSetting(row);
        if (row.key.startsWith("snapshot:v1:") || row.key.startsWith("recap:v1:")) window.dispatchEvent(new Event("lawstin-settings-synced"));
      }
      await flushTasks();
      settingsDelay = 1000;
    } catch { if (settingsDelay === 1000) toast.error("Couldn’t sync. Your changes are saved on this device."); settingsDelay = Math.min(settingsDelay * 2, 30000); }
    finally {
      syncingSettings = null;
      if (Object.keys(settingQueue()).length || Object.keys(pendingTasks()).length) settingsRetry = setTimeout(() => void flushSettings(), settingsDelay);
    }
  })();
  return syncingSettings;
}
export function useWorkspaceSync() {
  useEffect(() => {
    void flushSettings();
    const flush = () => { void flushSettings(); };
    window.addEventListener("online", flush); window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => { flush(); window.removeEventListener("online", flush); window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", flush); };
  }, []);
}
