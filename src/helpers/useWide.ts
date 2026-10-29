import { useEffect, useState } from "react";

/** True on Mac and other wide screens (the desktop layout breakpoint). */
export function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1000px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1000px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}
