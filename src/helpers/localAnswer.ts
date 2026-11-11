import type { OutputType as State, ProgressDTO } from "../endpoints/state_GET.schema";
import type { InputType as AnswerInput } from "../endpoints/answer_POST.schema";
import { dateKey } from "./dateKey";
import { reviewSchedule } from "./reviewSchedule";

/** Mirror the review schedule offline, so a queued answer immediately leaves today's queue. */
export function applyLocalAnswer(state: State, input: AnswerInput, at: string): State {
  const q = state.questions.find((q) => q.id === input.questionId);
  if (!q) return state;
  const correct = input.choice === q.answer;
  const base: ProgressDTO = state.progress.find((p) => p.questionId === q.id) ?? {
    questionId: q.id, seen: 0, correct: 0, wrong: 0, box: 0, due: null, lastChoice: null,
    lastCorrect: null, lastAt: null, missSneaky: 0, missAverage: 0, missBad: 0, guessed: 0, starred: false, flagged: false,
  };
  const box = reviewSchedule.nextBox(base.box, base.seen, correct);
  const role = q.choices.find((c) => c.id === input.choice)?.role;
  const p = { ...base, seen: base.seen + 1, correct: base.correct + Number(correct), wrong: base.wrong + Number(!correct),
    box, due: dateKey.addDays(input.localDate, reviewSchedule.intervals[box]), lastChoice: input.choice, lastCorrect: correct, lastAt: at,
    missSneaky: base.missSneaky + Number(role === "sneaky"), missAverage: base.missAverage + Number(role === "average"), missBad: base.missBad + Number(role === "bad") };
  const day = state.days.find((d) => d.date === input.localDate) ?? { date: input.localDate, answered: 0, correct: 0 };
  return { ...state, progress: [...state.progress.filter((p) => p.questionId !== q.id), p],
    days: [...state.days.filter((d) => d.date !== day.date), { ...day, answered: day.answered + 1, correct: day.correct + Number(correct) }] };
}
