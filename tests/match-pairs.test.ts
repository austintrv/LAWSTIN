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
const pair = (id: string, course: MatchPair["course"]): MatchPair => ({ id, course, topic: "T", name: `Name ${id}`, cite: `Cite ${id}`, rule: `${RULE} ${id}. More.`, sentence: `${RULE} ${id}.` });
/** A repeatable random source. */
const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test("a pair is the plain name, its citation and the rule; the name comes from the subtopic first", () => {
  const out = matchPairs([q("a", "il", { subtopic: "Duty to former clients", authority: "Rule 1.9", rule: "A lawyer may not act against a former client in the same matter. Consent can cure it." })]);
  assert.deepEqual(out[0], { id: "a", course: "il", topic: "Topic", name: "Duty to former clients", cite: "Rule 1.9", rule: "A lawyer may not act against a former client in the same matter. Consent can cure it.", sentence: "A lawyer may not act against a former client in the same matter." });
});

test("a bare-citation subtopic falls back to the topic, never to the citation", () => {
  const out = matchPairs([q("a", "il", { subtopic: "Rule 1.18", authority: "Rule 1.18", topic: "Prospective clients" })]);
  assert.deepEqual(out.map((p) => [p.name, p.cite]), [["Prospective clients", "Rule 1.18"]]);
});

test("a question whose only name would be its own rule is skipped", () => {
  const out = matchPairs([
    q("a", "il", { subtopic: "Rule 1.18", topic: "Rule 3.8(d)", rule: "Disclose evidence that tends to negate guilt; then more words follow here." }),
    q("b", "il", { subtopic: null, topic: "", authority: "Rule 3.8(d)", rule: "Disclose evidence that tends to negate guilt; then more words follow here." }),
    q("c", "il"),
  ]);
  assert.deepEqual(out.map((p) => p.id), ["c"]);
});

test("pairs with duplicate rules are dropped, keeping the first; a shared name is allowed", () => {
  const out = matchPairs([
    q("a", "il", { subtopic: "Same name" }),
    q("b", "asy", { subtopic: "Other", rule: "A RULE long enough to be worth matching, number a" }),
    q("c", "pr", { subtopic: "Same name" }),
  ]);
  assert.deepEqual(out.map((p) => p.id), ["a", "c"]);
});

test("long names, short rules and missing rules are skipped", () => {
  const out = matchPairs([
    q("a", "il", { subtopic: "x".repeat(81), topic: "y".repeat(81) }),
    q("b", "il", { rule: "Too short" }),
    q("c", "il", { rule: null }),
    q("d", "il", { subtopic: "x".repeat(80) }),
  ]);
  assert.deepEqual(out.map((p) => p.id), ["d"]);
});

test("course filter keeps only that course", () => {
  const qs = [q("a", "il"), q("b", "asy"), q("c", "asy")];
  assert.deepEqual(matchPairs(qs, "asy").map((p) => p.id), ["b", "c"]);
  assert.equal(matchPairs(qs, "all").length, 3);
});

test("a round has the requested size, unique names, and shuffled columns of the same pairs", () => {
  const pairs = ["a", "b", "c", "d", "e", "f"].map((id) => pair(id, "il"));
  const r = matchRound(pairs, 4, seeded())!;
  assert.equal(r.pairs.length, 4);
  assert.equal(new Set(r.pairs.map((p) => p.name)).size, 4);
  assert.deepEqual(r.names.map((p) => p.id).sort(), r.pairs.map((p) => p.id).sort());
  assert.deepEqual(r.rules.map((p) => p.id).sort(), r.pairs.map((p) => p.id).sort());
});

test("a round falls back to three pairs and is null below three", () => {
  const some = (n: number) => Array.from({ length: n }, (_, i) => pair(String(i), "pr"));
  assert.equal(matchRound(some(3))!.pairs.length, 3);
  assert.equal(matchRound(some(2)), null);
  assert.equal(matchRound([]), null);
});

test("pairs sharing a name never share a round", () => {
  const pairs = [pair("a", "il"), { ...pair("b", "il"), name: "Name a" }, pair("c", "il"), pair("d", "il")];
  const r = matchRound(pairs, 4, seeded())!;
  assert.equal(r.pairs.length, 3);
  assert.equal(new Set(r.pairs.map((p) => p.name)).size, 3);
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
