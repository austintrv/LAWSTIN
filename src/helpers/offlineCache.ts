/**
 * Last good copy of server data on this device, so the app opens with your questions, study
 * library and to-dos when there is no connection. Queries still refetch whenever they can.
 */
const PREFIX = "lawstin-cache:";

export function readCache<T>(name: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch { return undefined; }
}

export function writeCache(name: string, data: unknown) {
  try { localStorage.setItem(PREFIX + name, JSON.stringify(data)); } catch { /* Storage full or blocked: the app still works online. */ }
}

/** Signing out removes cached data and unsent answers from this device. */
export function clearCaches() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) || k === ANSWER_QUEUE) localStorage.removeItem(k);
  } catch { /* nothing cached */ }
}

export const ANSWER_QUEUE = "lawstin-answer-queue";

/** Failed requests caused by no connection, as opposed to the server refusing them. */
export function isNetworkError(err: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(msg);
}
