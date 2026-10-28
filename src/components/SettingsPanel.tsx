import React, { useEffect, useState } from "react";
import { Switch } from "./Switch";
import { Input } from "./Input";
import { Spinner } from "./Spinner";
import { useLawstinSettings } from "../helpers/useLawstinSettings";
import { enablePush, disablePush, onPushEnabledChange } from "../helpers/pushClient";
import { supabase } from "../helpers/supabase";
import { haptic } from "../helpers/haptics";
import { toast } from "../helpers/toast";
import styles from "./SettingsPanel.module.css";

export function SettingsPanel({ className }: { className?: string }) {
  const { query, action } = useLawstinSettings();
  const s = query.data?.settings;
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => onPushEnabledChange(setPushOn), []);
  useEffect(() => { if (s?.summaryEmail) setEmail(s.summaryEmail); }, [s?.summaryEmail]);

  const togglePush = async (next: boolean) => {
    haptic();
    setPushBusy(true);
    try {
      if (next) {
        const ok = await enablePush();
        if (!ok) toast.error("Notifications are off for Lawstin. On iPhone, open Lawstin from the Home Screen and allow notifications.");
      } else {
        await disablePush();
      }
    } catch (e) {
      toast.error((e as Error).message || "Couldn’t change notifications");
    } finally {
      setPushBusy(false);
      query.refetch();
    }
  };

  const run = async (key: string, input: Parameters<typeof action.mutateAsync>[0]) => {
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

  const set = (key: "notify_evening" | "notify_new" | "weekly_email", value: boolean) => {
    haptic();
    action.mutate({ action: "set", key, value }, { onError: (e) => toast.error((e as Error).message) });
  };

  const saveEmail = () => {
    const v = email.trim();
    if (!v || v === s?.summaryEmail) return;
    action.mutate({ action: "setEmail", email: v }, { onSuccess: () => toast("Email saved"), onError: (e) => toast.error((e as Error).message) });
  };

  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
      <section className={styles.sec}>
        <h3 className={styles.h}>Notifications</h3>
        <div className={styles.list}>
          <label className={styles.row}>
            <span className={styles.title}>Allow notifications</span>
            {pushBusy ? <Spinner size="sm" /> : <Switch checked={pushOn} onCheckedChange={togglePush} aria-label="Allow notifications" />}
          </label>
          <label className={`${styles.row} ${!pushOn ? styles.off : ""}`}>
            <span className={styles.title}>Evening reminder</span>
            <Switch checked={s?.notifyEvening ?? true} disabled={!s} onCheckedChange={(v) => set("notify_evening", v)} aria-label="Evening reminder" />
          </label>
          <label className={`${styles.row} ${!pushOn ? styles.off : ""}`}>
            <span className={styles.title}>New questions</span>
            <Switch checked={s?.notifyNew ?? true} disabled={!s} onCheckedChange={(v) => set("notify_new", v)} aria-label="New questions" />
          </label>
          <button className={`${styles.row} ${styles.btn}`} disabled={!pushOn || busy === "test"} onClick={() => run("test", { action: "testPush" })}>
            <span className={styles.link}>Send a test notification</span>
            {busy === "test" && <Spinner size="sm" />}
          </button>
        </div>
      </section>

      <section className={styles.sec}>
        <h3 className={styles.h}>Weekly email</h3>
        <div className={styles.list}>
          <label className={styles.row}>
            <span className={styles.title}>Sunday summary</span>
            <Switch checked={s?.weeklyEmail ?? true} disabled={!s} onCheckedChange={(v) => set("weekly_email", v)} aria-label="Sunday summary" />
          </label>
          <div className={styles.row}>
            <Input className={styles.input} type="email" inputMode="email" autoComplete="email" value={email} placeholder="Email address"
              onChange={(e) => setEmail(e.target.value)} onBlur={saveEmail} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label="Summary email address" />
          </div>
          <button className={`${styles.row} ${styles.btn}`} disabled={busy === "weekly"} onClick={() => run("weekly", { action: "sendWeekly" })}>
            <span className={styles.link}>Send this week’s summary now</span>
            {busy === "weekly" && <Spinner size="sm" />}
          </button>
        </div>
      </section>

      <section className={styles.sec}>
        <div className={styles.list}>
          <button className={`${styles.row} ${styles.btn}`} onClick={() => { haptic(); supabase.auth.signOut(); }}>
            <span className={styles.link}>Sign out</span>
          </button>
        </div>
      </section>
    </div>
  );
}
