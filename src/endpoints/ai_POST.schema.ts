import { supabase } from "../helpers/supabase";
import type { QuestionDTO } from "./state_GET.schema";

type Letter = "A" | "B" | "C" | "D";
type Course = "il" | "asy" | "pr";
type Msg = { role: "user" | "assistant"; content: string };

export type QuestionInput = Pick<QuestionDTO, "id" | "course" | "topic" | "subtopic" | "stem" | "prompt" | "choices" | "answer" | "rule" | "authority">;

export type InputType =
  | { action: "ask"; question: QuestionInput; picked: Letter | null; messages: Msg[] }
  | { action: "harder"; question: QuestionInput }
  | { action: "spotter"; course: Course }
  | { action: "grade"; course: Course; topic: string; facts: string; call: string; issues: string[]; answer: string };

export type SpotterDTO = { course: Course; topic: string; facts: string; call: string; issues: string[] };
export type GradeDTO = {
  score: number;
  summary: string;
  spotted: { issue: string; comment: string }[];
  missed: { issue: string; rule: string }[];
  errors: string[];
  modelAnswer: string;
};

export type OutputType =
  | { action: "ask"; reply: string }
  | { action: "harder"; question: QuestionDTO }
  | { action: "spotter"; spotter: SpotterDTO }
  | { action: "grade"; grade: GradeDTO };

export class AiRequestError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** Calls the `ai` Edge Function (Gemini) with Austin's sign-in. */
export const postAi = async <A extends InputType["action"]>(body: Extract<InputType, { action: A }>): Promise<Extract<OutputType, { action: A }>> => {
  const { data, error } = await supabase.functions.invoke("ai", { body });
  if (error) {
    let err: { error?: string; code?: string } = {};
    try { err = await (error as { context?: Response }).context?.json(); } catch { /* not JSON */ }
    throw new AiRequestError(err?.error ?? "The tutor isn’t available right now", err?.code);
  }
  return data as Extract<OutputType, { action: A }>;
};
