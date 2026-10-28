import { rpc } from "../helpers/supabase";

export type InputType =
  | { action: "guess"; questionId: string; localDate: string }
  | { action: "star"; questionId: string; starred: boolean }
  | { action: "flag"; questionId: string; note: string };
export type OutputType = { ok: true };

export const postMark = (body: InputType): Promise<OutputType> =>
  rpc<OutputType>("mark_question", {
    p_action: body.action,
    p_question_id: body.questionId,
    p_starred: body.action === "star" ? body.starred : null,
    p_note: body.action === "flag" ? body.note : null,
    p_local_date: body.action === "guess" ? body.localDate : null,
  });
