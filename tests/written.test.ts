import test from "node:test";
import assert from "node:assert/strict";
import { defaultEssayLength, essayGroups, essayTrend, scoreSpot, spotCredit, nextSpotHypo, weakWrittenTopics, type WrittenEntry } from "../src/helpers/useWritten";
import type { Hypothetical } from "../src/helpers/studyMaterials";
const h = { id: "hypo", course: "il", topic: "Treaties", answer: ["One", "Two", "Three", "Four"].map(issue => ({ issue, analysis: "Checked analysis", authority: "Checked authority" })) } as Hypothetical;
const essay = (id: string, day: string, score: number, extra: Partial<WrittenEntry> = {}): WrittenEntry => ({
  id, day, at: `${day}T18:00:00Z`, course: "il", topic: "Treaties", facts: "Facts", call: "Question", answer: "Answer", words: 1, seconds: 10,
  grade: { score, summary: "", spotted: [], missed: [], errors: [], modelAnswer: "", rubric: { issues: score + 1, rules: score, application: score - 1 } }, ...extra,
});
test("spot results preserve lines and missed issues, with proportional two-answer credit", () => {
  for (const [marks, caught, credit] of [[{}, 0, 0], [{ 0: true }, 1, 1], [{ 0: true, 1: true }, 2, 1], [{ 0: true, 1: true, 2: true, 3: true }, 4, 2]] as const) {
    const e = scoreSpot(h, marks, "My issues\nSecond line", "2026-11-11T18:00:00Z");
    assert.equal(e.caught, caught); assert.equal(e.total, 4); assert.equal(spotCredit(e), credit);
    assert.equal(e.lines, "My issues\nSecond line"); assert.equal(e.missed.length, 4 - caught);
  }
});
test("spots below half weaken the topic for fourteen days, later strong work clears it", () => {
  const low = scoreSpot(h, { 0: true }, "", "2026-11-01T18:00:00Z");
  assert.deepEqual(weakWrittenTopics([], [low], "2026-11-15"), ["il|Treaties"]);
  assert.deepEqual(weakWrittenTopics([], [low], "2026-11-16"), []);
  assert.deepEqual(weakWrittenTopics([], [scoreSpot(h, { 0: true, 1: true }, "", low.at)], "2026-11-11"), []);
  assert.deepEqual(weakWrittenTopics([essay("better", "2026-11-12", 7)], [low], "2026-11-12"), []);
  assert.deepEqual(weakWrittenTopics([essay("older", "2026-10-31", 9)], [low], "2026-11-11"), ["il|Treaties"]);
});
test("attempts group under their prompt, preserving legacy essays and original ids", () => {
  const a = essay("a", "2026-11-01", 5);
  const b = essay("b", "2026-11-03", 7, { attemptOf: "a" });
  const c = essay("c", "2026-11-04", 8, { attemptOf: "a" });
  const other = essay("other", "2026-11-02", 6, { facts: "Different facts" });
  assert.deepEqual(essayGroups([c, other, b, a]).map(g => g.map(e => e.id)), [["a", "b", "c"], ["other"]]);
  assert.equal(essayGroups([essay("orphan", "2026-11-06", 7, { attemptOf: "missing" })]).length, 1);
});
test("trend orders scores chronologically and averages only available rubric parts", () => {
  const legacy = essay("old", "2026-10-01", 3); delete legacy.grade.rubric;
  const trend = essayTrend([essay("b", "2026-11-03", 8), legacy, essay("a", "2026-11-01", 6), essay("asy", "2026-11-02", 2, { course: "asy" })], "il");
  assert.deepEqual(trend.essays.map(e => e.grade.score), [3, 6, 8]);
  assert.deepEqual(trend.rubric, { issues: 8, rules: 7, application: 6 });
  assert.deepEqual(essayTrend([legacy], "il").rubric, { issues: null, rules: null, application: null });
});
test("essay length uses last choice except within seven days of that course’s final", () => {
  assert.equal(defaultEssayLength("il", "short", "2026-11-24"), "short");
  assert.equal(defaultEssayLength("il", "short", "2026-11-25"), "full");
  assert.equal(defaultEssayLength("il", "short", "2026-12-02"), "full");
  assert.equal(defaultEssayLength("il", "short", "2026-12-03"), "short");
  assert.equal(defaultEssayLength("asy", "short", "2026-11-25"), "short");
  assert.equal(defaultEssayLength("asy", "full", "2026-11-01"), "full");
});

test("spot queue skips completed patterns, puts weak topics first and respects the course", () => {
  const old = { ...h, id: "old", class_date: "2026-10-01" };
  const newer = { ...h, id: "new", topic: "Force", class_date: "2026-11-01" };
  const asy = { ...newer, id: "asy", course: "asy" as const };
  const bank = [newer, old, asy];
  assert.equal(nextSpotHypo(bank, "il", [], new Set(["il|Treaties"]))?.id, "old");
  assert.equal(nextSpotHypo(bank, "il", [scoreSpot(old, {}, "")], new Set(["il|Treaties"]))?.id, "new");
  assert.equal(nextSpotHypo(bank, "il", [], new Set(), "new")?.id, "old");
  assert.equal(nextSpotHypo(bank, "asy", [], new Set())?.id, "asy");
  assert.equal(nextSpotHypo(bank, "pr", [], new Set()), undefined);
});
