import type { QuestionDTO } from "../endpoints/state_GET.schema";

export type MatchCourse = "all" | QuestionDTO["course"];
export type MatchPair = { id: string; course: QuestionDTO["course"]; topic: string; label: string; rule: string };
export type MatchRound = { pairs: MatchPair[]; labels: MatchPair[]; rules: MatchPair[] };

const MAX_LABEL = 70;
const MIN_RULE = 25;
/** The smallest board worth playing. */
export const MIN_ROUND = 3;

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Unique rule/label pairs built from the questions already in the app. */
export function matchPairs(questions: QuestionDTO[], course: MatchCourse = "all"): MatchPair[] {
  const labels = new Set<string>();
  const rules = new Set<string>();
  const out: MatchPair[] = [];
  for (const q of questions) {
    if (course !== "all" && q.course !== course) continue;
    const rule = q.rule?.trim().replace(/\s+/g, " ") ?? "";
    const label = (q.authority?.trim() || q.subtopic?.trim() || "").replace(/\s+/g, " ");
    if (!label || label.length > MAX_LABEL || rule.length < MIN_RULE) continue;
    const nl = norm(label);
    const nr = norm(rule);
    if (!nl || !nr || labels.has(nl) || rules.has(nr)) continue;
    labels.add(nl);
    rules.add(nr);
    out.push({ id: q.id, course: q.course, topic: q.topic, label, rule });
  }
  return out;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Takes up to `size` pairs in order, never two with the same label. */
function take(list: MatchPair[], size: number, chosen: MatchPair[] = []): MatchPair[] {
  const seen = new Set(chosen.map((p) => norm(p.label)));
  const out = chosen.slice();
  for (const p of list) {
    if (out.length >= size) break;
    const k = norm(p.label);
    if (seen.has(k) || out.some((o) => o.id === p.id)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/**
 * One round: `size` pairs (3 when fewer are available), from one course when it has enough so the
 * wrong answers are plausible. Null when fewer than three pairs are available.
 */
export function matchRound(pairs: MatchPair[], size = 4, random: () => number = Math.random): MatchRound | null {
  const mixed = shuffle(pairs, random);
  const want = Math.max(MIN_ROUND, size);
  const unique = take(mixed, mixed.length).length;
  const n = unique >= want ? want : Math.min(unique, want) >= MIN_ROUND ? Math.min(unique, want) : 0;
  if (!n) return null;

  // Prefer a course that can fill the round alone; the first one in shuffled order wins.
  const courses = [...new Set(mixed.map((p) => p.course))];
  const full = courses.find((c) => take(mixed.filter((p) => p.course === c), n).length >= n);
  let chosen: MatchPair[];
  if (full) chosen = take(mixed.filter((p) => p.course === full), n);
  else {
    const biggest = courses.sort((a, b) => take(mixed.filter((p) => p.course === b), n).length - take(mixed.filter((p) => p.course === a), n).length)[0];
    chosen = take(mixed, n, take(mixed.filter((p) => p.course === biggest), n));
  }
  if (chosen.length < MIN_ROUND) return null;
  return { pairs: chosen, labels: shuffle(chosen, random), rules: shuffle(chosen, random) };
}
