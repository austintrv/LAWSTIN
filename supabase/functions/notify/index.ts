// Lawstin notifications and weekly email.
// Called by: the hourly database scheduler ("tick"), the runs-table trigger ("newQuestions")
// — both with the x-lawstin-key header — and by the app's Settings panel ("test", "weekly")
// with Austin's sign-in token.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sendPush, type PushSubscription, type VapidKeys } from "../_shared/webpush.ts";
import { studyEngine, COURSES, COURSE_KEYS, type CourseCode } from "../_shared/studyEngine.ts";
import { dateKey } from "../_shared/dateKey.ts";
import type { State } from "../_shared/types.ts";

const OWNER = "trevinoaustin10@gmail.com";
const APP_URL = "https://austintrv.github.io/LAWSTIN/";
const TZ = "America/Chicago";
const EVENING_HOUR = 18;
const WEEKLY_DAY = "Sun";
const WEEKLY_HOUR = 11;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function chicagoNow() {
  const d = new Date();
  const today = d.toLocaleDateString("en-CA", { timeZone: TZ });
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(d));
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
  return { today, hour, weekday };
}

type Ctx = { db: SupabaseClient; settings: Record<string, string> };

async function loadSettings(db: SupabaseClient): Promise<Record<string, string>> {
  const { data, error } = await db.from("app_settings").select("key, value");
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}
async function setSetting(db: SupabaseClient, key: string, value: string) {
  const { error } = await db.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
async function secrets(db: SupabaseClient): Promise<Record<string, string>> {
  const { data, error } = await db.from("server_secrets").select("key, value");
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}
async function loadState(db: SupabaseClient, today: string): Promise<State> {
  const { data, error } = await db.rpc("get_state", { p_today: today });
  if (error) throw new Error(error.message);
  return data as State;
}

async function pushToAll(db: SupabaseClient, payload: { title: string; body: string; url?: string; tag?: string }) {
  const s = await secrets(db);
  if (!s.vapid_private_jwk || !s.vapid_public) throw new Error("Notification keys are missing");
  const keys: VapidKeys = { publicKey: s.vapid_public, privateJwk: JSON.parse(s.vapid_private_jwk), subject: `mailto:${OWNER}` };
  const { data: rows, error } = await db.from("push_subscriptions").select("identity, subscription");
  if (error) throw new Error(error.message);
  if (!rows?.length) return { sent: 0, failed: 0, devices: 0 };
  const results = await Promise.all(rows.map((r) => sendPush(r.subscription as PushSubscription, { url: APP_URL, ...payload }, keys)));
  const gone = rows.filter((_, i) => results[i].gone).map((r) => r.identity);
  if (gone.length) await db.from("push_subscriptions").delete().in("identity", gone);
  results.forEach((r, i) => { if (!r.success && !r.gone) console.error("push failed", rows[i].identity.slice(0, 60), r.statusCode, r.error); });
  return { sent: results.filter((r) => r.success).length, failed: results.filter((r) => !r.success).length, devices: rows.length - gone.length };
}

async function evening(ctx: Ctx, today: string, force: boolean) {
  const { db, settings: s } = ctx;
  if (!force && s.notify_evening === "0") return "Evening reminder is off";
  if (!force && s.last_evening_push === today) return "Already sent today";
  const state = await loadState(db, today);
  const e = studyEngine(state, today);
  if (!force && (e.todayCount?.answered ?? 0) > 0) return "Already studied today";
  const { due, fresh } = e.queues("all");
  if (!force && !due.length && !fresh.length) return "Nothing to study";
  const streak = e.streak();
  const parts = [due.length ? `${plural(due.length, "review")} due` : "", fresh.length ? `${fresh.length} new` : ""].filter(Boolean);
  const title = streak >= 2 ? `Keep your ${streak}-day streak` : due.length ? `${plural(due.length, "review")} due` : "Time for a round";
  const body = parts.length ? `${parts.join(" · ")}. One round is 10 questions.` : "One round is 10 questions.";
  const r = await pushToAll(db, { title, body, tag: `evening-${today}` });
  if (!force) await setSetting(db, "last_evening_push", today);
  return `Evening reminder sent to ${r.sent} of ${r.devices} devices`;
}

async function newQuestions(ctx: Ctx, today: string) {
  const { db, settings: s } = ctx;
  if (s.notify_new === "0") return "New-question notifications are off";
  const { data: run } = await db.from("runs").select("run_date, added, by_course, note").order("run_date", { ascending: false }).limit(1).maybeSingle();
  if (!run || run.added <= 0) return "No update with new questions";
  if (run.run_date !== today) return "No update today";
  const stamp = `${run.run_date}:${run.added}`;
  if (s.last_run_push === stamp) return "Already sent for this update";
  const body = Object.entries((run.by_course ?? {}) as Record<string, number>)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `+${n} ${COURSES[k as CourseCode]?.short ?? k}`)
    .join(" · ");
  const r = await pushToAll(db, { title: plural(run.added, "new question"), body: body || String(run.note).slice(0, 120), tag: `run-${run.run_date}` });
  await setSetting(db, "last_run_push", stamp);
  return `New-question notification sent to ${r.sent} of ${r.devices} devices`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const HEX: Record<CourseCode, string> = { il: "#2f6be6", asy: "#0d8f84", pr: "#c25a12" };

async function weeklyEmail(db: SupabaseClient, state: State, today: string) {
  const e = studyEngine(state, today);
  const start = dateKey.addDays(today, -6);
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });

  const days14 = e.lastNDays(14);
  const prev = days14.slice(0, 7), week = days14.slice(7);
  const sum = (ds: typeof week) => ds.reduce((a, d) => ({ a: a.a + d.answered, c: a.c + d.correct }), { a: 0, c: 0 });
  const w = sum(week), p = sum(prev);
  const studied = week.filter((d) => d.answered > 0).length;

  const { data: ans, error } = await db.from("answers").select("is_correct, questions(course)").gte("local_date", start);
  if (error) throw new Error(error.message);
  const byCourse = new Map<CourseCode, { a: number; c: number }>();
  for (const r of (ans ?? []) as unknown as { is_correct: boolean; questions: { course: CourseCode } | null }[]) {
    const k = r.questions?.course;
    if (!k) continue;
    const b = byCourse.get(k) ?? { a: 0, c: 0 };
    b.a++; if (r.is_correct) b.c++;
    byCourse.set(k, b);
  }

  const weak = e.topicStats().filter((t) => t.c + t.w >= 2).map((t) => ({ ...t, acc: pct(t.c, t.c + t.w) })).filter((t) => t.acc < 80).sort((a, b) => a.acc - b.acc).slice(0, 4);
  const qmap = new Map(state.questions.map((q) => [q.id, q]));
  const misses = state.progress
    .filter((x) => x.wrong >= 2 && qmap.has(x.questionId))
    .sort((a, b) => b.wrong - a.wrong || (a.lastCorrect ? 1 : 0) - (b.lastCorrect ? 1 : 0))
    .slice(0, 5)
    .map((x) => ({ p: x, q: qmap.get(x.questionId)! }));
  const { due, fresh } = e.queues("all");
  const added = state.runs.filter((r) => r.date >= start).reduce((a, r) => a + r.added, 0);
  const streak = e.streak();

  const range = `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(today, { month: "short", day: "numeric" })}`;
  const subject = w.a ? `Your Lawstin Week: ${w.a} Answered, ${pct(w.c, w.a)}% Correct` : "Your Lawstin Week";
  const diff = w.a && p.a ? pct(w.c, w.a) - pct(p.c, p.a) : null;
  const diffLine = diff === null ? "" : diff === 0 ? "Same accuracy as the week before." : `${diff > 0 ? "Up" : "Down"} ${Math.abs(diff)} points from the week before.`;

  const font = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`;
  const stat = (n: string, l: string) => `<td style="padding:14px 8px;text-align:center;width:33%"><div style="font-size:26px;font-weight:700;color:#111114;letter-spacing:-0.02em">${n}</div><div style="font-size:12px;color:#6a6a73;margin-top:2px">${l}</div></td>`;
  const section = (title: string, inner: string) => `<tr><td style="padding:22px 0 8px;font-size:17px;font-weight:650;color:#111114">${title}</td></tr><tr><td style="background:#ffffff;border-radius:16px;padding:4px 16px">${inner}</td></tr>`;
  const row = (left: string, right: string, sub = "", last = false) =>
    `<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:${last ? "0" : "1px solid #ececf0"}"><tr><td style="padding:12px 0;font-size:15px;color:#111114">${left}${sub ? `<div style="font-size:13px;color:#6a6a73;margin-top:2px">${sub}</div>` : ""}</td><td style="padding:12px 0;text-align:right;font-size:15px;color:#6a6a73;white-space:nowrap;vertical-align:top">${right}</td></tr></table>`;

  const courseHtml = COURSE_KEYS.map((k, i) => {
    const b = byCourse.get(k);
    const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${HEX[k]};margin-right:8px"></span>`;
    return row(`${dot}${esc(COURSES[k].name)}`, b?.a ? `${pct(b.c, b.a)}% · ${b.a}` : "—", "", i === COURSE_KEYS.length - 1);
  }).join("");
  const weakHtml = weak.length ? weak.map((t, i) => row(esc(t.topic), `${t.acc}%`, `${esc(COURSES[t.course].short)} · ${t.c + t.w} answers`, i === weak.length - 1)).join("") : row("No weak topics yet", "");
  const missHtml = misses.length ? misses.map(({ p: x, q }, i) => row(esc(q.subtopic ?? q.topic), `missed ${x.wrong}×`, esc(q.prompt), i === misses.length - 1)).join("") : row("No repeat misses", "");

  const html = `<!doctype html><html><body style="margin:0;background:#f2f2f7;font-family:${font}">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f7"><tr><td align="center" style="padding:28px 16px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#6a6a73">${esc(range)}</td></tr>
<tr><td style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:34px;color:#c8102e;padding:4px 0 14px">Your week, Austin</td></tr>
<tr><td style="background:#ffffff;border-radius:16px"><table width="100%" cellpadding="0" cellspacing="0"><tr>${stat(String(w.a), "Answered")}${stat(w.a ? `${pct(w.c, w.a)}%` : "—", "Correct")}${stat(`${studied}/7`, "Days studied")}</tr></table></td></tr>
${diffLine || streak >= 2 ? `<tr><td style="padding:10px 4px 0;font-size:14px;color:#6a6a73">${[diffLine, streak >= 2 ? `${streak}-day streak.` : ""].filter(Boolean).join(" ")}</td></tr>` : ""}
${section("By course", courseHtml)}
${section("Weakest topics", weakHtml)}
${section("Questions you keep missing", missHtml)}
${section("Coming up", row("Reviews due now", String(due.length)) + row("New questions waiting", String(fresh.length)) + row("Added this week", String(added), "", true))}
<tr><td align="center" style="padding:26px 0 8px"><a href="${APP_URL}" style="display:inline-block;background:#c8102e;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 28px;border-radius:14px">Open Lawstin</a></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `Your week, Austin (${range})`, "",
    `Answered: ${w.a}   Correct: ${w.a ? `${pct(w.c, w.a)}%` : "—"}   Days studied: ${studied}/7`,
    [diffLine, streak >= 2 ? `${streak}-day streak.` : ""].filter(Boolean).join(" "), "",
    "By course",
    ...COURSE_KEYS.map((k) => { const b = byCourse.get(k); return `- ${COURSES[k].name}: ${b?.a ? `${pct(b.c, b.a)}% of ${b.a}` : "—"}`; }), "",
    "Weakest topics",
    ...(weak.length ? weak.map((t) => `- ${t.topic} (${COURSES[t.course].short}): ${t.acc}%`) : ["- None yet"]), "",
    "Questions you keep missing",
    ...(misses.length ? misses.map(({ p: x, q }) => `- ${q.subtopic ?? q.topic}, missed ${x.wrong}×: ${q.prompt}`) : ["- None"]), "",
    `Reviews due now: ${due.length}. New questions waiting: ${fresh.length}. Added this week: ${added}.`, "",
    APP_URL,
  ].join("\n");
  return { subject, html, text };
}

async function weekly(ctx: Ctx, today: string, force: boolean) {
  const { db, settings: s } = ctx;
  if (!force && s.weekly_email === "0") return "Weekly email is off";
  if (!force && s.last_weekly_email === today) return "Already sent today";
  const to = s.summary_email;
  if (!to) throw new Error("No email address is set for the weekly summary");
  const key = Deno.env.get("RESEND_API_KEY") || (await secrets(db)).resend_api_key;
  if (!key) throw new Error("Email isn’t set up yet");
  const mail = await weeklyEmail(db, await loadState(db, today), today);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Lawstin <onboarding@resend.dev>", to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) throw new Error(`Email failed: ${(await res.text()).slice(0, 200)}`);
  if (!force) await setSetting(db, "last_weekly_email", today);
  return `Weekly summary sent to ${to}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { job } = (await req.json().catch(() => ({}))) as { job?: string };

    // Who is calling: the scheduler (key header) or Austin from the app (sign-in token).
    const key = req.headers.get("x-lawstin-key");
    let scheduler = false;
    if (key) {
      const s = await secrets(db);
      scheduler = !!s.cron_key && key === s.cron_key;
      if (!scheduler) return json({ error: "Unauthorized" }, 401);
    } else {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data } = await db.auth.getUser(token);
      if (data.user?.email !== OWNER) return json({ error: "Unauthorized" }, 401);
    }

    const ctx: Ctx = { db, settings: await loadSettings(db) };
    const { today, hour, weekday } = chicagoNow();
    let result: string;

    if (scheduler && job === "tick") {
      const out: string[] = [];
      if (hour === EVENING_HOUR) out.push(await evening(ctx, today, false));
      if (weekday === WEEKLY_DAY && hour === WEEKLY_HOUR) out.push(await weekly(ctx, today, false));
      result = out.join("; ") || `Nothing scheduled at ${hour}:00`;
    } else if (scheduler && job === "newQuestions") {
      result = await newQuestions(ctx, today);
    } else if (!scheduler && job === "test") {
      const r = await pushToAll(db, { title: "Lawstin", body: "Notifications are working.", tag: `test-${Date.now()}` });
      if (!r.devices) throw new Error("No devices have notifications turned on");
      result = r.sent ? `Sent to ${plural(r.sent, "device")}` : "The notification didn’t go through";
    } else if (!scheduler && job === "weekly") {
      result = await weekly(ctx, today, true);
    } else if (!scheduler && job === "evening") {
      result = await evening(ctx, today, true);
    } else {
      return json({ error: "Unknown job" }, 400);
    }
    console.log(`notify ${job}: ${result}`);
    return json({ ok: true, job, result });
  } catch (e) {
    console.error("notify failed", e);
    return json({ error: (e as Error).message }, 400);
  }
});
