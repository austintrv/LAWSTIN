import type { OutputType as QuestionState } from "../endpoints/state_GET.schema";
import { dateKey } from "./dateKey";
import { reviewSchedule } from "./reviewSchedule";
import { COURSES, type CourseCode } from "./studyEngine";

export type SchoolCourse = CourseCode | "clinic" | "tutoring";
export const SCHOOL_COURSES = {
  ...COURSES,
  clinic: { name: "Civil Clinic", short: "Clinic", color: "var(--course-clinic)" },
  tutoring: { name: "Civil Procedure Tutoring", short: "Tutoring", color: "var(--course-tutoring)" },
};
export const SCHOOL_ORDER: SchoolCourse[] = ["il", "asy", "pr", "clinic", "tutoring"];
export type MaterialKind = "flashcard" | "flowchart" | "outline" | "comparison" | "drill" | "hypothetical";
export const MATERIAL_LABELS: Record<MaterialKind, string> = {
  flashcard: "Flashcards", flowchart: "Flowcharts", outline: "Rule review",
  comparison: "Comparisons", drill: "Sorting drills", hypothetical: "Hypotheticals",
};
export type SourceReference = { file_id: string; title: string; section: string; url: string };
export type FlowNode = { id: string; question: string; authority: string; branches: { label: string; next?: string; outcome?: string }[] };
export type MaterialBase = {
  id: string; course: CourseCode; kind: MaterialKind; title: string; topic: string; subtopic: string;
  class_date: string; class_day: number; batch: string; source_files: string[]; source_section: string;
  sources: SourceReference[]; authority: string;
  verified: { at: string; rounds: number; checker: string; notes: string };
};
export type Flashcard = MaterialBase & { kind: "flashcard"; front: string; back: string; reason: string };
export type Flowchart = MaterialBase & { kind: "flowchart"; start: string; nodes: FlowNode[] };
export type Outline = MaterialBase & { kind: "outline"; sections: { heading: string; text: string; authority: string }[] };
export type Comparison = MaterialBase & { kind: "comparison"; columns: string[]; rows: { label: string; cells: string[]; authority: string }[] };
export type Drill = MaterialBase & { kind: "drill"; prompt: string; categories: string[]; items: { statement: string; answer: string; why: string; authority: string }[] };
export type Hypothetical = MaterialBase & { kind: "hypothetical"; facts: string; prompt: string; answer: { issue: string; analysis: string; authority: string }[] };
export type StudyMaterial = Flashcard | Flowchart | Outline | Comparison | Drill | Hypothetical;
export type StudyRun = {
  id: string; run_date: string; created_at: string; added: number; by_course: Record<string, number>; by_kind: Record<string, number>;
  classes: string[]; weak_topics: string[]; history_available: boolean;
  check_counts: { drafted: number; passed: number; fixedThenPassed: number; dropped: number }; note: string;
};
export type MaterialLibrary = { schema_version: 1; materials: StudyMaterial[]; runs: StudyRun[] };
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const array = (v: unknown): v is unknown[] => Array.isArray(v) && v.length > 0;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const isStudyDay = (key: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(Date.parse(`${key}T12:00:00Z`)) && new Date(`${key}T12:00:00Z`).toISOString().slice(0, 10) === key;

/** Shared by the publisher and app: an unchecked item never enters a study queue. */
export function materialErrors(value: unknown, today = dateKey.today()): string[] {
  if (!obj(value)) return ["Material must be an object"];
  const m = value;
  const errors: string[] = [];
  for (const k of ["id", "title", "topic", "subtopic", "source_section", "authority", "batch"]) if (!text(m[k])) errors.push(`Missing ${k}`);
  if (!["il", "asy", "pr"].includes(String(m.course))) errors.push("Unsupported study course");
  if (!isStudyDay(String(m.class_date)) || String(m.class_date) > today) errors.push("Class date must have passed");
  if (!isStudyDay(String(m.batch)) || String(m.batch) > today) errors.push("Invalid batch date");
  if (!Number.isInteger(m.class_day) || Number(m.class_day) < 1) errors.push("Missing class day");
  if (!array(m.source_files) || !m.source_files.every(text)) errors.push("Missing source_files");
  if (!array(m.sources) || !m.sources.every(s => obj(s) && text(s.file_id) && text(s.title) && text(s.section)
    && text(s.url) && /^https:\/\/(drive|docs)\.google\.com\//.test(s.url)
    && Array.isArray(m.source_files) && m.source_files.includes(s.file_id))) errors.push("Missing source locations");
  if (Array.isArray(m.source_files) && Array.isArray(m.sources) && m.source_files.some(id => !(m.sources as unknown[]).some(s => obj(s) && s.file_id === id))) errors.push("Unmapped source file");
  if (text(m.id) && !m.id.startsWith(`${m.course}-${m.kind}-${String(m.batch).replace(/-/g, "")}-`)) errors.push("ID must match course, kind, and batch");
  const v = m.verified;
  if (!obj(v) || !text(v.at) || !Number.isFinite(Date.parse(v.at)) || Date.parse(v.at) > Date.now() + 300000
    || !text(v.checker) || !text(v.notes) || !Number.isInteger(v.rounds) || Number(v.rounds) < 1) errors.push("Independent verification required");
  switch (m.kind) {
    case "flashcard": for (const k of ["front", "back", "reason"]) if (!text(m[k])) errors.push(`Missing ${k}`); break;
    case "outline": if (!array(m.sections) || !m.sections.every(s => obj(s) && text(s.heading) && text(s.text) && text(s.authority))) errors.push("Invalid rule sections"); break;
    case "comparison":
      if (!array(m.columns) || !m.columns.every(text) || !array(m.rows) || !m.rows.every(r => obj(r) && text(r.label) && text(r.authority)
        && Array.isArray(r.cells) && r.cells.length === (m.columns as unknown[]).length && r.cells.every(text))) errors.push("Invalid comparison table"); break;
    case "drill":
      if (!text(m.prompt) || !array(m.categories) || !m.categories.every(text) || new Set(m.categories as unknown[]).size !== (m.categories as unknown[]).length || !array(m.items)
        || !m.items.every(i => obj(i) && text(i.statement) && text(i.why) && text(i.authority) && (m.categories as unknown[]).includes(i.answer))) errors.push("Invalid sorting drill"); break;
    case "hypothetical":
      if (!text(m.facts) || !text(m.prompt) || !array(m.answer) || !m.answer.every(a => obj(a) && text(a.issue) && text(a.analysis) && text(a.authority))) errors.push("Invalid hypothetical"); break;
    case "flowchart": {
      if (!text(m.start) || !array(m.nodes)) { errors.push("Missing flowchart nodes"); break; }
      const nodes = m.nodes as Record<string, unknown>[];
      if (!nodes.every(n => obj(n) && text(n.id) && text(n.question) && text(n.authority) && array(n.branches))) { errors.push("Invalid flowchart node"); break; }
      const ids = new Set(nodes.map(n => n.id));
      if (ids.size !== nodes.length || !ids.has(m.start)) errors.push("Invalid flowchart start or duplicate nodes");
      let invalidBranch = false;
      for (const n of nodes) for (const b of n.branches as unknown[]) {
        if (!obj(b) || !text(b.label) || (text(b.next) === text(b.outcome)) || (text(b.next) && !ids.has(b.next))) invalidBranch = true;
      }
      if (invalidBranch) { errors.push("Flowchart branch must lead to a node or outcome"); break; }
      const visited = new Set<unknown>(), active = new Set<unknown>();
      const visit = (id: unknown) => {
        if (active.has(id)) { errors.push("Flowchart contains a cycle"); return; }
        if (visited.has(id)) return;
        visited.add(id); active.add(id);
        const n = nodes.find(n => n.id === id);
        for (const b of (n?.branches ?? []) as Record<string, unknown>[]) if (text(b.next)) visit(b.next);
        active.delete(id);
      };
      visit(m.start);
      if (visited.size !== ids.size) errors.push("Flowchart has unreachable steps");
      break;
    }
    default: errors.push("Unsupported material kind");
  }
  return [...new Set(errors)];
}

export function libraryErrors(value: unknown, today = dateKey.today()): string[] {
  if (!obj(value) || value.schema_version !== 1 || !Array.isArray(value.materials) || !Array.isArray(value.runs)) return ["Invalid library manifest"];
  const errors: string[] = [], ids = new Set<string>();
  for (const item of value.materials) {
    errors.push(...materialErrors(item, today).map(e => `${obj(item) ? item.id : "unknown"}: ${e}`));
    if (obj(item) && text(item.id)) { if (ids.has(item.id)) errors.push(`Duplicate ID: ${item.id}`); ids.add(item.id); }
  }
  for (const run of value.runs) {
    if (!obj(run) || !text(run.id) || !dateKey.isValid(String(run.run_date)) || String(run.run_date) > today || !text(run.note)
      || !obj(run.check_counts) || !Number.isInteger(run.added) || Number(run.added) < 1) { errors.push("Invalid study run"); continue; }
    const counts = run.check_counts;
    if (!["drafted", "passed", "fixedThenPassed", "dropped"].every(k => Number.isInteger(counts[k]) && Number(counts[k]) >= 0)
      || Number(counts.drafted) !== Number(counts.passed) + Number(counts.fixedThenPassed) + Number(counts.dropped)
      || Number(run.added) !== Number(counts.passed) + Number(counts.fixedThenPassed)) errors.push(`${run.id}: Check counts do not reconcile`);
    if (!Array.isArray(run.classes) || !run.classes.length) errors.push(`${run.id}: Missing covered classes`);
  }
  const runIds = value.runs.filter(obj).map(r => r.id);
  if (new Set(runIds).size !== runIds.length) errors.push("Duplicate study run IDs");
  return errors;
}

export type CardProgress = { seen: number; correct: number; box: number; due: string; last_at: string };
export type StudyRecord = {
  cards: Record<string, CardProgress>; completed: Record<string, boolean>; confidence: Record<string, "shaky" | "learning" | "solid">;
  notes: Record<string, string>; highlights: Record<string, string[]>; starred: Record<string, boolean>;
};
export const emptyStudyRecord = (): StudyRecord => ({ cards: {}, completed: {}, confidence: {}, notes: {}, highlights: {}, starred: {} });

export function reviewCard(prev: CardProgress | undefined, correct: boolean, today = dateKey.today()): CardProgress {
  const box = reviewSchedule.nextBox(prev?.box ?? 0, prev?.seen ?? 0, correct);
  return { seen: (prev?.seen ?? 0) + 1, correct: (prev?.correct ?? 0) + Number(correct), box,
    due: dateKey.addDays(today, reviewSchedule.intervals[box]), last_at: new Date().toISOString() };
}

export function weakMaterialTopics(state?: QuestionState): Set<string> {
  const map = new Map<string, { right: number; total: number; half: number }>();
  for (const q of state?.questions ?? []) {
    const p = state?.progress.find(p => p.questionId === q.id);
    if (!p) continue;
    const key = `${q.course}|${q.topic}`;
    const prev = map.get(key) ?? { right: 0, total: 0, half: 0 };
    map.set(key, { right: prev.right + p.correct, total: prev.total + p.correct + p.wrong, half: prev.half + p.missSneaky + p.guessed });
  }
  return new Set([...map].filter(([, p]) => p.half > 0 || (p.total >= 2 && p.right / p.total < .7)).map(([key]) => key));
}

/** Reviews first; interleave courses within each priority tier without pulling future cards into due review. */
export function cardQueue(cards: Flashcard[], record: StudyRecord, state?: QuestionState, today = dateKey.today(), includeAhead = false): Flashcard[] {
  const weak = weakMaterialTopics(state);
  const priority = (c: Flashcard) => record.cards[c.id] ? record.cards[c.id].due <= today ? 0 : 2 : 1;
  const score = (c: Flashcard) => (weak.has(`${c.course}|${c.topic}`) ? 4 : 0) + (dateKey.diff(c.class_date, today) <= 7 ? 2 : 0);
  const out: Flashcard[] = [];
  for (const tier of [0, 1, ...(includeAhead ? [2] : [])]) {
    const lists = (["il", "asy", "pr"] as const).map(course => cards.filter(c => c.course === course && priority(c) === tier)
      .sort((a, b) => tier === 0 ? record.cards[a.id].due.localeCompare(record.cards[b.id].due) || score(b) - score(a) : score(b) - score(a)));
    while (lists.some(l => l.length)) for (const list of lists) if (list.length) out.push(list.shift()!);
  }
  return out;
}
