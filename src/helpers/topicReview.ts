import type { ProgressDTO } from "../endpoints/state_GET.schema";

/** A successful lesson retires the misses it actually covered, preserving answer history. */
export type TopicReview = {
  at: string;
  questions: Record<string, { wrong: number; guessed: number }>;
};

export function reviewEvidence(progress: ProgressDTO[]): TopicReview["questions"] {
  return Object.fromEntries(progress.map((p) => [p.questionId, { wrong: p.wrong, guessed: p.guessed }]));
}

export function needsTopicReview(p: ProgressDTO, review?: TopicReview): boolean {
  // A later confident answer settles that question. A guess resets it to box 1.
  if (p.lastCorrect !== false && !(p.guessed > 0 && p.box === 1)) return false;
  const covered = review?.questions[p.questionId];
  return !covered || p.wrong > covered.wrong || p.guessed > covered.guessed;
}
