import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { postSettings, type InputType, type OutputType } from "../endpoints/settings_POST.schema";

const KEY = ["lawstin-settings"] as const;

/** Notification and weekly-email settings. Every action returns the fresh settings. */
export function useLawstinSettings(enabled = true) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => postSettings({ action: "get" }),
    placeholderData: (prev) => prev,
    enabled,
  });
  const action = useMutation({
    mutationFn: (input: Exclude<InputType, { action: "get" }>) => postSettings(input),
    onMutate: (input) => {
      if (input.action !== "set" && input.action !== "setNumber") return;
      const field = ({ notify_evening: "notifyEvening", notify_new: "notifyNew", weekly_email: "weeklyEmail", notify_nudges: "notifyNudges", nudges_per_day: "nudgesPerDay", daily_goal: "dailyGoal" } as const)[input.key];
      qc.setQueryData<OutputType>(KEY, (old) => (old ? { ...old, settings: { ...old.settings, [field]: input.value } } : old));
    },
    onSuccess: (res) => qc.setQueryData<OutputType>(KEY, res),
    onError: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  return { query, action };
}
