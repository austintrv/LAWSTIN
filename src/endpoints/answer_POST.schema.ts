import { rpc } from "../helpers/supabase";
import type { ProgressDTO } from "./state_GET.schema";

export type InputType = { questionId: string; choice: "A" | "B" | "C" | "D"; localDate: string };
export type OutputType = { correct: boolean; progress: ProgressDTO };

export const postAnswer = (body: InputType): Promise<OutputType> =>
  rpc<OutputType>("record_answer", { p_question_id: body.questionId, p_choice: body.choice, p_local_date: body.localDate });
