import { emptyStudyRecord, type StudyRecord } from "./studyMaterials";

export const PROGRESS_PREFIX = "study:v1:";
export type ProgressRow = { key: string; value: string; updated_at: string };
export type StudyCache = { record: StudyRecord; clocks: Record<string, string>; pending: Record<string, ProgressRow> };
export const emptyStudyCache = (): StudyCache => ({ record: emptyStudyRecord(), clocks: {}, pending: {} });
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const fields = Object.keys(emptyStudyRecord()) as (keyof StudyRecord)[];
function validValue(field: keyof StudyRecord, value: unknown): boolean {
  if (field === "completed" || field === "starred") return typeof value === "boolean";
  if (field === "notes") return typeof value === "string";
  if (field === "highlights") return Array.isArray(value) && value.every(v => typeof v === "string");
  if (field === "confidence") return ["shaky", "learning", "solid"].includes(String(value));
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return ["seen", "correct", "box"].every(k => Number.isInteger(p[k]) && Number(p[k]) >= 0)
    && Number(p.box) <= 5 && Number(p.correct) <= Number(p.seen) && /^\d{4}-\d{2}-\d{2}$/.test(String(p.due)) && typeof p.last_at === "string";
}
export function mergeStudyRows(cache: StudyCache, rows: ProgressRow[]): StudyCache {
  const next = { record: structuredClone(cache.record), clocks: { ...cache.clocks }, pending: { ...cache.pending } };
  for (const row of rows) {
    if (!row.key.startsWith(PROGRESS_PREFIX) || !Number.isFinite(Date.parse(row.updated_at))) continue;
    const [field, ...rest] = row.key.slice(PROGRESS_PREFIX.length).split(":");
    const id = rest.join(":");
    if (!fields.includes(field as keyof StudyRecord) || !id || ["__proto__", "constructor", "prototype"].includes(id)) continue;
    if (next.pending[row.key] || Date.parse(next.clocks[row.key] ?? "1970-01-01") >= Date.parse(row.updated_at)) continue;
    try {
      const value = JSON.parse(row.value);
      if (!validValue(field as keyof StudyRecord, value)) continue;
      (next.record[field as keyof StudyRecord] as Record<string, unknown>)[id] = value;
      next.clocks[row.key] = row.updated_at;
    } catch { /* A malformed entry must not discard other progress. */ }
  }
  return next;
}
export function changeStudyRecord(cache: StudyCache, record: StudyRecord, at = new Date().toISOString()): StudyCache {
  const next = { record, clocks: { ...cache.clocks }, pending: { ...cache.pending } };
  for (const field of fields) for (const [id, value] of Object.entries(record[field])) {
    if (JSON.stringify(cache.record[field][id]) === JSON.stringify(value)) continue;
    if (!validValue(field, value)) continue;
    const key = `${PROGRESS_PREFIX}${field}:${id}`;
    next.clocks[key] = at;
    next.pending[key] = { key, value: JSON.stringify(value), updated_at: at };
  }
  return next;
}
export function acknowledgeStudyRows(cache: StudyCache, sent: ProgressRow[]): StudyCache {
  const pending = { ...cache.pending };
  for (const row of sent) if (pending[row.key]?.updated_at === row.updated_at && pending[row.key]?.value === row.value) delete pending[row.key];
  return { ...cache, pending };
}

export function restoreStudyCache(raw: unknown): StudyCache {
  if (!object(raw) || !object(raw.record)) return emptyStudyCache();
  const rows: ProgressRow[] = [];
  for (const field of fields) {
    const entries = raw.record[field];
    if (!object(entries)) continue;
    for (const [id, value] of Object.entries(entries)) {
      const key = `${PROGRESS_PREFIX}${field}:${id}`;
      const stamp = object(raw.clocks) ? raw.clocks[key] : undefined;
      rows.push({ key, value: JSON.stringify(value), updated_at: typeof stamp === "string" ? stamp : "2000-01-01T00:00:00Z" });
    }
  }
  const result = mergeStudyRows(emptyStudyCache(), rows);
  if (object(raw.pending)) for (const [key, row] of Object.entries(raw.pending)) {
    if (!object(row) || row.key !== key || typeof row.value !== "string" || row.updated_at !== result.clocks[key]) continue;
    const accepted = rows.find(r => r.key === key && r.value === row.value);
    if (accepted) result.pending[key] = accepted;
  }
  return result;
}
