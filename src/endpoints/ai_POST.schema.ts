import { supabase } from "../helpers/supabase";
import type { QuestionDTO } from "./state_GET.schema";

type Letter = "A" | "B" | "C" | "D";
type Course = "il" | "asy" | "pr";
type Msg = { role: "user" | "assistant"; content: string };

export type QuestionInput = Pick<QuestionDTO, "id" | "course" | "topic" | "subtopic" | "stem" | "prompt" | "choices" | "answer" | "rule" | "authority">;

export type InputType =
  | { action: "ask"; question: QuestionInput; picked: Letter | null; messages: Msg[] }
  | { action: "harder"; question: QuestionInput }
  | { action: "spotter"; course: Course; length?: "short" | "full" }
  | { action: "grade"; course: Course; topic: string; facts: string; call: string; issues: string[]; answer: string; reference?: Reference[]; openNote?: boolean; length?: "short" | "full" }
  | { action: "explain"; course: Course; topic: string; prompt: string; reference: string; answer: string };

/** A verified issue-by-issue analysis the grader holds the answer against. */
export type Reference = { issue: string; analysis: string; authority: string };
/** `minutes` is the writing time the prompt is built for. `materialId` and `reference` are set when it is a verified hypothetical. */
export type SpotterDTO = { course: Course; topic: string; facts: string; call: string; issues: string[]; minutes?: number; materialId?: string; reference?: Reference[] };
export type ExplainDTO = { verdict: "solid" | "partial" | "off"; got: string[]; gaps: string[]; note: string };
export type GradeDTO = {
  score: number;
  summary: string;
  spotted: { issue: string; comment: string }[];
  missed: { issue: string; rule: string }[];
  errors: string[];
  modelAnswer: string;
  /** 0–10 each. Absent on essays graded before the rubric existed. */
  rubric?: { issues: number; rules: number; application: number };
};

export type OutputType =
  | { action: "ask"; reply: string }
  | { action: "harder"; question: QuestionDTO }
  | { action: "spotter"; spotter: SpotterDTO }
  | { action: "grade"; grade: GradeDTO }
  | { action: "explain"; explain: ExplainDTO };

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
