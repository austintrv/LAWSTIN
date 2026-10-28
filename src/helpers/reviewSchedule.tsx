/** Spaced-review intervals in days, indexed by box (1–5). Box 0 = never answered. */
export const reviewSchedule = {
  intervals: [0, 1, 3, 7, 16, 35] as const,
  /** New box after an answer. First-time correct answers start at box 2. */
  nextBox(prevBox: number, prevSeen: number, correct: boolean): number {
    if (!correct) return 1;
    if (prevSeen === 0) return 2;
    return Math.min(Math.max(prevBox, 1) + 1, 5);
  },
};