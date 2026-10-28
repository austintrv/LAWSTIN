import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cardQueue, emptyStudyRecord, libraryErrors, materialErrors, reviewCard, weakMaterialTopics, type Flashcard, type Flowchart, type MaterialLibrary } from "../src/helpers/studyMaterials";
import { acknowledgeStudyRows, changeStudyRecord, emptyStudyCache, mergeStudyRows, restoreStudyCache } from "../src/helpers/studyProgressStore";
import type { OutputType as State } from "../src/endpoints/state_GET.schema";

const library = JSON.parse(fs.readFileSync("src/data/study-materials.json", "utf8")) as MaterialLibrary;
const today = "2026-10-28";
const card = library.materials.find((m): m is Flashcard => m.kind === "flashcard")!;
const flow = library.materials.find((m): m is Flowchart => m.kind === "flowchart")!;

test("the published library and checker counts reconcile", () => assert.deepEqual(libraryErrors(library), []));
test("unchecked, future, impossible-date, and unsourced cards cannot reach the app", () => {
  for (const edit of [{ verified: null }, { class_date: "2099-01-01" }, { class_date: "2026-02-31" }, { source_files: [] }, { sources: [null] }]) {
    assert.ok(materialErrors({ ...card, ...edit }, today).length > 0);
  }
});
test("flowchart validation rejects dangling branches, cycles, and unreachable steps", () => {
  const dangling = structuredClone(flow); dangling.nodes[0].branches[0] = { label: "Continue", next: "absent" };
  assert.ok(materialErrors(dangling, today).some(e => e.includes("branch")));
  const cycle = structuredClone(flow); cycle.nodes[0].branches[0] = { label: "Continue", next: cycle.start };
  assert.ok(materialErrors(cycle, today).some(e => e.includes("cycle")));
  const unreachable = structuredClone(flow); unreachable.nodes.push({ id: "orphan", question: "Unreachable?", authority: "Course rule", branches: [{ label: "End", outcome: "Done" }] });
  assert.ok(materialErrors(unreachable, today).some(e => e.includes("unreachable")));
  const malformed = structuredClone(flow) as unknown as { nodes: { branches: unknown[] }[] }; malformed.nodes[0].branches = [null];
  assert.doesNotThrow(() => materialErrors(malformed, today));
});
test("duplicate items and false verification counts fail publication validation", () => {
  assert.ok(libraryErrors({ ...library, materials: [card, card] }).some(e => e.includes("Duplicate ID")));
  const bad = structuredClone(library); bad.runs[0].check_counts.passed++;
  assert.ok(libraryErrors(bad).some(e => e.includes("reconcile")));
});
test("flashcards use the quiz’s 1, 3, 7, 16, and 35 day spacing", () => {
  let p = reviewCard(undefined, true, today); assert.equal(p.due, "2026-10-31");
  p = reviewCard(p, true, today); assert.equal(p.due, "2026-11-04");
  p = reviewCard(p, true, today); assert.equal(p.due, "2026-11-13");
  p = reviewCard(p, true, today); assert.equal(p.due, "2026-12-02");
  p = reviewCard(p, false, today); assert.equal(p.due, "2026-10-29"); assert.equal(p.box, 1);
});
test("mixed sessions interleave courses and withhold cards whose review is still ahead", () => {
  const cards = library.materials.filter((m): m is Flashcard => m.kind === "flashcard");
  const record = emptyStudyRecord();
  record.cards[cards[0].id] = reviewCard(undefined, true, today);
  const queue = cardQueue(cards, record, undefined, today);
  assert.equal(queue.some(c => c.id === cards[0].id), false);
  assert.equal(new Set(queue.slice(0, 3).map(c => c.course)).size, 3);
  assert.equal(cardQueue(cards, record, undefined, today, true).length, cards.length);
});
test("due reviews precede unseen cards", () => {
  const cards = library.materials.filter((m): m is Flashcard => m.kind === "flashcard");
  const record = emptyStudyRecord(); const due = cards.at(-1)!;
  record.cards[due.id] = { ...reviewCard(undefined, false, today), due: today };
  assert.equal(cardQueue(cards, record, undefined, today)[0].id, due.id);
});
test("weakness includes repeated misses, sneaky distractors, and correct guesses", () => {
  const state = { questions: [
    { id: "a", course: "il", topic: "A" }, { id: "b", course: "asy", topic: "B" }, { id: "c", course: "pr", topic: "C" }, { id: "d", course: "il", topic: "D" },
  ], progress: [
    { questionId: "a", correct: 1, wrong: 2, missSneaky: 0, guessed: 0 }, { questionId: "b", correct: 0, wrong: 1, missSneaky: 1, guessed: 0 },
    { questionId: "c", correct: 1, wrong: 0, missSneaky: 0, guessed: 1 }, { questionId: "d", correct: 0, wrong: 1, missSneaky: 0, guessed: 0 },
  ] } as State;
  assert.deepEqual([...weakMaterialTopics(state)].sort(), ["asy|B", "il|A", "pr|C"]);
});
test("cloud hydration cannot overwrite unsent local answers", () => {
  let cache = emptyStudyCache();
  cache = changeStudyRecord(cache, { ...cache.record, notes: { item: "My new answer" } }, "2026-10-28T10:00:00Z");
  cache = mergeStudyRows(cache, [{ key: "study:v1:notes:item", value: '"Old cloud answer"', updated_at: "2026-10-28T11:00:00Z" }]);
  assert.equal(cache.record.notes.item, "My new answer"); assert.equal(Object.keys(cache.pending).length, 1);
});
test("a slow cloud acknowledgement cannot clear a newer local edit", () => {
  let cache = emptyStudyCache();
  cache = changeStudyRecord(cache, { ...cache.record, notes: { item: "First" } }, "2026-10-28T10:00:00Z");
  const sent = Object.values(cache.pending);
  cache = changeStudyRecord(cache, { ...cache.record, notes: { item: "Second" } }, "2026-10-28T10:00:01Z");
  cache = acknowledgeStudyRows(cache, sent);
  assert.equal(Object.values(cache.pending)[0].value, '"Second"');
});
test("cloud hydration rejects malformed progress and unrelated settings", () => {
  const cache = mergeStudyRows(emptyStudyCache(), [
    { key: "summary_email", value: '"unrelated"', updated_at: "2026-10-28T10:00:00Z" },
    { key: "study:v1:cards:bad", value: '{"box":99}', updated_at: "2026-10-28T10:00:00Z" },
    { key: "study:v1:notes:__proto__", value: '"bad"', updated_at: "2026-10-28T10:00:00Z" },
    { key: "study:v1:notes:valid", value: '"My analysis"', updated_at: "2026-10-28T10:00:00Z" },
  ]);
  assert.deepEqual(cache.record.notes, { valid: "My analysis" }); assert.deepEqual(cache.record.cards, {});
});

test("restoring a corrupt cache cannot enqueue unrelated settings writes", () => {
  const cache = restoreStudyCache({ record: { cards: { broken: [] }, notes: { valid: "Saved answer" } }, clocks: {}, pending: { summary_email: { key: "summary_email", value: "wrong", updated_at: "2026-10-28T10:00:00Z" } } });
  assert.deepEqual(cache.record.cards, {}); assert.deepEqual(cache.record.notes, { valid: "Saved answer" }); assert.deepEqual(cache.pending, {});
});

test("scheduled preflight writes nothing when the taught coverage already exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lawstin-preflight-"));
  try {
    fs.mkdirSync(path.join(dir, "src/data"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src/data/study-materials.json"), JSON.stringify(library));
    const brief = { captured_at: new Date().toISOString(), coverage: [{ course: card.course, topic: card.topic, subtopic: card.subtopic, latest: card.class_date, n: 1 }], topics: [], half_known: [], card_progress: {}, answers_since_last_study_run: 1, flags: [] };
    const input = path.join(dir, "history.brief.json"); fs.writeFileSync(input, JSON.stringify(brief));
    const before = fs.readFileSync(path.join(dir, "src/data/study-materials.json"), "utf8");
    const result = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), path.resolve("scripts/study-preflight.ts"), input], { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).should_run, false);
    assert.equal(fs.readFileSync(path.join(dir, "src/data/study-materials.json"), "utf8"), before);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["history.brief.json", "src"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the publisher rejects missing checker evidence without changing the library", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lawstin-publish-"));
  try {
    fs.mkdirSync(path.join(dir, "src/data"), { recursive: true });
    const original = JSON.stringify({ schema_version: 1, materials: [], runs: [] });
    fs.writeFileSync(path.join(dir, "src/data/study-materials.json"), original);
    fs.copyFileSync("src/data/study-taxonomy.json", path.join(dir, "src/data/study-taxonomy.json"));
    const input = path.join(dir, "bad.batch.json"); fs.writeFileSync(input, JSON.stringify({ materials: [card], run: library.runs[0], checks: [] }));
    const result = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), path.resolve("scripts/publish-study-batch.ts"), input], { cwd: dir, encoding: "utf8" });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Missing independent checker evidence/);
    assert.equal(fs.readFileSync(path.join(dir, "src/data/study-materials.json"), "utf8"), original);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
