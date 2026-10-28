import { switchToAutoMode, switchToDarkMode, switchToLightMode } from "./themeMode";

/** Per-device preferences (appearance, reading size, haptics), kept in this browser's storage. */
export type Appearance = "auto" | "light" | "dark";
export type ReadingSize = "s" | "m" | "l" | "xl";
type Prefs = { appearance: Appearance; reading: ReadingSize; haptics: boolean };

const KEY = "lawstin-prefs";
const DEFAULTS: Prefs = { appearance: "auto", reading: "m", haptics: true };
const SCALE: Record<ReadingSize, number> = { s: 0.92, m: 1, l: 1.1, xl: 1.22 };

export function readPrefs(): Prefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return DEFAULTS; }
}

export function writePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...readPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  applyPrefs(next);
  return next;
}

export function applyPrefs(p: Prefs = readPrefs()) {
  if (p.appearance === "dark") switchToDarkMode(); else if (p.appearance === "light") switchToLightMode(); else switchToAutoMode();
  document.documentElement.style.setProperty("--reading-scale", String(SCALE[p.reading] ?? 1));
}
