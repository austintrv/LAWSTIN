// Light tap feedback. Android uses the Vibration API; iOS 18+ Safari fires a system haptic
// when a native switch input is toggled through its label, so we keep one hidden switch around.
let label: HTMLLabelElement | null = null;

export function haptic() {
  try {
    if (typeof document === "undefined") return;
    const ua = navigator.userAgent;
    const apple = /iPhone|iPad|iPod|Macintosh/.test(ua);
    if (!apple && "vibrate" in navigator) {
      navigator.vibrate(8);
      return;
    }
    if (!label) {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.id = "lawstin-haptic";
      input.tabIndex = -1;
      label = document.createElement("label");
      label.htmlFor = input.id;
      const wrap = document.createElement("div");
      wrap.setAttribute("aria-hidden", "true");
      wrap.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
      wrap.append(input, label);
      document.body.appendChild(wrap);
    }
    label.click();
  } catch {
    /* haptics are best-effort */
  }
}
