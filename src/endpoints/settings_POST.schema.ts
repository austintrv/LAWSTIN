import { supabase } from "../helpers/supabase";

export type SettingKey = "notify_evening" | "notify_new" | "weekly_email";

export type InputType =
  | { action: "get" }
  | { action: "set"; key: SettingKey; value: boolean }
  | { action: "setEmail"; email: string }
  | { action: "subscribe"; subscription: Record<string, unknown>; previousIdentity?: string | null }
  | { action: "unsubscribe"; identity?: string | null }
  | { action: "testPush" }
  | { action: "sendWeekly" };

export type SettingsDTO = {
  notifyEvening: boolean;
  notifyNew: boolean;
  weeklyEmail: boolean;
  summaryEmail: string | null;
  devices: number;
};
export type OutputType = { settings: SettingsDTO; message?: string };

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };
const identityOf = (sub: Record<string, unknown>) => String(sub.endpoint ?? "");

async function readSettings(): Promise<SettingsDTO> {
  const [s, d] = await Promise.all([
    supabase.from("app_settings").select("key, value").in("key", ["notify_evening", "notify_new", "weekly_email", "summary_email"]),
    supabase.from("push_subscriptions").select("identity", { count: "exact", head: true }),
  ]);
  fail(s.error); fail(d.error);
  const m = Object.fromEntries((s.data ?? []).map((r) => [r.key, r.value]));
  return {
    notifyEvening: m.notify_evening !== "0",
    notifyNew: m.notify_new !== "0",
    weeklyEmail: m.weekly_email !== "0",
    summaryEmail: m.summary_email ?? null,
    devices: d.count ?? 0,
  };
}

async function setValue(key: string, value: string) {
  const { error } = await supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  fail(error);
}

async function notify(job: "test" | "weekly"): Promise<string> {
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
  } else if (input.action === "sendWeekly") {
    message = await notify("weekly");
  }
  return { settings: await readSettings(), message };
};
