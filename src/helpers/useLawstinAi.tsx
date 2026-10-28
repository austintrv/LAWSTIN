import { useMutation } from "@tanstack/react-query";
import { postAi, type InputType } from "../endpoints/ai_POST.schema";

type Of<A extends InputType["action"]> = Extract<InputType, { action: A }>;

/** Mutations for the AI tutor features: follow-up questions, harder versions, issue-spotters and grading. */
export function useLawstinAi() {
  const ask = useMutation({ mutationFn: (b: Omit<Of<"ask">, "action">) => postAi<"ask">({ action: "ask", ...b }) });
  const harder = useMutation({ mutationFn: (b: Omit<Of<"harder">, "action">) => postAi<"harder">({ action: "harder", ...b }) });
  const spotter = useMutation({ mutationFn: (b: Omit<Of<"spotter">, "action">) => postAi<"spotter">({ action: "spotter", ...b }) });
  const grade = useMutation({ mutationFn: (b: Omit<Of<"grade">, "action">) => postAi<"grade">({ action: "grade", ...b }) });
  return { ask, harder, spotter, grade };
}
