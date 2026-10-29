import React, { useEffect, useRef, useState } from "react";
import { Bell, ChevronLeft, Download, LogOut, Mail, Minus, Moon, Plus, Send, Smartphone, Sparkles, Target, Type, Vibrate, Zap } from "lucide-react";
import { Switch } from "./Switch";
import { Spinner } from "./Spinner";
import { useLawstinSettings } from "../helpers/useLawstinSettings";
import { enablePush, disablePush, onPushEnabledChange, pushSupported } from "../helpers/pushClient";
import { readPrefs, writePrefs, type Appearance, type ReadingSize } from "../helpers/prefs";
import { getState } from "../endpoints/state_GET.schema";
import { supabase } from "../helpers/supabase";
import { dateKey } from "../helpers/dateKey";
import { haptic } from "../helpers/haptics";
import { toast } from "../helpers/toast";
import styles from "./SettingsPage.module.css";

type Action = Parameters<ReturnType<typeof useLawstinSettings>["action"]["mutateAsync"]>[0];

function Icon({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className={styles.icon} style={{ background: color }}>{children}</span>;
}

function Stepper({ value, min, max, step = 1, onChange, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string }) {
  return (
    <span className={styles.stepper} role="group" aria-label={label}>
      <button onClick={() => { haptic(); onChange(Math.max(min, value - step)); }} disabled={value <= min} aria-label={`Lower ${label}`}><Minus size={16} strokeWidth={2.6} /></button>
      <b>{value}</b>
      <button onClick={() => { haptic(); onChange(Math.min(max, value + step)); }} disabled={value >= max} aria-label={`Raise ${label}`}><Plus size={16} strokeWidth={2.6} /></button>
    </span>
  );
}

function Segments<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className={styles.seg} role="group" aria-label={label}>
      {options.map(([k, l]) => <button key={k} aria-pressed={value === k} className={value === k ? styles.segOn : ""} onClick={() => { if (value !== k) haptic(); onChange(k); }}>{l}</button>)}
    </div>
  );
}

/** Full-page settings, opened from the avatar at #/settings. */
export function SettingsPage({ email: account, onClose }: { email: string | null; onClose: () => void }) {
  const { query, action } = useLawstinSettings();
  const s = query.data?.settings;
  const [prefs, setPrefs] = useState(readPrefs);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [compact, setCompact] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);

  useEffect(() => onPushEnabledChange(setPushOn), []);
  useEffect(() => { if (s?.summaryEmail) setEmail(s.summaryEmail); }, [s?.summaryEmail]);
  const close = () => { setClosing(true); setTimeout(onClose, 300); };
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") close(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const pref = (patch: Parameters<typeof writePrefs>[0]) => setPrefs(writePrefs(patch));
  const togglePush = async (next: boolean) => {
    haptic();
    setPushBusy(true);
    try {
      if (next) {
        const ok = await enablePush();
        if (!ok) toast.error("Notifications are blocked for Lawstin in iPhone Settings");
      } else await disablePush();
    } catch (e) {
      toast.error((e as Error).message || "Couldn’t change notifications");
    } finally {
      setPushBusy(false);
      query.refetch();
    }
  };
  const run = async (key: string, input: Action) => {
    haptic();
    setBusy(key);
    try {
      const res = await action.mutateAsync(input);
      if (res.message) toast(res.message);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const set = (key: "notify_evening" | "notify_new" | "weekly_email" | "notify_nudges", value: boolean) => {
    haptic();
    action.mutate({ action: "set", key, value }, { onError: (e) => toast.error((e as Error).message) });
  };
  // Steppers show the new number at once and save shortly after the last tap.
  const [local, setLocal] = useState<{ daily_goal?: number; nudges_per_day?: number }>({});
  const timers = useRef<Record<string, number>>({});
  const setNumber = (key: "nudges_per_day" | "daily_goal", value: number) => {
    setLocal((l) => ({ ...l, [key]: value }));
    window.clearTimeout(timers.current[key]);
    timers.current[key] = window.setTimeout(() => {
      action.mutate({ action: "setNumber", key, value }, {
        onSettled: () => setLocal((l) => { const n = { ...l }; if (n[key] === value) delete n[key]; return n; }),
        onError: (e) => toast.error((e as Error).message),
      });
    }, 450);
  };
  const goal = local.daily_goal ?? s?.dailyGoal ?? 20;
  const perDay = local.nudges_per_day ?? s?.nudgesPerDay ?? 2;
  const saveEmail = () => {
    const v = email.trim();
    if (!v || v === s?.summaryEmail) return;
    action.mutate({ action: "setEmail", email: v }, { onSuccess: () => toast("Email saved"), onError: (e) => toast.error((e as Error).message) });
  };
  const exportData = async () => {
    haptic();
    setBusy("export");
    try {
      const [state, settings, tasks] = await Promise.all([
        getState(),
        supabase.from("app_settings").select("key,value,updated_at").or("key.like.study:%,key.like.workspace:%"),
        supabase.from("course_tasks").select("*"),
      ]);
      const data = { exported_at: new Date().toISOString(), progress: state.progress, days: state.days, study: settings.data ?? [], tasks: tasks.data ?? [] };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `lawstin-${dateKey.today()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error((e as Error).message || "Couldn’t export");
    } finally {
      setBusy(null);
    }
  };

  const notifyOff = !pushOn;
  return (
    <div className={`${styles.page} ${closing ? styles.closing : ""}`} role="dialog" aria-modal="true" aria-label="Settings">
      <header className={`${styles.bar} ${compact ? styles.barOn : ""}`}>
        <button className={styles.back} onClick={() => { haptic(); close(); }}><ChevronLeft size={24} strokeWidth={2.4} />Back</button>
        <span className={styles.barTitle}>Settings</span>
      </header>
      <div className={styles.scroll} ref={scroll} onScroll={(e) => { const on = e.currentTarget.scrollTop > 40; if (on !== compact) setCompact(on); }}>
        <div className={styles.inner}>
          <h1 className={styles.title}>Settings</h1>

          <section className={`${styles.card} ${styles.profile}`}>
            <span className={styles.avatar}>A</span>
            <div><b>Austin</b>{account && <span>{account}</span>}</div>
          </section>

          <section className={styles.group}>
            <h2>Study</h2>
            <div className={styles.card}>
              <div className={styles.row}>
                <Icon color="var(--uh-red)"><Target size={16} /></Icon>
                <span className={styles.label}>Daily goal</span>
                <Stepper label="daily goal" value={goal} min={5} max={100} step={5} onChange={(v) => setNumber("daily_goal", v)} />
              </div>
              <div className={`${styles.row} ${styles.stack}`}>
                <div className={styles.rowHead}><Icon color="#5e5ce6"><Type size={16} /></Icon><span className={styles.label}>Question text size</span></div>
                <Segments<ReadingSize> label="Question text size" value={prefs.reading} onChange={(v) => pref({ reading: v })} options={[["s", "Small"], ["m", "Default"], ["l", "Large"], ["xl", "Larger"]]} />
              </div>
              <label className={styles.row}>
                <Icon color="#30b0c7"><Vibrate size={16} /></Icon>
                <span className={styles.label}>Haptics</span>
                <Switch checked={prefs.haptics} onCheckedChange={(v) => pref({ haptics: v })} aria-label="Haptics" />
              </label>
            </div>
          </section>

          <section className={styles.group}>
            <h2>Appearance</h2>
            <div className={styles.card}>
              <div className={`${styles.row} ${styles.stack}`}>
                <div className={styles.rowHead}><Icon color="#3a3a3c"><Moon size={16} /></Icon><span className={styles.label}>Theme</span></div>
                <Segments<Appearance> label="Theme" value={prefs.appearance} onChange={(v) => pref({ appearance: v })} options={[["auto", "Automatic"], ["light", "Light"], ["dark", "Dark"]]} />
              </div>
            </div>
          </section>

          <section className={styles.group}>
            <h2>Notifications</h2>
            <div className={styles.card}>
              <label className={styles.row}>
                <Icon color="#ff3b30"><Bell size={16} /></Icon>
                <span className={styles.label}>Allow notifications</span>
                {pushBusy ? <Spinner size="sm" /> : <Switch checked={pushOn} disabled={!pushSupported()} onCheckedChange={togglePush} aria-label="Allow notifications" />}
              </label>
              <label className={`${styles.row} ${notifyOff ? styles.off : ""}`}>
                <Icon color="#ff9500"><Zap size={16} /></Icon>
                <span className={styles.label}>Question nudges</span>
                <Switch checked={s?.notifyNudges ?? true} disabled={!s} onCheckedChange={(v) => set("notify_nudges", v)} aria-label="Question nudges" />
              </label>
              {(s?.notifyNudges ?? true) && (
                <div className={`${styles.row} ${notifyOff ? styles.off : ""}`}>
                  <span className={styles.indent} />
                  <span className={styles.label}>Nudges per day</span>
                  <Stepper label="nudges per day" value={perDay} min={1} max={6} onChange={(v) => setNumber("nudges_per_day", v)} />
                </div>
              )}
              <label className={`${styles.row} ${notifyOff ? styles.off : ""}`}>
                <Icon color="#5856d6"><Moon size={16} /></Icon>
                <span className={styles.label}>Evening reminder</span>
                <Switch checked={s?.notifyEvening ?? true} disabled={!s} onCheckedChange={(v) => set("notify_evening", v)} aria-label="Evening reminder" />
              </label>
              <label className={`${styles.row} ${notifyOff ? styles.off : ""}`}>
                <Icon color="#34c759"><Sparkles size={16} /></Icon>
                <span className={styles.label}>New questions</span>
                <Switch checked={s?.notifyNew ?? true} disabled={!s} onCheckedChange={(v) => set("notify_new", v)} aria-label="New questions" />
              </label>
              <button className={styles.row} disabled={notifyOff || busy === "nudge"} onClick={() => run("nudge", { action: "testNudge" })}>
                <Icon color="#ff9500"><Send size={16} /></Icon>
                <span className={`${styles.label} ${styles.link}`}>Send me a question now</span>
                {busy === "nudge" && <Spinner size="sm" />}
              </button>
              <button className={styles.row} disabled={notifyOff || busy === "test"} onClick={() => run("test", { action: "testPush" })}>
                <Icon color="#8e8e93"><Smartphone size={16} /></Icon>
                <span className={`${styles.label} ${styles.link}`}>Send a test notification</span>
                {busy === "test" && <Spinner size="sm" />}
              </button>
            </div>
          </section>

          <section className={styles.group}>
            <h2>Weekly email</h2>
            <div className={styles.card}>
              <label className={styles.row}>
                <Icon color="#007aff"><Mail size={16} /></Icon>
                <span className={styles.label}>Sunday summary</span>
                <Switch checked={s?.weeklyEmail ?? true} disabled={!s} onCheckedChange={(v) => set("weekly_email", v)} aria-label="Sunday summary" />
              </label>
              <div className={styles.row}>
                <span className={styles.indent} />
                <input className={styles.input} type="email" inputMode="email" autoComplete="email" value={email} placeholder="Email address"
                  onChange={(e) => setEmail(e.target.value)} onBlur={saveEmail} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label="Summary email address" />
              </div>
              <button className={styles.row} disabled={busy === "weekly"} onClick={() => run("weekly", { action: "sendWeekly" })}>
                <Icon color="#007aff"><Send size={16} /></Icon>
                <span className={`${styles.label} ${styles.link}`}>Send this week’s summary now</span>
                {busy === "weekly" && <Spinner size="sm" />}
              </button>
            </div>
          </section>

          <section className={styles.group}>
            <h2>Data</h2>
            <div className={styles.card}>
              <button className={styles.row} disabled={busy === "export"} onClick={exportData}>
                <Icon color="#8e8e93"><Download size={16} /></Icon>
                <span className={`${styles.label} ${styles.link}`}>Export my data</span>
                {busy === "export" && <Spinner size="sm" />}
              </button>
              <button className={styles.row} onClick={() => { haptic(); supabase.auth.signOut(); }}>
                <Icon color="#ff3b30"><LogOut size={16} /></Icon>
                <span className={`${styles.label} ${styles.danger}`}>Sign out</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
