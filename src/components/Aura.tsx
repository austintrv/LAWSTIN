import React from "react";
import styles from "./Aura.module.css";

/**
 * The soft drifting glows from the sign-in page, as a backdrop for any section. Place it first
 * inside an element with the `auraHost` class; it sits behind that element's content.
 */
export function Aura({ colors, className }: { colors: [string, string, string]; className?: string }) {
  return (
    <div className={`${styles.aura} ${className ?? ""}`} aria-hidden="true">
      {colors.map((c, i) => <i key={i} style={{ "--glow": c } as React.CSSProperties} />)}
    </div>
  );
}

export const auraHost = styles.host;
