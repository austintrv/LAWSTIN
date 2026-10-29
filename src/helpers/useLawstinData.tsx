import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getState, type OutputType as StateType, type ProgressDTO } from "../endpoints/state_GET.schema";
import { postAnswer, type InputType as AnswerInput } from "../endpoints/answer_POST.schema";
import { postMark, type InputType as MarkInput } from "../endpoints/mark_POST.schema";
import { dateKey } from "./dateKey";
import { ANSWER_QUEUE, isNetworkError, readCache, writeCache } from "./offlineCache";
import { toast } from "./toast";

const KEY = ["lawstin-state"] as const;

function upsertProgress(state: StateType, p: ProgressDTO): StateType {
  const rest = state.progress.filter((x) => x.questionId !== p.questionId);
  return { ...state, progress: [...rest, p] };
}

function bumpDay(state: StateType, date: string, correct: boolean): StateType {
  const days = [...state.days];
  const i = days.findIndex((d) => d.date === date);
  if (i >= 0) days[i] = { ...days[i], answered: days[i].answered + 1, correct: days[i].correct + (correct ? 1 : 0) };
  else days.push({ date, answered: 1, correct: correct ? 1 : 0 });
  return { ...state, days };
}

const blank = (questionId: string): ProgressDTO => ({
  questionId, seen: 0, correct: 0, wrong: 0, box: 0, due: null, lastChoice: null,
  lastCorrect: null, lastAt: null, missSneaky: 0, missAverage: 0, missBad: 0, guessed: 0, starred: false, flagged: false,
});

// Answers given without a connection wait here and are sent in order once it returns.
type Queued = AnswerInput & { at: string };
function readQueue(): Queued[] {
  try { return JSON.parse(localStorage.getItem(ANSWER_QUEUE) ?? "[]") as Queued[]; } catch { return []; }
}
function writeQueue(list: Queued[]) {
  try { if (list.length) localStorage.setItem(ANSWER_QUEUE, JSON.stringify(list)); else localStorage.removeItem(ANSWER_QUEUE); } catch { /* storage blocked */ }
}

/** All Lawstin data plus mutations. Answers update the cache immediately. */
export function useLawstinData() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => getState(),
    initialData: () => readCache<StateType>("state"),
    initialDataUpdatedAt: 0,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: true,
  });
  useEffect(() => { if (query.data) writeCache("state", query.data); }, [query.data]);

  const answer = useMutation({
    mutationFn: (input: AnswerInput) => postAnswer(input),
    // Fail at once without a connection so the answer can be queued instead of waiting.
    networkMode: "always",
    onSuccess: (res, input) => {
      qc.setQueryData<StateType>(KEY, (old) => old && bumpDay(upsertProgress(old, res.progress), input.localDate, res.correct));
    },
  });

  /** Keeps an answer on this device and counts it now; the server scores it when the connection returns. */
  const queueAnswer = useCallback((input: AnswerInput, correct: boolean) => {
    writeQueue([...readQueue(), { ...input, at: new Date().toISOString() }]);
    qc.setQueryData<StateType>(KEY, (old) => {
      if (!old) return old;
      const base = old.progress.find((p) => p.questionId === input.questionId) ?? blank(input.questionId);
      const p = { ...base, seen: base.seen + 1, correct: base.correct + Number(correct), wrong: base.wrong + Number(!correct),
        lastChoice: input.choice, lastCorrect: correct, lastAt: new Date().toISOString() };
      return bumpDay(upsertProgress(old, p), input.localDate, correct);
    });
  }, [qc]);

  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine || !readQueue().length) return;
    flushing.current = true;
    let sent = 0;
    try {
      for (let list = readQueue(); list.length; list = readQueue()) {
        const item = list[0];
        try { await postAnswer(item); sent++; }
        catch (err) { if (isNetworkError(err)) break; }
        // Sent, or refused by the server (for example a retired question): either way it leaves the queue.
        writeQueue(readQueue().filter((x) => !(x.at === item.at && x.questionId === item.questionId)));
      }
    } finally { flushing.current = false; }
    if (sent) {
      toast(sent === 1 ? "Offline answer synced" : `${sent} offline answers synced`);
      void qc.invalidateQueries({ queryKey: KEY });
    }
  }, [qc]);
  useEffect(() => {
    void flush();
    const onVis = () => { if (!document.hidden) void flush(); };
    const onOnline = () => { void flush(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("online", onOnline); document.removeEventListener("visibilitychange", onVis); };
  }, [flush]);

  const mark = useMutation({
    mutationFn: (input: MarkInput) => postMark(input),
    onMutate: (input) => {
      qc.setQueryData<StateType>(KEY, (old) => {
        if (!old) return old;
        const prev = old.progress.find((p) => p.questionId === input.questionId);
        const base: ProgressDTO = prev ?? blank(input.questionId);
        let p = base;
        if (input.action === "star") p = { ...base, starred: input.starred };
        if (input.action === "flag") p = { ...base, flagged: true };
        if (input.action === "guess") p = { ...base, box: 1, due: dateKey.addDays(input.localDate, 1), guessed: base.guessed + 1 };
        return upsertProgress(old, p);
      });
    },
    onError: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return { query, answer, queueAnswer, mark, refresh: () => qc.invalidateQueries({ queryKey: KEY }) };
}