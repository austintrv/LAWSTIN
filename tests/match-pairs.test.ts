import test from "node:test";
import assert from "node:assert/strict";
import { matchPairs, matchRound, type MatchPair } from "../src/helpers/matchPairs";
import type { QuestionDTO } from "../src/endpoints/state_GET.schema";

const RULE = "A rule long enough to be worth matching, number";
const q = (id: string, course: QuestionDTO["course"], patch: Partial<QuestionDTO> = {}): QuestionDTO => ({
  id, course, topic: "Topic", subtopic: `Subtopic ${id}`, classDay: 1, classDate: "2026-10-01", source: null, batch: null, stem: "Facts.", prompt: "Result?",
  choices: (["A", "B", "C", "D"] as const).map((c, i) => ({ id: c, role: (["correct", "sneaky", "average", "bad"] as const)[i], text: c, why: c })),
  answer: "A", rule: `${RULE} ${id}`, authority: `Authority ${id}`, ...patch,
});
const pair = (id: string, course: MatchPair["course"]): MatchPair => ({ id, course, topic: "T", label: `Label ${id}`, rule: `${RULE} ${id}` });
/** A repeatable random source. */
const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test("authority is preferred, subtopic is the fallback, and questions with neither are skipped", () => {
  const out = matchPairs([
    q("a", "il"),
    q("b", "il", { authority: null }),
    q("c", "il", { authority: "  ", subtopic: null }),
    q("d", "il", { authority: null, subtopic: null }),
  ]);
  assert.deepEqual(out.map((p) => [p.id, p.label]), [["a", "Authority a"], ["b", "Subtopic b"]]);
});

test("pairs with duplicate labels or rules are dropped, keeping the first", () => {
  const out = matchPairs([
    q("a", "il", { authority: "Kiobel v. Royal Dutch" }),
    q("b", "il", { authority: "  KIOBEL v. Royal Dutch! " }),
    q("c", "asy", { authority: "Other", rule: "A RULE long enough to be worth matching, number a" }),
    q("d", "pr", { authority: "Fourth" }),
  ]);
  assert.deepEqual(out.map((p) => p.id), ["a", "d"]);
});

test("long labels, short rules and missing rules are skipped", () => {
  const out = matchPairs([
    q("a", "il", { authority: "x".repeat(71) }),
    q("b", "il", { rule: "Too short" }),
    q("c", "il", { rule: null }),
    q("d", "il", { authority: "x".repeat(70) }),
  ]);
  assert.deepEqual(out.map((p) => p.id), ["d"]);
});

test("course filter keeps only that course", () => {
  const qs = [q("a", "il"), q("b", "asy"), q("c", "asy")];
  assert.deepEqual(matchPairs(qs, "asy").map((p) => p.id), ["b", "c"]);
  assert.equal(matchPairs(qs, "all").length, 3);
});

test("a round has the requested size, unique labels, and shuffled columns of the same pairs", () => {
  const pairs = ["a", "b", "c", "d", "e", "f"].map((id) => pair(id, "il"));
  const r = matchRound(pairs, 4, seeded())!;
  assert.equal(r.pairs.length, 4);
  assert.equal(new Set(r.pairs.map((p) => p.label)).size, 4);
  assert.deepEqual(r.labels.map((p) => p.id).sort(), r.pairs.map((p) => p.id).sort());
  assert.deepEqual(r.rules.map((p) => p.id).sort(), r.pairs.map((p) => p.id).sort());
});

test("a round falls back to three pairs and is null below three", () => {
  const some = (n: number) => Array.from({ length: n }, (_, i) => pair(String(i), "pr"));
  assert.equal(matchRound(some(3))!.pairs.length, 3);
  assert.equal(matchRound(some(2)), null);
  assert.equal(matchRound([]), null);
});

test("pairs sharing a label never share a round", () => {
  const pairs = [pair("a", "il"), { ...pair("b", "il"), label: "Label a" }, pair("c", "il"), pair("d", "il")];
  const r = matchRound(pairs, 4, seeded())!;
  assert.equal(r.pairs.length, 3);
  assert.equal(new Set(r.pairs.map((p) => p.label)).size, 3);
});

test("a round stays in one course when that course can fill it", () => {
  const pairs = [...["a", "b", "c", "d"].map((id) => pair(id, "il")), ...["e", "f", "g", "h"].map((id) => pair(id, "pr")), pair("i", "asy")];
  for (let s = 1; s <= 20; s++) {
    const r = matchRound(pairs, 4, seeded(s))!;
    assert.equal(new Set(r.pairs.map((p) => p.course)).size, 1);
  }
});

test("a round tops up from other courses when no course can fill it", () => {
  const pairs = [pair("a", "il"), pair("b", "il"), pair("c", "pr"), pair("d", "asy")];
  const r = matchRound(pairs, 4, seeded())!;
  assert.equal(r.pairs.length, 4);
});

test("the same random source gives the same round", () => {
  const pairs = Array.from({ length: 12 }, (_, i) => pair(String(i), i % 2 ? "il" : "pr"));
  const a = matchRound(pairs, 4, seeded(42))!;
  const b = matchRound(pairs, 4, seeded(42))!;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.pairs, matchRound(pairs, 4, seeded(43))!.pairs);
});
