import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getState, type OutputType as StateType, type ProgressDTO } from "../endpoints/state_GET.schema";
import { postAnswer, type InputType as AnswerInput } from "../endpoints/answer_POST.schema";
import { postMark, type InputType as MarkInput } from "../endpoints/mark_POST.schema";
import { dateKey } from "./dateKey";

const KEY = ["lawstin-state"] as const;

function upsertProgress(state: StateType, p: ProgressDTO): StateType {
  const rest = state.progress.filter((x) => x.questionId !== p.questionId);
  return { ...state, progress: [...rest, p] };
}

/** All Lawstin data plus mutations. Answers update the cache immediately. */
export function useLawstinData() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => getState(),
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: true,
  });

  const answer = useMutation({
    mutationFn: (input: AnswerInput) => postAnswer(input),
    onSuccess: (res, input) => {
      qc.setQueryData<StateType>(KEY, (old) => {
        if (!old) return old;
        const next = upsertProgress(old, res.progress);
        const days = [...next.days];
        const i = days.findIndex((d) => d.date === input.localDate);
        if (i >= 0) days[i] = { ...days[i], answered: days[i].answered + 1, correct: days[i].correct + (res.correct ? 1 : 0) };
        else days.push({ date: input.localDate, answered: 1, correct: res.correct ? 1 : 0 });
        return { ...next, days };
      });
    },
  });

  const mark = useMutation({
    mutationFn: (input: MarkInput) => postMark(input),
    onMutate: (input) => {
      qc.setQueryData<StateType>(KEY, (old) => {
        if (!old) return old;
        const prev = old.progress.find((p) => p.questionId === input.questionId);
        const base: ProgressDTO = prev ?? {
          questionId: input.questionId, seen: 0, correct: 0, wrong: 0, box: 0, due: null, lastChoice: null,
          lastCorrect: null, lastAt: null, missSneaky: 0, missAverage: 0, missBad: 0, guessed: 0, starred: false, flagged: false,
        };
        let p = base;
        if (input.action === "star") p = { ...base, starred: input.starred };
        if (input.action === "flag") p = { ...base, flagged: true };
        if (input.action === "guess") p = { ...base, box: 1, due: dateKey.addDays(input.localDate, 1), guessed: base.guessed + 1 };
        return upsertProgress(old, p);
      });
    },
    onError: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return { query, answer, mark, refresh: () => qc.invalidateQueries({ queryKey: KEY }) };
}