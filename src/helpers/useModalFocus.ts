import { useEffect, useRef } from "react";

/**
 * While a full-screen view or sheet is open, the tabs and page behind it are inert, so Tab and
 * screen readers stay inside it. Focus moves into the view on open and returns to where it was
 * on close. A count keeps the page inert until the last open view closes.
 */
let open = 0;
const background = () => [document.querySelector("[data-app-panes]"), document.querySelector('nav[aria-label="Sections"]')];

export function useModalFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    open++;
    background().forEach((el) => el?.setAttribute("inert", ""));
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus({ preventScroll: true });
    return () => {
      open--;
      if (!open) background().forEach((el) => el?.removeAttribute("inert"));
      previous?.focus?.({ preventScroll: true });
    };
  }, []);
  return ref;
}
