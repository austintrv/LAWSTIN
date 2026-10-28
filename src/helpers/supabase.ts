import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://vbqfmgsrxurdazujbbuk.supabase.co";
// Publishable key: safe to ship in the app. Row-level security limits all data to Austin's account.
export const SUPABASE_KEY = "sb_publishable_lJ01rkqwRPvuiFCFzGoRmw_sHP6xgS6";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "lawstin-auth" },
});

/** Calls a database function and throws its error message on failure. */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
