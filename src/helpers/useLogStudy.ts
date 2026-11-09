import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { OutputType as State } from "../endpoints/state_GET.schema";
import { dateKey } from "./dateKey";
import { supabase } from "./supabase";

/**
 * Records a flashcard grade, drill answer or graded essay so it counts toward the streak, daily
 * goal, and charts. An essay counts as several answers (`count`), `right` of them correct.
 */
export function useLogStudy() {
  const qc = useQueryClient();
  return useCallback((kind: "card" | "drill" | "written", itemId: string, correct: boolean, count = 1, right = correct ? count : 0) => {
    const localDate = dateKey.today();
    // Count it on screen right away, the same way quiz answers do.
    qc.setQueryData<State>(["lawstin-state"], (old) => {
      if (!old) return old;
      const days = [...old.days];
      const i = days.findIndex((d) => d.date === localDate);
      if (i >= 0) days[i] = { ...days[i], answered: days[i].answered + count, correct: days[i].correct + right };
      else days.push({ date: localDate, answered: count, correct: right });
      return { ...old, days };
    });
    const rows = Array.from({ length: count }, (_, k) => ({ kind, item_id: count > 1 ? `${itemId}:${k}` : itemId, correct: k < right, local_date: localDate }));
    void supabase.from("study_events").insert(rows).then(({ error }) => {
      if (error) void qc.invalidateQueries({ queryKey: ["lawstin-state"] });
    });
  }, [qc]);
}
