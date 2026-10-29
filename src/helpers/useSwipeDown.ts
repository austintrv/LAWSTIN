import { useRef } from "react";

/**
 * Drag a sheet down by its handle to dismiss it, like iOS sheets. Spread `handle` on the header
 * area and put `ref` on the element that moves. A short pull springs back; a long or quick one
 * calls onClose, whose closing animation continues from where the finger let go.
 */
export function useSwipeDown<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const start = useRef<{ y: number; t: number } | null>(null);
  const dy = useRef(0);
  const handle = {
    onTouchStart: (e: React.TouchEvent) => {
      start.current = { y: e.touches[0].clientY, t: Date.now() };
      dy.current = 0;
      if (ref.current) ref.current.style.transition = "none";
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!start.current || !ref.current) return;
      dy.current = Math.max(0, e.touches[0].clientY - start.current.y);
      ref.current.style.transform = dy.current ? `translateY(${dy.current}px)` : "";
    },
    onTouchEnd: () => {
      const s = start.current, el = ref.current;
      start.current = null;
      if (!s || !el) return;
      const speed = dy.current / Math.max(1, Date.now() - s.t);
      if (dy.current > 110 || (dy.current > 30 && speed > 0.6)) { onClose(); return; }
      el.style.transition = "transform 0.3s var(--ease-ios)";
      el.style.transform = "";
    },
    style: { touchAction: "none" } as React.CSSProperties,
  };
  return { ref, handle };
}
