import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuestionDTO } from "../endpoints/state_GET.schema";
import type { Filter } from "./studyEngine";
import { acknowledgeSetting, queueSetting, readCache, settingQueue, writeCache } from "./offlineCache";
import { supabase } from "./supabase";

export const EXAM_PREFIX = "exam:v1:";
export type ExamEntry = {
  at: string; course: Filter; size: number; timed: boolean; seconds: number; score: number; total: number;
  byTopic: { topic: string; right: number; total: number }[]; wrong: string[]; flagged: string[];
  picks: Record<string, string>;
};
export type ActiveExam = {
  id: string; at: number; questions: QuestionDTO[]; i: number; picks: Record<string, string>;
  flagged: string[]; seconds: number; limit?: number; submitted: string[]; finishing?: boolean;
};
export const examSizes = (bank: number) => [...new Set([...([10, 25, 60].filter(n => n <= bank)), ...(bank > 0 ? [bank] : [])])];
export function examSummary(questions: QuestionDTO[], picks: Record<string, string>, flagged: string[], seconds: number, timed: boolean, at: string): ExamEntry {
  const by = new Map<string, { topic: string; right: number; total: number }>();
  const wrong: string[] = [];
  for (const q of questions) {
    const t = by.get(q.topic) ?? { topic: q.topic, right: 0, total: 0 };
    t.total++; if (picks[q.id] === q.answer) t.right++; else wrong.push(q.id);
    by.set(q.topic, t);
  }
  const courses = new Set(questions.map(q => q.course));
  return { at, course: courses.size === 1 ? questions[0].course : "all", size: questions.length, timed,
    seconds: Math.max(0, Math.round(seconds)), score: questions.length - wrong.length, total: questions.length,
    byTopic: [...by.values()].sort((a, b) => a.right / a.total - b.right / b.total || a.topic.localeCompare(b.topic)),
    wrong, flagged: flagged.filter(id => questions.some(q => q.id === id)), picks: { ...picks } };
}
export const examTime = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
export const examDate = (at: string) => new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export function restoreExam(raw: unknown, now = Date.now()): ActiveExam | null {
  const x = raw as ActiveExam;
  if (!x || typeof x.id !== "string" || !Number.isFinite(x.at) || now < x.at || now - x.at > 3 * 3600000
    || !Array.isArray(x.questions) || !x.questions.length
    || x.questions.some(q => !q || typeof q.id !== "string" || typeof q.stem !== "string" || typeof q.prompt !== "string" || typeof q.topic !== "string"
      || !["il", "asy", "pr"].includes(q.course) || !Array.isArray(q.choices) || q.choices.length !== 4
      || q.choices.some(c => !c || typeof c.text !== "string" || typeof c.why !== "string") || !q.choices.some(c => c.id === q.answer))
    || new Set(x.questions.map(q => q.id)).size !== x.questions.length
    || !Number.isInteger(x.i) || x.i < 0 || x.i >= x.questions.length || !x.picks || typeof x.picks !== "object"
    || !Array.isArray(x.flagged) || !Array.isArray(x.submitted) || !Number.isFinite(x.seconds) || x.seconds < 0
    || (x.limit !== undefined && (!Number.isFinite(x.limit) || x.limit <= 0))) return null;
  return { ...x, picks: Object.fromEntries(Object.entries(x.picks).filter(([id, pick]) => x.questions.some(q => q.id === id && q.choices.some(c => c.id === pick)))) };
}
export const readActiveExam = () => restoreExam(readCache("exam-active"));
let resumeRequested = false;
export const requestExamResume = () => { resumeRequested = true; };
export const takeExamResume = () => resumeRequested ? readActiveExam() : null;
export const clearExamResume = () => { resumeRequested = false; };

const valid = (e: unknown): e is ExamEntry => {
  const x = e as ExamEntry;
  return !!x && Number.isFinite(Date.parse(x.at)) && ["all", "il", "asy", "pr"].includes(x.course)
    && Number.isInteger(x.total) && x.total > 0 && Number.isInteger(x.score) && x.score >= 0 && x.score <= x.total
    && Number.isFinite(x.seconds) && x.seconds >= 0 && Array.isArray(x.byTopic) && Array.isArray(x.wrong) && Array.isArray(x.flagged);
};
const sort = (list: ExamEntry[]) => [...new Map(list.map(e => [e.at, e])).values()].sort((a, b) => b.at.localeCompare(a.at));
export function localExams(): ExamEntry[] {
  const pending = Object.values(settingQueue()).filter(r => r.key.startsWith(EXAM_PREFIX)).flatMap(r => {
    try { const e = JSON.parse(r.value); return valid(e) ? [e] : []; } catch { return []; }
  });
  return sort([...pending, ...(readCache<ExamEntry[]>("exams") ?? []).filter(valid)]);
}
let sending: Promise<void> | undefined;
function flushExams() {
  if (!navigator.onLine) return Promise.resolve();
  return sending ??= (async () => {
    const rows = Object.values(settingQueue()).filter(r => r.key.startsWith(EXAM_PREFIX));
    if (!rows.length) return;
    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" }).abortSignal(AbortSignal.timeout(10000));
    if (error) throw error;
    rows.forEach(acknowledgeSetting);
  })().finally(() => { sending = undefined; });
}
const KEY = ["lawstin-exams"] as const;
export function useExams() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, initialData: localExams, initialDataUpdatedAt: 0, queryFn: async () => {
    await flushExams().catch(() => {});
    const list: ExamEntry[] = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await supabase.from("app_settings").select("value").like("key", `${EXAM_PREFIX}%`).order("key").range(start, start + 499);
      if (error) throw error;
      for (const row of data ?? []) { try { const e = JSON.parse(row.value); if (valid(e)) list.push(e); } catch { /* Ignore malformed rows. */ } }
      if ((data?.length ?? 0) < 500) break;
    }
    const next = sort([...localExams(), ...list]); writeCache("exams", next); return next;
  } });
  useEffect(() => {
    const retry = () => { void flushExams().catch(() => {}); };
    const timer = setInterval(retry, 15000); window.addEventListener("online", retry);
    return () => { clearInterval(timer); window.removeEventListener("online", retry); };
  }, []);
  const add = useCallback((entry: ExamEntry) => {
    queueSetting(`${EXAM_PREFIX}${entry.at}`, JSON.stringify(entry));
    const list = sort([entry, ...localExams()]); writeCache("exams", list); qc.setQueryData(KEY, list);
    void flushExams().catch(() => {});
  }, [qc]);
  return { list: query.data ?? [], add, loading: query.isFetching, error: query.isError, retry: query.refetch };
}
