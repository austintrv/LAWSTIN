import test from "node:test";
import assert from "node:assert/strict";
import { examDue, studyEngine, FINALS, type SyllabusUnit } from "../src/helpers/studyEngine";
import { emptyStudyRecord, reviewCard, type Flashcard } from "../src/helpers/studyMaterials";
import { finalsPlan, mixRound, nextReviewDay, readyCards } from "../src/helpers/studySession";
import type { OutputType as State, ProgressDTO, QuestionDTO } from "../src/endpoints/state_GET.schema";
import { reviewEvidence } from "../src/helpers/topicReview";
import { applyLocalAnswer } from "../src/helpers/localAnswer";
import { restorePractice } from "../src/helpers/practiceMemory";
import { changeStudyRecord, emptyStudyCache, mergeStudyRows, restoreStudyCache } from "../src/helpers/studyProgressStore";

const q = (id: string, course: QuestionDTO["course"], topic: string, subtopic = topic): QuestionDTO => ({
  id, course, topic, subtopic, classDay: 1, classDate: "2026-10-01", source: null, batch: null, stem: "Facts.", prompt: "Result?",
  choices: (["A", "B", "C", "D"] as const).map((c, i) => ({ id: c, role: (["correct", "sneaky", "average", "bad"] as const)[i], text: c, why: c })),
  answer: "A", rule: `Rule for ${subtopic}`, authority: "Rule 1",
});
const p = (questionId: string, patch: Partial<ProgressDTO> = {}): ProgressDTO => ({
  questionId, seen: 1, correct: 1, wrong: 0, box: 2, due: "2026-11-20", lastChoice: "A", lastCorrect: true, lastAt: "2026-11-01T12:00:00Z",
  missSneaky: 0, missAverage: 0, missBad: 0, guessed: 0, starred: false, flagged: false, ...patch,
});
const state = (questions: QuestionDTO[], progress: ProgressDTO[] = []): State => ({ questions, progress, runs: [], days: [] });
const card = (id: string, course: Flashcard["course"]): Flashcard => ({
  id, course, kind: "flashcard", title: id, topic: "T", subtopic: "S", class_date: "2026-10-01", class_day: 1, batch: "2026-10-02", source_files: ["f"], source_section: "s",
  sources: [], authority: "A", verified: { at: "2026-10-02T00:00:00Z", rounds: 1, checker: "c", notes: "n" }, front: `${id}?`, back: "Back", reason: "Why",
});

test("a review pushed past the final comes back in the last five days", () => {
  const final = FINALS.il; // 2026-12-02
  assert.equal(examDue("2026-11-20", "2026-11-13", final, "2026-11-15"), "2026-11-20");
  assert.equal(examDue("2026-12-15", "2026-11-10", final, "2026-11-15"), "2026-11-27");
  // Already reviewed inside the window: leave it alone.
  assert.equal(examDue("2026-12-15", "2026-11-28", final, "2026-11-29"), "2026-12-15");
  // After the exam the ordinary schedule applies.
  assert.equal(examDue("2026-12-15", "2026-11-10", final, "2026-12-03"), "2026-12-15");
  assert.equal(examDue(null, null, final, "2026-11-15"), null);
});

test("questions scheduled past the exam are due in finals week", () => {
  const s = state([q("il-1", "il", "Treaties")], [p("il-1", { due: "2026-12-20", lastAt: "2026-11-15T12:00:00Z" })]);
  assert.equal(studyEngine(s, "2026-11-26").queues("il").due.length, 0);
  assert.equal(studyEngine(s, "2026-11-27").queues("il").due.length, 1);
});

test("an exam takes unseen questions before ones already answered", () => {
  const qs = Array.from({ length: 8 }, (_, i) => q(`pr-${i}`, "pr", "Fees"));
  const s = state(qs, qs.slice(0, 4).map((x) => p(x.id)));
  const picked = studyEngine(s, "2026-11-10").examRound("pr", 4).map((it) => it.q.id).sort();
  assert.deepEqual(picked, ["pr-4", "pr-5", "pr-6", "pr-7"]);
});

test("rule cards cover closed-book courses only, one per doctrine, and only answered questions", () => {
  const s = state(
    [q("pr-1", "pr", "Fees", "Contingent fees"), q("pr-2", "pr", "Fees", "Contingent fees"), q("pr-3", "pr", "Fees", "Fee splitting"), q("il-1", "il", "Treaties")],
    [p("pr-1"), p("pr-2"), p("il-1")],
  );
  const cards = studyEngine(s, "2026-11-10").ruleCards();
  assert.deepEqual(cards.map((c) => c.id), ["rule:pr-1"]);
  assert.equal(cards[0].back, "Rule for Contingent fees");
});

test("coverage lists taught units in order, marks gaps, and folds older topic names in", () => {
  const units: SyllabusUnit[] = [
    { topic: "Treaties", dates: ["2026-09-02"] },
    { topic: "State Immunity", dates: ["2026-10-07"], also: ["Sovereign Immunity"] },
    { topic: "International Criminal Law", dates: ["2026-11-30"] },
  ];
  const s = state([q("il-1", "il", "Sovereign Immunity"), q("il-2", "il", "Laws of War")], [p("il-1")]);
  const rows = studyEngine(s, "2026-11-10").coverage("il", units);
  assert.deepEqual(rows.map((r) => [r.topic, r.status]), [["Treaties", "none"], ["State Immunity", "solid"], ["Laws of War", "unseen"]]);
  assert.deepEqual(rows[1].topics, ["Sovereign Immunity"]);
});

test("a low essay score marks its topic weak", () => {
  const s = state([q("il-1", "il", "Treaties")], [p("il-1")]);
  assert.equal(studyEngine(s, "2026-11-10").weakTopics().length, 0);
  assert.equal(studyEngine(s, "2026-11-10", { weakExtra: ["il|Treaties"] }).weakTopics().length, 1);
});

test("a session alternates two questions and a card, and runs on cards alone when questions are out", () => {
  const e = studyEngine(state(Array.from({ length: 6 }, (_, i) => q(`pr-${i}`, "pr", "Fees", `S${i}`))), "2026-11-10");
  const record = emptyStudyRecord();
  const cards = readyCards([card("pr-flashcard-1", "pr"), card("pr-flashcard-2", "pr")], [], record, undefined, "pr", "2026-11-10");
  assert.equal(cards.fresh.length, 2);
  const round = mixRound(e.buildRound("pr"), cards.list, record);
  assert.deepEqual(round.map((it) => (it.card ? "c" : "q")), ["q", "q", "c", "q", "q", "c", "q", "q"]);
  assert.deepEqual(mixRound([], cards.list, record).map((it) => !!it.card), [true, true]);
  // A card graded today leaves the ready list.
  record.cards["pr-flashcard-1"] = reviewCard(undefined, true, "2026-11-10");
  assert.deepEqual(readyCards([card("pr-flashcard-1", "pr"), card("pr-flashcard-2", "pr")], [], record, undefined, "pr", "2026-11-10").list.map((c) => c.id), ["pr-flashcard-2"]);
});

test("the finals plan spreads new material over the days left and schedules essays for essay courses", () => {
  const qs = [...Array.from({ length: 40 }, (_, i) => q(`il-${i}`, "il", "Treaties")), ...Array.from({ length: 27 }, (_, i) => q(`pr-${i}`, "pr", "Fees"))];
  const e = studyEngine(state(qs), "2026-11-10");
  const none = { il: { due: 0, fresh: 0 }, asy: { due: 0, fresh: 0 }, pr: { due: 0, fresh: 0 } };
  const plan = finalsPlan(e, { cards: none, lastEssay: { asy: "2026-11-09" }, fallbackGoal: 20 });
  const by = Object.fromEntries(plan.courses.map((c) => [c.course, c]));
  assert.equal(plan.active, true);
  assert.equal(by.il.target, 2); // 40 new over 20 days (22 days out, done two days early)
  assert.equal(by.pr.target, 1); // 27 new over 27 days (29 days out)
  assert.equal(by.il.essay, true);
  assert.equal(by.asy.essay, false); // wrote yesterday
  assert.equal(by.pr.essay, false); // multiple-choice final
  assert.equal(plan.goal, 10); // never below ten a day
  const after = finalsPlan(studyEngine(state(qs), "2026-12-20"), { cards: none, lastEssay: {}, fallbackGoal: 20 });
  assert.deepEqual([after.active, after.goal], [false, 20]);
});

test("daily practice stops at due and unseen items; reviewing ahead is explicit", () => {
  const s = state([q("due", "il", "A"), q("fresh", "asy", "B"), q("ahead", "pr", "C")], [p("due", { due: "2026-11-09" }), p("ahead")]);
  const e = studyEngine(s, "2026-11-10");
  const ids = (mode?: Parameters<typeof e.buildRound>[1]) => e.buildRound("all", mode).map((it) => it.q.id).sort();
  assert.deepEqual(ids(), ["due", "fresh"]);
  assert.deepEqual(ids("due"), ["due"]);
  assert.deepEqual(ids("new"), ["fresh"]);
  assert.deepEqual(ids("ahead"), ["ahead"]);
  assert.deepEqual(studyEngine(state([q("ahead", "pr", "C")], [p("ahead")]), "2026-11-10").buildRound("pr"), []);
});

test("finishing more than one batch never repeats an item or pulls reviews forward", () => {
  const qs = Array.from({ length: 24 }, (_, i) => q(`pr-${i}`, "pr", "Fees"));
  const s = state(qs, qs.slice(20).map((q) => p(q.id)));
  const done = new Set<string>();
  for (;;) {
    const eng = studyEngine({ ...s, questions: qs.filter((q) => !done.has(q.id)) }, "2026-11-10");
    const round = eng.buildRound("pr");
    if (!round.length) break;
    for (const it of round) { assert.equal(done.has(it.q.id), false); done.add(it.q.id); }
  }
  assert.equal(done.size, 20);
});

test("Due, New, and Ahead card sessions stay in their own lanes, including rule cards", () => {
  const record = emptyStudyRecord();
  record.cards.due = { ...reviewCard(undefined, false, "2026-11-09"), last_at: "2026-11-09T12:00:00Z" };
  record.cards.ahead = { ...reviewCard(undefined, true, "2026-11-09"), last_at: "2026-11-09T12:00:00Z" };
  const cards = [card("due", "il"), card("new", "asy"), card("ahead", "pr")];
  const rule = { id: "rule:new", course: "pr" as const, topic: "T", front: "Rule?", back: "Rule.", reason: "", authority: "", rule: true };
  const ids = (mode: "mixed" | "due" | "new" | "ahead") => readyCards(cards, [rule], record, undefined, "all", "2026-11-10", mode).list.map((c) => c.id).sort();
  assert.deepEqual(ids("mixed"), ["due", "new", "rule:new"]);
  assert.deepEqual(ids("due"), ["due"]);
  assert.deepEqual(ids("new"), ["new", "rule:new"]);
  assert.deepEqual(ids("ahead"), ["ahead"]);
});

test("missed topics clear after a confident answer or a successful lesson, and reopen on a new miss or guess", () => {
  const qs = [q("miss", "il", "Treaties"), q("recovered", "il", "Treaties"), q("guess", "pr", "Fees")];
  const progress = [p("miss", { lastCorrect: false, wrong: 2 }), p("recovered", { wrong: 3, guessed: 1, box: 3 }), p("guess", { guessed: 1, box: 1 })];
  const s = state(qs, progress);
  const topics = studyEngine(s, "2026-11-10").missedTopics();
  assert.deepEqual(topics.flatMap((t) => t.items.map((it) => it.q.id)).sort(), ["guess", "miss"]);
  const reviews = { "il|Treaties": { at: "2026-11-10T12:00:00Z", questions: reviewEvidence(progress) } };
  assert.deepEqual(studyEngine(s, "2026-11-10", { reviews }).missedTopics().map((t) => t.topic), ["Fees"]);
  assert.equal(studyEngine(s, "2026-11-10", { reviews }).queues("il").missed.length, 0);
  assert.equal(s.progress[0].wrong, 2); // History is untouched.
  const missedAgain = state(qs, [{ ...progress[0], wrong: 3 }, ...progress.slice(1)]);
  assert.equal(studyEngine(missedAgain, "2026-11-10", { reviews }).missedTopics().length, 2);
  const guessedAgain = state(qs, [{ ...progress[0], lastCorrect: true, box: 1, guessed: 1 }, ...progress.slice(1)]);
  assert.equal(studyEngine(guessedAgain, "2026-11-10", { reviews }).missedTopics().length, 2);
});

test("review checkpoints survive local restore and cloud hydration without clearing newer local reviews", () => {
  const review = { at: "2026-11-10T12:00:00Z", questions: { miss: { wrong: 2, guessed: 1 } } };
  let cache = emptyStudyCache();
  cache = changeStudyRecord(cache, { ...cache.record, reviews: { "il|Treaties": review } }, review.at);
  const rows = Object.values(cache.pending);
  assert.equal(rows[0].key, "study:v1:reviews:il|Treaties");
  assert.deepEqual(restoreStudyCache(JSON.parse(JSON.stringify(cache))).record.reviews, cache.record.reviews);
  assert.deepEqual(mergeStudyRows(emptyStudyCache(), rows).record.reviews["il|Treaties"], review);
  const invalid = { ...rows[0], key: "study:v1:reviews:bad", value: '{"at":"bad","questions":{}}' };
  assert.deepEqual(mergeStudyRows(emptyStudyCache(), [invalid]).record.reviews, {});
});

test("offline answers advance spacing and count misses, so restarting cannot immediately repeat them", () => {
  const qs = [q("right", "il", "T"), q("wrong", "pr", "T")];
  const before = state(qs);
  let after = applyLocalAnswer(before, { questionId: "right", choice: "A", localDate: "2026-11-10" }, "2026-11-10T12:00:00Z");
  after = applyLocalAnswer(after, { questionId: "wrong", choice: "B", localDate: "2026-11-10" }, "2026-11-10T12:01:00Z");
  assert.deepEqual(after.progress.map((p) => [p.box, p.due]), [[2, "2026-11-13"], [1, "2026-11-11"]]);
  assert.deepEqual(after.days, [{ date: "2026-11-10", answered: 2, correct: 1 }]);
  assert.equal(after.progress[1].missSneaky, 1);
  assert.deepEqual(studyEngine(after, "2026-11-10").buildRound("all"), []);
  assert.deepEqual(before.progress, []);
});

test("saved practice restores unanswered JSON positions and expires with the study day", () => {
  const at = new Date("2026-11-10T12:00:00").getTime();
  const saved = { key: "round:all", at, snap: { items: [{ q: q("1", "il", "T"), review: false }, { q: q("2", "pr", "T"), review: false }], i: 1,
    picks: ["A", undefined], results: [true, undefined], shown: [true, undefined], typed: ["My answer", undefined] } };
  const restored = restorePractice(JSON.parse(JSON.stringify(saved)), at + 1000)!;
  assert.equal(restored.snap.picks[1], undefined);
  assert.equal(restored.snap.results[1], undefined);
  assert.equal(restored.snap.i, 1);
  assert.equal(restored.snap.typed?.[0], "My answer");
  assert.equal(restorePractice(saved, at + 86400000), null);
  assert.equal(restorePractice({ ...saved, snap: { ...saved.snap, i: 3 } }, at), null);
  assert.equal(restorePractice({ key: "round:all" }, at), null);
  assert.equal(restorePractice({ ...saved, snap: { ...saved.snap, items: [{ card: { id: "broken", course: "il" } }] } }, at), null);
});

test("the next review includes flashcards and final-exam dates, with course filtering", () => {
  const e = studyEngine(state([q("q", "il", "T")], [p("q", { due: "2026-12-20" })]), "2026-11-10");
  const record = emptyStudyRecord();
  record.cards.card = { seen: 1, correct: 1, box: 2, due: "2026-11-14", last_at: "2026-11-09T12:00:00Z" };
  const cards = [card("card", "pr")];
  assert.equal(nextReviewDay(e, cards, record), "2026-11-14");
  assert.equal(nextReviewDay(e, cards, record, "il"), "2026-11-27");
  assert.equal(nextReviewDay(e, cards, record, "asy"), null);
});
