import React, { useState } from "react";
import { supabase } from "../helpers/supabase";
import styles from "./SignIn.module.css";

export function SignIn() {
  const [email, setEmail] = useState("trevinoaustin10@gmail.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "That password didn’t work" : error.message);
  };

  return (
    <div className={styles.wrap}>
      <section className={styles.welcome}>
        <p>Lawstin</p>
        <h2>Your law school.<br /><em>In one place.</em></h2>
        <div className={styles.geometry} aria-hidden="true"><i /><i /><i /></div>
      </section>
      <form className={styles.card} onSubmit={submit}>
        <span className={styles.eyebrow}>Lawstin</span>
        <h1 className={styles.greet}>Welcome back, Austin</h1>
        <label className={styles.field}>
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={styles.field}>
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.cta} type="submit" disabled={busy || !password}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
