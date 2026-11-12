import type { QuestionDTO } from "../endpoints/state_GET.schema";
import { firstClause, firstSentence, plainName } from "./plainName";

export type MatchCourse = "all" | QuestionDTO["course"];
export type MatchPair = { id: string; course: QuestionDTO["course"]; topic: string; name: string; cite: string; rule: string; sentence: string };
export type MatchRound = { pairs: MatchPair[]; names: MatchPair[]; rules: MatchPair[] };

const MAX_NAME = 80;
const MIN_RULE = 25;
/** The smallest board worth playing. */
export const MIN_ROUND = 3;

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Rule/name pairs built from the questions already in the app; a question whose only name is its own rule is skipped. */
export function matchPairs(questions: QuestionDTO[], course: MatchCourse = "all"): MatchPair[] {
  const rules = new Set<string>();
  const out: MatchPair[] = [];
  for (const q of questions) {
    if (course !== "all" && q.course !== course) continue;
    const rule = q.rule?.trim().replace(/\s+/g, " ") ?? "";
    if (rule.length < MIN_RULE) continue;
    const { name, cite } = plainName(q);
    const nr = norm(rule);
    if (!name || name.length > MAX_NAME || norm(name) === norm(firstClause(rule)) || rules.has(nr)) continue;
    rules.add(nr);
    out.push({ id: q.id, course: q.course, topic: q.topic, name, cite, rule, sentence: firstSentence(rule) });
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

/** Takes up to `size` pairs in order, never two with the same name. */
function take(list: MatchPair[], size: number, chosen: MatchPair[] = []): MatchPair[] {
  const seen = new Set(chosen.map((p) => norm(p.name)));
  const sentences = new Set(chosen.map((p) => norm(firstSentence(p.rule))));
  const out = chosen.slice();
  for (const p of list) {
    if (out.length >= size) break;
    const k = norm(p.name);
    const sentence = norm(firstSentence(p.rule));
    if (seen.has(k) || sentences.has(sentence) || out.some((o) => o.id === p.id)) continue;
    seen.add(k); sentences.add(sentence);
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
  return { pairs: chosen, names: shuffle(chosen, random), rules: shuffle(chosen, random) };
}
