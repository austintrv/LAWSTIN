import type { QuestionDTO } from "../endpoints/state_GET.schema";
import { type CourseCode, COURSE_KEYS } from "./studyEngine";
import {
  type StudyMaterial,
  type SchoolCourse,
  type Flashcard,
  type Flowchart,
  type Outline,
  type Comparison,
  type Drill,
  type Hypothetical,
} from "./studyMaterials";
import type { Syllabus } from "./studyEngine";
import type { WrittenEntry } from "./useWritten";

export type SearchKind =
  | "Rules"
  | "Flashcards"
  | "Flowcharts"
  | "Rule reviews"
  | "Comparisons"
  | "Sorting drills"
  | "Hypotheticals"
  | "Topics"
  | "Notes"
  | "Tasks"
  | "Essays";

export const SEARCH_KINDS: readonly SearchKind[] = [
  "Rules",
  "Flashcards",
  "Flowcharts",
  "Rule reviews",
  "Comparisons",
  "Sorting drills",
  "Hypotheticals",
  "Topics",
  "Notes",
  "Tasks",
  "Essays",
] as const;

export type NoteItem = {
  id: string;
  course: SchoolCourse;
  title: string;
  body: string;
  topic?: string;
};

export type TaskItem = {
  id: string;
  course: string;
  title: string;
  notes?: string;
  due?: string | null;
};

export type SnippetToken = {
  text: string;
  match: boolean;
};

export type SearchItem = {
  id: string;
  kind: SearchKind;
  course: SchoolCourse;
  title: string;
  authority?: string;
  topic: string;
  subtopic?: string;
  body: string;
  raw: unknown;
  normAuthority: string;
  normTitle: string;
  normTopic: string;
  normBody: string;
  normAll: string;
  wordsAll: string[];
};

export type SearchResult = {
  item: SearchItem;
  score: number;
  snippet: string;
  snippetTokens: SnippetToken[];
};

export function normalizeSearch(str: string): string {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B']/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F"]/g, '"');
}

export function tokenize(str: string): string[] {
  return normalizeSearch(str)
    .split(/[^a-z0-9']+/i)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

function createSearchItem(
  id: string,
  kind: SearchKind,
  course: SchoolCourse,
  title: string,
  topic: string,
  subtopic: string | undefined,
  authority: string | undefined,
  body: string,
  raw: unknown
): SearchItem {
  const normTitle = normalizeSearch(title);
  const normTopic = normalizeSearch(topic);
  const normAuthority = normalizeSearch(authority ?? "");
  const normBody = normalizeSearch(body);
  const combined = `${normTitle} ${normTopic} ${normAuthority} ${normBody}`;
  const wordsAll = Array.from(new Set(tokenize(combined)));

  return {
    id,
    kind,
    course,
    title,
    authority: authority || undefined,
    topic,
    subtopic: subtopic || undefined,
    body,
    raw,
    normAuthority,
    normTitle,
    normTopic,
    normBody,
    normAll: combined,
    wordsAll,
  };
}

export type SearchIndexSources = {
  questions?: QuestionDTO[];
  materials?: StudyMaterial[];
  syllabus?: Syllabus;
  tasks?: TaskItem[];
  essays?: WrittenEntry[];
  notes?: NoteItem[];
};

export function buildSearchIndex(sources: SearchIndexSources): SearchItem[] {
  const items: SearchItem[] = [];

  // 1. Rules: question rules & authorities only. NEVER fact pattern (stem), choices, or answer.
  if (sources.questions) {
    const seenRules = new Set<string>();
    for (const q of sources.questions) {
      if (!q.rule) continue;
      const key = `${q.course}|${q.topic}|${q.subtopic ?? ""}|${q.rule}|${q.authority ?? ""}`;
      if (seenRules.has(key)) continue;
      seenRules.add(key);

      const title = q.subtopic?.trim() || q.topic?.trim() || "Course rule";
      items.push(
        createSearchItem(
          `rule:${q.id}`,
          "Rules",
          q.course as SchoolCourse,
          title,
          q.topic ?? "",
          q.subtopic ?? undefined,
          q.authority ?? undefined,
          q.rule,
          q
        )
      );
    }
  }

  // 2. Study materials by kind
  if (sources.materials) {
    for (const m of sources.materials) {
      switch (m.kind) {
        case "flashcard": {
          const fc = m as Flashcard;
          const body = `${fc.front} ${fc.back} ${fc.reason ?? ""}`.trim();
          items.push(
            createSearchItem(
              `mat:${fc.id}`,
              "Flashcards",
              fc.course,
              fc.title,
              fc.topic,
              fc.subtopic,
              fc.authority,
              body,
              fc
            )
          );
          break;
        }
        case "flowchart": {
          const flow = m as Flowchart;
          const nodeTexts = (flow.nodes ?? []).map(
            (n) =>
              `${n.question} ${(n.branches ?? [])
                .map((b) => `${b.label ?? ""} ${b.outcome ?? ""}`)
                .join(" ")}`
          );
          const body = nodeTexts.join(" ").trim();
          items.push(
            createSearchItem(
              `mat:${flow.id}`,
              "Flowcharts",
              flow.course,
              flow.title,
              flow.topic,
              flow.subtopic,
              flow.authority,
              body,
              flow
            )
          );
          break;
        }
        case "outline": {
          const out = m as Outline;
          const secTexts = (out.sections ?? []).map((s) => `${s.heading} ${s.text}`);
          const body = secTexts.join(" ").trim();
          items.push(
            createSearchItem(
              `mat:${out.id}`,
              "Rule reviews",
              out.course,
              out.title,
              out.topic,
              out.subtopic,
              out.authority,
              body,
              out
            )
          );
          break;
        }
        case "comparison": {
          const comp = m as Comparison;
          const cols = (comp.columns ?? []).join(" ");
          const rowTexts = (comp.rows ?? []).map(
            (r) => `${r.label} ${(r.cells ?? []).join(" ")}`
          );
          const body = `${cols} ${rowTexts.join(" ")}`.trim();
          items.push(
            createSearchItem(
              `mat:${comp.id}`,
              "Comparisons",
              comp.course,
              comp.title,
              comp.topic,
              comp.subtopic,
              comp.authority,
              body,
              comp
            )
          );
          break;
        }
        case "drill": {
          const drill = m as Drill;
          const itemTexts = (drill.items ?? []).map((it) => it.statement);
          const body = `${drill.prompt ?? ""} ${itemTexts.join(" ")}`.trim();
          items.push(
            createSearchItem(
              `mat:${drill.id}`,
              "Sorting drills",
              drill.course,
              drill.title,
              drill.topic,
              drill.subtopic,
              drill.authority,
              body,
              drill
            )
          );
          break;
        }
        case "hypothetical": {
          const hypo = m as Hypothetical;
          // Hypothetical titles and questions only. Never facts or sample answer analysis.
          const body = (hypo.prompt ?? "").trim();
          items.push(
            createSearchItem(
              `mat:${hypo.id}`,
              "Hypotheticals",
              hypo.course,
              hypo.title,
              hypo.topic,
              hypo.subtopic,
              hypo.authority,
              body,
              hypo
            )
          );
          break;
        }
      }
    }
  }

  // 3. Syllabus units
  if (sources.syllabus) {
    for (const c of COURSE_KEYS) {
      const units = sources.syllabus[c] ?? [];
      for (const u of units) {
        if (!u.topic) continue;
        const datesStr = Array.isArray(u.dates) ? u.dates.join(", ") : String(u.dates ?? "");
        const alsoStr = Array.isArray(u.also) ? u.also.join(", ") : String(u.also ?? "");
        const body = `${datesStr} ${alsoStr}`.trim();
        items.push(
          createSearchItem(
            `topic:${c}:${u.topic}`,
            "Topics",
            c,
            u.topic,
            u.topic,
            undefined,
            undefined,
            body,
            { course: c, unit: u.topic }
          )
        );
      }
    }
  }

  // 4. Tasks (Clinic and Tutoring)
  if (sources.tasks) {
    for (const t of sources.tasks) {
      items.push(
        createSearchItem(
          `task:${t.id}`,
          "Tasks",
          (t.course || "clinic") as SchoolCourse,
          t.title,
          t.title,
          undefined,
          undefined,
          t.notes ?? "",
          t
        )
      );
    }
  }

  // 5. Graded essay prompts
  if (sources.essays) {
    for (const e of sources.essays) {
      const call = e.call ?? "";
      const topic = e.topic ?? "Essay";
      items.push(
        createSearchItem(
          `essay:${e.id}`,
          "Essays",
          e.course,
          `${topic} · ${e.grade.score}/10`,
          topic,
          undefined,
          undefined,
          call,
          e
        )
      );
    }
  }

  // 6. Notes (defensive package 3B integration)
  if (sources.notes) {
    for (const n of sources.notes) {
      items.push(
        createSearchItem(
          `note:${n.id}`,
          "Notes",
          n.course,
          n.title,
          n.topic ?? n.title,
          undefined,
          undefined,
          n.body,
          n
        )
      );
    }
  }

  return items;
}

export function buildSnippet(
  text: string,
  tokens: string[],
  maxLength = 130
): { snippet: string; tokens: SnippetToken[] } {
  if (!text) return { snippet: "", tokens: [] };

  const norm = normalizeSearch(text);
  let bestIdx = -1;

  for (const t of tokens) {
    const idx = norm.indexOf(t);
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
      bestIdx = idx;
    }
  }

  let start = 0;
  let end = text.length;

  if (bestIdx !== -1 && text.length > maxLength) {
    start = Math.max(0, bestIdx - 35);
    // Align to word boundary
    if (start > 0) {
      const space = text.indexOf(" ", start);
      if (space !== -1 && space < bestIdx) {
        start = space + 1;
      }
    }
    end = Math.min(text.length, start + maxLength);
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > bestIdx) {
        end = lastSpace;
      }
    }
  } else if (text.length > maxLength) {
    end = maxLength;
    const lastSpace = text.lastIndexOf(" ", end);
    if (lastSpace > 40) end = lastSpace;
  }

  let slice = text.slice(start, end).trim();
  if (start > 0) slice = `…${slice}`;
  if (end < text.length) slice = `${slice}…`;

  // Build snippet tokens with matched regions
  const sliceNorm = normalizeSearch(slice);
  const matchedRanges: [number, number][] = [];

  for (const t of tokens) {
    let pos = 0;
    while (pos < sliceNorm.length) {
      const found = sliceNorm.indexOf(t, pos);
      if (found === -1) break;
      matchedRanges.push([found, found + t.length]);
      pos = found + Math.max(1, t.length);
    }
  }

  // Merge overlapping ranges
  matchedRanges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of matchedRanges) {
    if (!merged.length) {
      merged.push(r);
    } else {
      const last = merged[merged.length - 1];
      if (r[0] <= last[1]) {
        last[1] = Math.max(last[1], r[1]);
      } else {
        merged.push(r);
      }
    }
  }

  const snippetTokens: SnippetToken[] = [];
  let cur = 0;
  for (const [s, e] of merged) {
    if (s > cur) {
      snippetTokens.push({ text: slice.slice(cur, s), match: false });
    }
    snippetTokens.push({ text: slice.slice(s, e), match: true });
    cur = e;
  }
  if (cur < slice.length) {
    snippetTokens.push({ text: slice.slice(cur), match: false });
  }

  return { snippet: slice, tokens: snippetTokens };
}

export function searchIndex(
  index: SearchItem[],
  query: string,
  courseFilter: "all" | SchoolCourse = "all"
): SearchResult[] {
  const normQuery = normalizeSearch(query.trim());
  if (!normQuery) return [];

  const queryTokens = tokenize(normQuery);
  if (!queryTokens.length) return [];

  const results: SearchResult[] = [];

  for (const item of index) {
    if (courseFilter !== "all" && item.course !== courseFilter) continue;

    // Every token must match as a word prefix or exact match in the item
    let allTokensMatch = true;
    for (const qt of queryTokens) {
      const matched = item.wordsAll.some((w) => w.startsWith(qt));
      if (!matched) {
        allTokensMatch = false;
        break;
      }
    }
    if (!allTokensMatch) continue;

    // Scoring: exact phrase and authority matches rank first, then title, then body
    let score = 0;

    const authExact = item.normAuthority.includes(normQuery);
    const titleExact = item.normTitle.includes(normQuery);
    const bodyExact = item.normBody.includes(normQuery);
    const topicExact = item.normTopic.includes(normQuery);

    if (authExact) score += 100000;
    if (titleExact) score += 80000;
    if (topicExact) score += 60000;
    if (bodyExact) score += 20000;

    // Token-level scoring
    for (const qt of queryTokens) {
      if (item.normAuthority.includes(qt)) score += 3000;
      if (item.normTitle.includes(qt)) score += 2000;
      if (item.normTopic.includes(qt)) score += 1500;
      if (item.normBody.includes(qt)) score += 500;

      // Exact word match bonus (vs prefix only)
      if (item.wordsAll.includes(qt)) score += 300;
    }

    // Determine the best source text for the snippet
    let snippetSource = item.body;
    if (bodyExact || queryTokens.some((t) => item.normBody.includes(t))) {
      snippetSource = item.body;
    } else if (item.authority && (authExact || queryTokens.some((t) => item.normAuthority.includes(t)))) {
      snippetSource = item.authority;
    } else if (item.topic && (topicExact || queryTokens.some((t) => item.normTopic.includes(t)))) {
      snippetSource = item.body || item.topic;
    } else {
      snippetSource = item.body || item.title;
    }

    const { snippet, tokens: snippetTokens } = buildSnippet(snippetSource, queryTokens);

    results.push({
      item,
      score,
      snippet,
      snippetTokens,
    });
  }

  // Sort descending by score, tiebreak by title
  results.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
  return results;
}

export function searchSuggestions(index: SearchItem[], query: string, limit = 5): string[] {
  const normQuery = normalizeSearch(query.trim());
  if (!normQuery) return [];

  const candidates = new Set<string>();
  for (const item of index) {
    if (item.topic) candidates.add(item.topic);
    if (item.authority) candidates.add(item.authority);
  }

  const queryTokens = tokenize(normQuery);

  const scored: { name: string; score: number }[] = [];
  for (const name of candidates) {
    const norm = normalizeSearch(name);
    if (norm === normQuery) continue; // skip exact duplicate

    let score = 0;
    if (norm.startsWith(normQuery)) score += 50;
    else if (norm.includes(normQuery)) score += 30;

    for (const qt of queryTokens) {
      if (norm.includes(qt)) score += 10;
    }

    // Simple prefix overlap
    const nameTokens = tokenize(norm);
    for (const nt of nameTokens) {
      for (const qt of queryTokens) {
        if (nt.startsWith(qt)) score += 5;
      }
    }

    if (score > 0) {
      scored.push({ name, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.slice(0, limit).map((s) => s.name);
}
