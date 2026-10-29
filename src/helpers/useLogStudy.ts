import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { OutputType as State } from "../endpoints/state_GET.schema";
import { dateKey } from "./dateKey";
import { supabase } from "./supabase";

/** Records a flashcard grade or drill answer so it counts toward the streak, daily goal, and charts. */
export function useLogStudy() {
  const qc = useQueryClient();
  return useCallback((kind: "card" | "drill", itemId: string, correct: boolean) => {
    const localDate = dateKey.today();
    // Count it on screen right away, the same way quiz answers do.
    qc.setQueryData<State>(["lawstin-state"], (old) => {
      if (!old) return old;
      const days = [...old.days];
      const i = days.findIndex((d) => d.date === localDate);
      if (i >= 0) days[i] = { ...days[i], answered: days[i].answered + 1, correct: days[i].correct + (correct ? 1 : 0) };
      else days.push({ date: localDate, answered: 1, correct: correct ? 1 : 0 });
      return { ...old, days };
    });
    void supabase.from("study_events").insert({ kind, item_id: itemId, correct, local_date: localDate }).then(({ error }) => {
      if (error) void qc.invalidateQueries({ queryKey: ["lawstin-state"] });
    });
  }, [qc]);
}
