import { X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useBackClose } from "../helpers/useBackClose";
import { useModalFocus } from "../helpers/useModalFocus";
import { useSwipeDown } from "../helpers/useSwipeDown";
import styles from "../pages/_index.module.css";

export function BottomSheet({ title, eyebrow, onClose, children, className }: { className?: string; title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode }) {
  const [closing, setClosing] = useState(false);
  const close = () => { setClosing(true); setTimeout(onClose, 300); };
  useBackClose(close);
  const swipe = useSwipeDown<HTMLDivElement>(close);
  const modalRef = useModalFocus<HTMLDivElement>();
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") close(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  return (
    <div ref={modalRef} tabIndex={-1} className={`${styles.scrim} ${closing ? styles.scrimOut : ""}`} onClick={close}>
      <div ref={swipe.ref} className={`${styles.bsheet} ${className ?? ""} ${closing ? styles.bsheetOut : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={(ev) => ev.stopPropagation()}>
        <div {...swipe.handle}>
          <div className={styles.grab} />
          <div className={styles.bsheetHead}>
            <div>{eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}<h2>{title}</h2></div>
            <button className={styles.x} onClick={close} aria-label="Close"><X size={15} strokeWidth={2.4} /></button>
          </div>
        </div>
        <div className={styles.bsheetBody}>{children}</div>
      </div>
    </div>
  );
}
