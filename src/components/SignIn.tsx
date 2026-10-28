import React, { useEffect, useState } from "react";
import { BookOpen, Gavel, Globe, GraduationCap, Landmark, Scale, ScrollText } from "lucide-react";
import { supabase } from "../helpers/supabase";
import { switchToAutoMode } from "../helpers/themeMode";
import styles from "./SignIn.module.css";

// Decorative tiles that float around the card on wide screens; colors follow the course palette.
const TILES = [
  { Icon: Globe, color: "var(--course-il)" },
  { Icon: Scale, color: "var(--uh-red)" },
  { Icon: BookOpen, color: "var(--course-asy)" },
  { Icon: Gavel, color: "var(--course-pr)" },
  { Icon: Landmark, color: "var(--course-clinic)" },
  { Icon: ScrollText, color: "var(--course-tutoring)" },
  { Icon: GraduationCap, color: "var(--uh-red)" },
];

export function SignIn() {
  const [email, setEmail] = useState("trevinoaustin10@gmail.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { switchToAutoMode(); }, []);

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
      <div className={styles.scene} aria-hidden="true">
        <i className={styles.glow} /><i className={styles.glow} /><i className={styles.glow} />
        {TILES.map(({ Icon, color }, i) => (
          <span key={i} className={styles.tile} style={{ "--c": color, "--i": i } as React.CSSProperties}><Icon strokeWidth={1.6} /></span>
        ))}
      </div>
      <form className={styles.card} onSubmit={submit}>
        <img src="./icon-192.png" alt="" className={styles.icon} />
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
