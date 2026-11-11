import { useEffect, useRef, useState } from "react";
import { Skeleton } from "../components/Skeleton";
import { dateKey } from "../helpers/dateKey";
import { COURSE_KEYS, FINALS, studyEngine, type CoverageStatus } from "../helpers/studyEngine";
import styles from "./_index.module.css";

export type Engine = ReturnType<typeof studyEngine>;
export type MissedTopic = ReturnType<Engine["missedTopics"]>[number];

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5);

// First paint is final; later changes ease from the value currently on screen.
export function Num({ v, suffix = "" }: { v: number; suffix?: string }) {
  const [n, setN] = useState(v);
  const prev = useRef(v);
  const shown = useRef(v);
  useEffect(() => {
    const from = shown.current;
    if (prev.current === v) return;
    prev.current = v;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (from === v || reduce) { shown.current = v; setN(v); return; }
    let raf = 0;
    const t0 = performance.now(), d = 650;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / d);
      shown.current = Math.round(from + (v - from) * (1 - Math.pow(1 - p, 3)));
      setN(shown.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <>{n}{suffix}</>;
}

export function LoadingCard() {
  return (
    <div className={`${styles.card} ${styles.hero}`} aria-busy="true">
      <Skeleton style={{ height: 36, borderRadius: 10 }} />
      <Skeleton style={{ height: 48, width: "70%", borderRadius: 10 }} />
      <Skeleton style={{ height: 52, borderRadius: 14 }} />
    </div>
  );
}

export const STATUS_COLOR: Record<CoverageStatus, string> = { none: "var(--faint-foreground)", unseen: "var(--muted-foreground)", shaky: "var(--error)", learning: "var(--warning)", solid: "var(--success)" };
/** Finals that have not passed yet, soonest first. */
export const upcomingFinals = () => {
  const today = dateKey.today();
  return COURSE_KEYS.map((k) => ({ k, date: FINALS[k], days: dayDiff(today, FINALS[k]) }))
    .filter((f) => f.days >= 0).sort((a, b) => a.days - b.days);
};

export const pct = (a: number, b: number) => (b ? Math.min(100, Math.max(0, Math.round((a / b) * 100))) : 0);
