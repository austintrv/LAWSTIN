import { rpc } from "../helpers/supabase";
import { dateKey } from "../helpers/dateKey";

export type ChoiceDTO = {
  id: "A" | "B" | "C" | "D";
  role: "correct" | "sneaky" | "average" | "bad";
  text: string;
  why: string;
};

export type QuestionDTO = {
  id: string;
  course: "il" | "asy" | "pr";
  topic: string;
  subtopic: string | null;
  classDay: number | null;
  classDate: string | null;
  source: string | null;
  batch: string | null;
  stem: string;
  prompt: string;
  choices: ChoiceDTO[];
  answer: "A" | "B" | "C" | "D";
  rule: string | null;
  authority: string | null;
};

export type ProgressDTO = {
  questionId: string;
  seen: number;
  correct: number;
  wrong: number;
  box: number;
  due: string | null;
  lastChoice: string | null;
  lastCorrect: boolean | null;
  lastAt: string | null;
  missSneaky: number;
  missAverage: number;
  missBad: number;
  guessed: number;
  starred: boolean;
  flagged: boolean;
};

export type RunDTO = {
  date: string;
  added: number;
  byCourse: Record<string, number>;
  note: string;
};

export type DayDTO = { date: string; answered: number; correct: number };

export type OutputType = {
  questions: QuestionDTO[];
  progress: ProgressDTO[];
  runs: RunDTO[];
  days: DayDTO[];
};

export const getState = async (): Promise<OutputType> => {
  const s = await rpc<OutputType>("get_state", { p_today: dateKey.today() });
  return { questions: s.questions ?? [], progress: s.progress ?? [], runs: s.runs ?? [], days: s.days ?? [] };
};
