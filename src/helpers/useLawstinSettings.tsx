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
      if (input.action !== "set") return;
      qc.setQueryData<OutputType>(KEY, (old) => {
        if (!old) return old;
        const field = input.key === "notify_evening" ? "notifyEvening" : input.key === "notify_new" ? "notifyNew" : "weeklyEmail";
        return { ...old, settings: { ...old.settings, [field]: input.value } };
      });
    },
    onSuccess: (res) => qc.setQueryData<OutputType>(KEY, res),
    onError: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  return { query, action };
}
