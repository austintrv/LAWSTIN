import test from "node:test";
import assert from "node:assert/strict";
import { closeCallOrder, missedRules, ruleIsMissed, type RuleAnswer } from "../src/helpers/missedRules";
import { examSizes, examSummary, localExams, restoreExam } from "../src/helpers/useExams";
import { clearCaches, queueSetting, writeCache } from "../src/helpers/offlineCache";
import type { ProgressDTO, QuestionDTO } from "../src/endpoints/state_GET.schema";

const question = (id: string, topic = "One", course: QuestionDTO["course"] = "pr"): QuestionDTO => ({ id, course, topic, subtopic: null, classDay: null, classDate: null, source: null, batch: null,
  stem: `Facts ${id}`, prompt: "Which result?", answer: "A", rule: "Apply the rule.", authority: "Existing authority",
  choices: ["correct", "sneaky", "average", "bad"].map((role, i) => ({ id: "ABCD"[i], role, text: `${role} choice`, why: `${role} explanation` })) as QuestionDTO["choices"] });
const answer = (day: number, correct: boolean, hour = 12): RuleAnswer => ({ question_id: "q", choice: correct ? "A" : "B", role: correct ? "correct" : "sneaky", is_correct: correct,
  local_date: `2026-11-${day}`, answered_at: `2026-11-${day}T${hour}:00:00Z` });
const progress = (id: string, patch: Partial<ProgressDTO> = {}): ProgressDTO => ({ questionId: id, seen: 1, correct: 0, wrong: 1, box: 1, due: null, lastChoice: "B", lastCorrect: false,
  lastAt: "2026-11-10T12:00:00Z", missSneaky: 0, missAverage: 0, missBad: 0, guessed: 0, starred: false, flagged: false, ...patch });

test("a missed rule needs right answers on two separate days without another miss", () => {
  assert.equal(ruleIsMissed([]), false);
  assert.equal(ruleIsMissed([answer(10, true)]), false);
  assert.equal(ruleIsMissed([answer(10, false)]), true);
  assert.equal(ruleIsMissed([answer(10, false), answer(10, true, 13), answer(10, true, 14)]), true);
  assert.equal(ruleIsMissed([answer(10, false), answer(11, true), answer(12, true)]), false);
  assert.equal(ruleIsMissed([answer(10, false), answer(11, true), answer(12, false), answer(12, true, 13)]), true);
  assert.equal(ruleIsMissed([answer(10, false), answer(11, true), answer(12, true), answer(13, false)]), true);
});
test("the rule state machine sorts history and handles same-day corrections and ties", () => {
  assert.equal(ruleIsMissed([answer(12, true), answer(10, false), answer(11, true)]), false);
  assert.equal(ruleIsMissed([{ ...answer(11, true), id: 2 }, { ...answer(11, false), id: 1 }, answer(12, true)]), false);
  assert.equal(ruleIsMissed([answer(10, false), answer(11, true), answer(11, false, 13), answer(12, true)]), true);
});
test("partial or unavailable history cannot silently clear a known miss", () => {
  const p = progress("q");
  assert.equal(ruleIsMissed([], p), true);
  assert.equal(ruleIsMissed([], { ...p, lastCorrect: true }), true);
  assert.equal(ruleIsMissed([answer(11, true)], { ...p, lastCorrect: true }), true);
  assert.equal(ruleIsMissed([answer(11, true), answer(12, true)], { ...p, lastCorrect: true }), false);
  assert.equal(ruleIsMissed([answer(11, true), answer(12, true)], { ...p, lastAt: answer(13, false).answered_at }), true);
  assert.equal(ruleIsMissed([answer(10, false), answer(11, true), answer(12, true)], { ...p, wrong: 2, lastCorrect: true, lastAt: answer(13, true).answered_at }), true);
});
test("missed rules retain authority, wrong-answer kind, counts and course filters, worst first", () => {
  const qs = [question("q"), question("other", "Two", "il"), { ...question("no-rule"), rule: null }];
  const ps = [progress("q", { wrong: 4 }), progress("other"), progress("no-rule")];
  const rows = missedRules(qs, ps, [answer(10, false)]);
  assert.deepEqual(rows.map(r => r.q.id), ["q", "other"]);
  assert.equal(rows[0].misses, 4); assert.equal(rows[0].role, "sneaky"); assert.equal(rows[0].q.authority, "Existing authority");
  assert.deepEqual(missedRules(qs, ps, [], "il").map(r => r.q.id), ["other"]);
  assert.deepEqual(missedRules([question("q")], [progress("q", { lastCorrect: true })], [answer(10, false), answer(11, true), answer(12, true)]), []);
});
test("exam summaries count unanswered questions as missed and break down every topic", () => {
  const qs = [question("a"), question("b"), question("c", "Two", "il")];
  const result = examSummary(qs, { a: "A", b: "B" }, ["c", "retired"], 121.4, true, "2026-11-11T12:00:00Z");
  assert.equal(result.total, 3); assert.equal(result.size, 3); assert.equal(result.score, 1); assert.equal(result.seconds, 121); assert.equal(result.course, "all");
  assert.deepEqual(result.wrong, ["b", "c"]); assert.deepEqual(result.flagged, ["c"]);
  assert.deepEqual(result.byTopic, [{ topic: "Two", right: 0, total: 1 }, { topic: "One", right: 1, total: 2 }]);
  assert.equal(examSummary([question("a")], { a: "A" }, [], 0, false, result.at).course, "pr");
});
test("exam sizes never exceed or repeat the bank and All works below ten", () => {
  for (const [bank, expected] of [[0, []], [3, [3]], [10, [10]], [24, [10, 24]], [25, [10, 25]], [59, [10, 25, 59]], [60, [10, 25, 60]], [90, [10, 25, 60, 90]]] as [number, number[]][]) assert.deepEqual(examSizes(bank), expected);
});
test("close calls prioritize sneaky misses, then guesses, then other seen questions", () => {
  const qs = ["other", "guess", "sneaky", "new", "wrong-course"].map(id => question(id, "One", id === "wrong-course" ? "il" : "pr"));
  const ps = [progress("other", { lastChoice: "A", lastCorrect: true }), progress("guess", { guessed: 1, lastChoice: "A" }), progress("sneaky", { missSneaky: 1 }), progress("wrong-course")];
  const before = structuredClone(ps);
  assert.deepEqual(closeCallOrder(qs, ps, "pr").map(q => q.id), ["sneaky", "guess", "other"]);
  assert.deepEqual(ps, before);
});
test("exam resume preserves choices, flags and stopped clock for exactly three hours", () => {
  const raw = { id: "one", at: 100, questions: [question("a")], i: 0, picks: { a: "B", unknown: "A" }, flagged: ["a"], seconds: 17, limit: 120, submitted: [] };
  const restored = restoreExam(raw, 100 + 3 * 3600000)!;
  assert.equal(restored.seconds, 17); assert.deepEqual(restored.picks, { a: "B" }); assert.deepEqual(restored.flagged, ["a"]);
  assert.equal(restoreExam(raw, 101 + 3 * 3600000), null);
  assert.equal(restoreExam({ ...raw, questions: [question("a"), question("a")] }, 100), null);
  assert.equal(restoreExam({ ...raw, i: 1 }, 100), null);
  assert.equal(restoreExam({ ...raw, seconds: -1 }, 100), null);
  assert.equal(restoreExam({ ...raw, questions: [null] }, 100), null);
});
test("unsent exams merge with cached history once, and sign-out clears exams and drafts", () => {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new Proxy(store, { get: (s, k) => k === "getItem" ? (key: string) => s[key] ?? null : k === "setItem" ? (key: string, v: string) => { s[key] = v; } : k === "removeItem" ? (key: string) => { delete s[key]; } : s[k as string] }) });
  const entry = examSummary([question("a")], { a: "A" }, [], 20, true, "2026-11-11T12:00:00Z");
  queueSetting(`exam:v1:${entry.at}`, JSON.stringify(entry)); writeCache("exams", [entry]); writeCache("exam-active", { private: true }); writeCache("rule-answers", [answer(10, false)]);
  assert.equal(localExams().length, 1); clearCaches(); assert.deepEqual(localExams(), []); assert.deepEqual(store, {});
});
