import { supabase } from "../helpers/supabase";

export type SettingKey = "notify_evening" | "notify_new" | "weekly_email" | "notify_nudges";
export type NumberKey = "nudges_per_day" | "daily_goal";

export type InputType =
  | { action: "get" }
  | { action: "set"; key: SettingKey; value: boolean }
  | { action: "setNumber"; key: NumberKey; value: number }
  | { action: "setEmail"; email: string }
  | { action: "subscribe"; subscription: Record<string, unknown>; previousIdentity?: string | null }
  | { action: "unsubscribe"; identity?: string | null }
  | { action: "testPush" }
  | { action: "testNudge" }
  | { action: "sendWeekly" };

export type SettingsDTO = {
  notifyEvening: boolean;
  notifyNew: boolean;
  weeklyEmail: boolean;
  notifyNudges: boolean;
  nudgesPerDay: number;
  dailyGoal: number;
  summaryEmail: string | null;
  devices: number;
};
export type OutputType = { settings: SettingsDTO; message?: string };

const clamp = (n: number, lo: number, hi: number, fallback: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback);
const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };
const identityOf = (sub: Record<string, unknown>) => String(sub.endpoint ?? "");

async function readSettings(): Promise<SettingsDTO> {
  const [s, d] = await Promise.all([
    supabase.from("app_settings").select("key, value").in("key", ["notify_evening", "notify_new", "weekly_email", "summary_email", "notify_nudges", "nudges_per_day", "daily_goal"]),
    supabase.from("push_subscriptions").select("identity", { count: "exact", head: true }),
  ]);
  fail(s.error); fail(d.error);
  const m = Object.fromEntries((s.data ?? []).map((r) => [r.key, r.value]));
  return {
    notifyEvening: m.notify_evening !== "0",
    notifyNew: m.notify_new !== "0",
    weeklyEmail: m.weekly_email !== "0",
    notifyNudges: m.notify_nudges !== "0",
    nudgesPerDay: clamp(Number(m.nudges_per_day ?? 2), 1, 6, 2),
    dailyGoal: clamp(Number(m.daily_goal ?? 20), 5, 100, 20),
    summaryEmail: m.summary_email ?? null,
    devices: d.count ?? 0,
  };
}

async function setValue(key: string, value: string) {
  const { error } = await supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  fail(error);
}

async function notify(job: "test" | "weekly" | "nudge"): Promise<string> {
  const { data, error } = await supabase.functions.invoke("notify", { body: { job } });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return (data as { result: string }).result;
}

/** Notification and weekly-email settings, stored in Supabase. Every action returns the fresh settings. */
export const postSettings = async (input: InputType): Promise<OutputType> => {
  let message: string | undefined;
  if (input.action === "set") {
    await setValue(input.key, input.value ? "1" : "0");
  } else if (input.action === "setNumber") {
    const [lo, hi] = input.key === "daily_goal" ? [5, 100] : [1, 6];
    await setValue(input.key, String(clamp(input.value, lo, hi, lo)));
  } else if (input.action === "setEmail") {
    const email = input.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email address doesn’t look right");
    await setValue("summary_email", email);
  } else if (input.action === "subscribe") {
    const identity = identityOf(input.subscription);
    if (!identity) throw new Error("That subscription has no endpoint");
    if (input.previousIdentity && input.previousIdentity !== identity) {
      fail((await supabase.from("push_subscriptions").delete().eq("identity", input.previousIdentity)).error);
    }
    fail((await supabase.from("push_subscriptions").upsert({ identity, subscription: input.subscription })).error);
  } else if (input.action === "unsubscribe") {
    if (input.identity) fail((await supabase.from("push_subscriptions").delete().eq("identity", input.identity)).error);
  } else if (input.action === "testPush") {
    message = await notify("test");
  } else if (input.action === "testNudge") {
    message = await notify("nudge");
  } else if (input.action === "sendWeekly") {
    message = await notify("weekly");
  }
  return { settings: await readSettings(), message };
};
