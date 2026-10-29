import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { dateKey } from "./dateKey";
import { toast } from "./toast";

export type TaskCourse = "clinic" | "tutoring";
export type CourseTask = {
  id: string; course: TaskCourse; title: string; notes: string; due: string | null;
  flagged: boolean; done_at: string | null; created_at: string; updated_at: string;
};
export type TaskPatch = Partial<Pick<CourseTask, "title" | "notes" | "due" | "flagged" | "done_at">>;

const KEY = ["lawstin-course-tasks"] as const;

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
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("course_tasks").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as CourseTask[];
    },
    staleTime: 60 * 1000,
  });
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
      const { error } = await supabase.from("course_tasks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, patch }) => set((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    onError: () => { toast.error("Couldn’t save that change"); settle(); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
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
    update.mutate({ id: t.id, patch: { done_at: new Date().toISOString() } });
    toast("Done", { action: { label: "Undo", onClick: () => update.mutate({ id: t.id, patch: { done_at: null } }) } });
  };

  return { tasks: query.data ?? [], loading: query.isLoading, add, update, remove, removeWithUndo, completeWithUndo };
}
