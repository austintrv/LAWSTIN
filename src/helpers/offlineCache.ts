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
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) || k === ANSWER_QUEUE || k === STUDY_QUEUE || k === "lawstin-written-pending" || k === "lawstin-written") localStorage.removeItem(k);
  } catch { /* nothing cached */ }
}

export const ANSWER_QUEUE = "lawstin-answer-queue";

/** Failed requests caused by no connection, as opposed to the server refusing them. */
export function isNetworkError(err: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(msg);
}

export type SettingWrite = { key: string; value: string; updated_at: string };
export const settingQueue = () => readCache<Record<string, SettingWrite>>("settings-pending") ?? {};
export function queueSetting(key: string, value: string) {
  const row = { key, value, updated_at: new Date().toISOString() };
  localStorage.setItem(PREFIX + "settings-pending", JSON.stringify({ ...settingQueue(), [key]: row }));
  writeCache(key, value);
  return row;
}
export function acknowledgeSetting(row: SettingWrite) {
  const pending = settingQueue();
  if (pending[row.key]?.updated_at === row.updated_at && pending[row.key]?.value === row.value) {
    delete pending[row.key]; writeCache("settings-pending", pending);
  }
}

export const STUDY_QUEUE = "lawstin-study-queue";
export type StudyEvent = { id: number; kind: "card" | "drill" | "written"; item_id: string; correct: boolean; local_date: string };
export const readStudyQueue = (): StudyEvent[] => {
  try { return JSON.parse(localStorage.getItem(STUDY_QUEUE) ?? "[]"); } catch { return []; }
};
export function writeStudyQueue(rows: StudyEvent[]) {
  if (rows.length) localStorage.setItem(STUDY_QUEUE, JSON.stringify(rows)); else localStorage.removeItem(STUDY_QUEUE);
}
export const studyEventKey = (e: Pick<StudyEvent, "kind" | "item_id" | "local_date">) => `${e.local_date}|${e.kind}|${e.item_id}`;
export function enqueueStudy(kind: StudyEvent["kind"], itemId: string, correct: boolean, day: string, count = 1, right = correct ? count : 0) {
  const seen = readCache<Record<string, boolean>>("study-counted") ?? {};
  const queued = readStudyQueue();
  queued.forEach(e => { seen[studyEventKey(e)] = true; });
  const rows: StudyEvent[] = [];
  for (let i = 0; i < count; i++) {
    const item_id = count > 1 ? `${itemId}:${i}` : itemId;
    const key = studyEventKey({ kind, item_id, local_date: day });
    if (seen[key]) continue;
    const bits = crypto.getRandomValues(new Uint32Array(2));
    const id = -(1 + (bits[0] & 0xfffff) * 0x100000000 + bits[1]);
    rows.push({ id, kind, item_id, correct: i < right, local_date: day }); seen[key] = true;
  }
  writeStudyQueue([...queued, ...rows]);
  writeCache("study-counted", seen);
  return rows;
}
export function applyStudyEvents<T extends { days: { date: string; answered: number; correct: number }[] }>(state: T, rows = readStudyQueue()): T {
  const days = state.days.map(d => ({ ...d }));
  for (const row of rows) {
    let day = days.find(d => d.date === row.local_date);
    if (!day) { day = { date: row.local_date, answered: 0, correct: 0 }; days.push(day); }
    day.answered++; day.correct += Number(row.correct);
  }
  return { ...state, days };
}
