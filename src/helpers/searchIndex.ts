import type { QuestionDTO } from "../endpoints/state_GET.schema";
import type { CourseTask } from "./useCourseTasks";
import { MATERIAL_LABELS, type StudyMaterial } from "./studyMaterials";
import type { Syllabus } from "./studyEngine";

export type SearchCourse = "il" | "asy" | "pr" | "clinic" | "tutoring";
export type SearchKind = "rule" | "flashcard" | "flowchart" | "outline" | "comparison" | "drill" | "hypothetical" | "topic" | "note" | "task" | "essay";
export const KIND_ORDER: SearchKind[] = ["rule", "flashcard", "flowchart", "outline", "comparison", "drill", "hypothetical", "topic", "note", "task", "essay"];
export const KIND_LABEL: Record<SearchKind, string> = { rule: "Rules", ...MATERIAL_LABELS, topic: "Topics", note: "Notes", task: "Tasks", essay: "Essays" };

/** One searchable thing. `title` and `phrase` rank above `body`. Question stems, choices and answers never enter the index. */
export type SearchItem = { id: string; kind: SearchKind; course: SearchCourse; title: string; body: string; authority?: string; topic?: string; ref: string };
export type SearchHit = SearchItem & { score: number; snippet: { text: string; marks: [number, number][] } };

/** Case, accent and quote folding; straight and curly quotes compare equal. */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').toLocaleLowerCase();
export const words = (s: string) => fold(s).match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) ?? [];

type Prepared = { item: SearchItem; title: string; body: string; authority: string; tokens: string[] };
export type SearchIndex = { items: Prepared[]; size: number };

export function buildIndex(items: SearchItem[]): SearchIndex {
  const seen = new Set<string>();
  const out: Prepared[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const title = fold(item.title), body = fold(item.body), authority = fold(item.authority ?? "");
    out.push({ item, title, body, authority, tokens: [...new Set(words(`${item.title} ${item.authority ?? ""} ${item.body}`))] });
  }
  return { items: out, size: out.length };
}

/** Every word must match a word's start in the item; the query as a whole phrase, then title, then authority, rank first. */
export function search(index: SearchIndex, query: string, opts: { course?: SearchCourse | null; kinds?: SearchKind[]; limit?: number } = {}): SearchHit[] {
  const terms = words(query);
  if (!terms.length) return [];
  const phrase = terms.join(" ");
  const hits: SearchHit[] = [];
  for (const p of index.items) {
    if (opts.course && p.item.course !== opts.course) continue;
    if (opts.kinds && !opts.kinds.includes(p.item.kind)) continue;
    if (!terms.every((t) => p.tokens.some((w) => w.startsWith(t)))) continue;
    let score = 0;
    const flat = (s: string) => words(s).join(" ");
    if (terms.length > 1 || (terms[0]?.length ?? 0) > 2) {
      if (p.authority && flat(p.authority).includes(phrase)) score += 60;
      if (flat(p.title).includes(phrase)) score += 50;
      else if (flat(p.body).includes(phrase)) score += 30;
    }
    for (const t of terms) {
      if (p.title.includes(t)) score += 10;
      if (p.authority.includes(t)) score += 6;
      if (p.body.includes(t)) score += 2;
    }
    if (p.title === phrase) score += 40;
    hits.push({ ...p.item, score, snippet: snippetFor(p.item, terms) });
  }
  hits.sort((a, b) => b.score - a.score || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title));
  return opts.limit ? hits.slice(0, opts.limit) : hits;
}

/** A window of the body (or the authority or title) around the first match, with the matched words marked. */
export function snippetFor(item: SearchItem, terms: string[]): SearchHit["snippet"] {
  const source = [item.body, item.authority ?? "", item.title].find((s) => s && terms.some((t) => words(s).some((w) => w.startsWith(t)))) ?? item.body ?? item.title;
  const text = source.replace(/\s+/g, " ").trim();
  const lower = fold(text);
  // Folding can change length (accents decompose then strip), so match against folded characters one to one.
  const same = lower.length === text.length;
  const find = same ? lower : text.toLocaleLowerCase();
  const re = /[\p{L}\p{N}]+/gu;
  const spans: [number, number][] = [];
  for (let m = re.exec(find); m; m = re.exec(find)) if (terms.some((t) => fold(m![0]).startsWith(t))) spans.push([m.index, m.index + m[0].length]);
  if (!spans.length) return { text: text.slice(0, 140), marks: [] };
  const first = spans[0][0];
  const start = Math.max(0, first - 50);
  const from = start > 0 ? text.indexOf(" ", start) + 1 || start : 0;
  const end = Math.min(text.length, from + 150);
  const slice = (from > 0 ? "…" : "") + text.slice(from, end) + (end < text.length ? "…" : "");
  const shift = from > 0 ? 1 - from : -from;
  return { text: slice, marks: spans.filter(([a, b]) => a >= from && b <= end).map(([a, b]) => [a + shift, b + shift] as [number, number]) };
}

/** Closest topic and authority names for a query that found nothing. */
export function suggestions(index: SearchIndex, query: string, limit = 5): string[] {
  const q = words(query).join(" ");
  if (!q) return [];
  const names = new Map<string, number>();
  for (const p of index.items) {
    for (const name of [p.item.kind === "topic" ? p.item.title : "", p.item.authority ?? ""]) {
      if (!name || names.has(name)) continue;
      const nameWords = words(name);
      const score = Math.max(...words(query).map((t) => Math.max(0, ...nameWords.map((w) => closeness(t, w)))));
      if (score >= 0.5) names.set(name, score);
    }
  }
  return [...names].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([n]) => n);
}
function closeness(a: string, b: string): number {
  if (!a || !b) return 0;
  if (b.startsWith(a) || a.startsWith(b)) return 1;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const prefix = i / Math.max(a.length, b.length);
  const d = distance(a, b);
  return Math.max(prefix, 1 - d / Math.max(a.length, b.length));
}
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

export type IndexSources = {
  questions: QuestionDTO[];
  materials: StudyMaterial[];
  syllabus: Syllabus;
  tasks: CourseTask[];
  essays: { id: string; course: "il" | "asy" | "pr"; topic: string; facts: string; call: string; day: string }[];
  notes?: { course: "il" | "asy" | "pr"; unit: string; text: string }[];
};

const clip = (s: string, n = 400) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Everything searchable the app already loads. Nothing here reads a question's fact pattern, choices or answer. */
export function indexItems(src: IndexSources): SearchItem[] {
  const out: SearchItem[] = [];
  const seenRule = new Set<string>();
  for (const q of src.questions) {
    if (!q.rule) continue;
    const key = `${q.course}|${q.topic}|${q.subtopic ?? q.rule}`;
    if (seenRule.has(key)) continue;
    seenRule.add(key);
    out.push({ id: `rule:${key}`, kind: "rule", course: q.course, title: q.subtopic ?? q.topic, body: `${q.topic}. ${q.rule}`, authority: q.authority ?? undefined, topic: q.topic, ref: q.topic });
  }
  for (const m of src.materials) {
    const base = { id: `${m.kind}:${m.id}`, kind: m.kind, course: m.course, title: m.title, topic: m.topic, authority: m.authority, ref: m.id } as const;
    switch (m.kind) {
      case "flashcard": out.push({ ...base, body: `${m.front} ${m.back} ${m.topic}` }); break;
      case "outline": out.push({ ...base, body: `${m.topic} ${m.sections.map((s) => `${s.heading}. ${s.text}`).join(" ")}` }); break;
      case "comparison": out.push({ ...base, body: `${m.topic} ${m.columns.join(" ")} ${m.rows.map((r) => `${r.label} ${r.cells.join(" ")}`).join(" ")}` }); break;
      case "flowchart": out.push({ ...base, body: `${m.topic} ${m.nodes.map((n) => `${n.question} ${n.branches.map((b) => b.outcome ?? "").join(" ")}`).join(" ")}` }); break;
      case "drill": out.push({ ...base, body: `${m.topic} ${m.prompt} ${m.items.map((i) => i.statement).join(" ")}` }); break;
      case "hypothetical": out.push({ ...base, body: `${m.topic} ${m.prompt}` }); break;
    }
  }
  for (const course of ["il", "asy", "pr"] as const) for (const u of src.syllabus[course] ?? []) {
    out.push({ id: `topic:${course}:${u.topic}`, kind: "topic", course, title: u.topic, body: (u.also ?? []).join(" "), topic: u.topic, ref: u.topic });
  }
  for (const t of src.tasks) out.push({ id: `task:${t.id}`, kind: "task", course: t.course, title: t.title, body: clip(t.notes ?? ""), ref: t.id });
  for (const e of src.essays) out.push({ id: `essay:${e.id}`, kind: "essay", course: e.course, title: e.topic, body: clip(e.call, 300), ref: e.id });
  for (const n of src.notes ?? []) if (n.text.trim()) out.push({ id: `note:${n.course}:${n.unit}`, kind: "note", course: n.course, title: n.unit, body: clip(n.text, 2000), topic: n.unit, ref: n.unit });
  return out;
}
