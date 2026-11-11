import test from "node:test";
import assert from "node:assert/strict";
import { activeCourses, apportion, courseCounts, examDue, studyEngine, FINALS, type SyllabusUnit } from "../src/helpers/studyEngine";
import { emptyStudyRecord, reviewCard, type Flashcard } from "../src/helpers/studyMaterials";
import { finalsPlan, holdDayGoal, inferredDone, missedLessonBatch, mixRound, nextReviewDay, questionUpdate, readyCards, reconcileDayWork, restoreDayGoal, reviewGreeting, studyNumbers } from "../src/helpers/studySession";
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
  assert.equal(by.il.target, 3); // Raw targets 2:1 scale to the minimum goal of five.
  assert.equal(by.pr.target, 2);
  assert.equal(by.il.essay, true);
  assert.equal(by.asy.essay, false); // wrote yesterday
  assert.equal(by.pr.essay, false); // multiple-choice final
  assert.equal(plan.goal, 5);
  assert.equal(plan.courses.reduce((a, c) => a + c.target, 0), plan.goal);
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

const noCards = () => ({ il: { due: 0, fresh: 0 }, asy: { due: 0, fresh: 0 }, pr: { due: 0, fresh: 0 } });
const planFor = (e: ReturnType<typeof studyEngine>, done = courseCounts(), extra: Partial<Parameters<typeof finalsPlan>[1]> = {}) => finalsPlan(e, { cards: noCards(), lastEssay: {}, fallbackGoal: 20, done, ...extra });

test("a day's goal and course quotas stay fixed through answers, cards, reloads and a shrinking bank", () => {
  const today = "2026-11-10";
  let s = state(Array.from({ length: 60 }, (_, i) => q(`q-${i}`, "il", "Treaties")));
  const done = courseCounts(), record = emptyStudyRecord();
  let e = studyEngine(s, today);
  const original = holdDayGoal(planFor(e), today, null);
  let saved = JSON.parse(JSON.stringify(original.saved));
  const before = studyNumbers(e, readyCards([], [], record, s, "il", today), original, done, "il");
  for (let i = 0; i < 5; i++) {
    s = applyLocalAnswer(s, { questionId: `q-${i}`, choice: "A", localDate: today }, `${today}T18:00:00Z`);
    done.il++;
    e = studyEngine(s, today);
    const held = holdDayGoal(planFor(e, done), today, saved);
    assert.equal(held.goal, original.goal);
    assert.deepEqual(held.saved.targets, original.saved.targets);
    const numbers = studyNumbers(e, readyCards([], [], record, s, "il", today), held, done, "il");
    assert.equal(numbers.left, Math.max(0, before.left - i - 1));
    saved = JSON.parse(JSON.stringify(held.saved));
  }
  const smaller = holdDayGoal(planFor(studyEngine(state([]), today)), today, saved);
  assert.equal(smaller.goal, original.goal);
  assert.equal(restoreDayGoal(saved, "2026-11-11"), null);
});

test("fixed goals obey the range and same-day high water mark", () => {
  const e = studyEngine(state([]), "2026-11-10");
  for (const value of [0, 5, 20, 40, 100]) {
    const plan = planFor(e, courseCounts(), { planOn: false, fallbackGoal: value });
    assert.equal(plan.goal, Math.min(40, Math.max(5, value)));
    assert.equal(plan.courses.reduce((a, c) => a + c.target, 0), plan.goal);
  }
  const plan = planFor(e, courseCounts(), { planOn: false });
  const saved = holdDayGoal(plan, e.today, { date: e.today, goal: 35 });
  assert.equal(holdDayGoal(plan, e.today, saved.saved, 10).goal, 35);
  assert.equal(holdDayGoal(plan, e.today, saved.saved, 100).goal, 40);
  assert.equal(restoreDayGoal({ date: e.today, goal: "20" }, e.today), null);
  assert.equal(restoreDayGoal({ date: e.today, goal: 60 }, e.today), null);
});

test("overdue questions and cards share one ten-review limit per course", () => {
  const qs = Array.from({ length: 60 }, (_, i) => q(`overdue-${i}`, "il", "T"));
  const e = studyEngine(state(qs, qs.map((x) => p(x.id, { due: "2026-10-01" }))), "2026-11-10");
  const cards = noCards(); cards.il.due = 50;
  const plan = planFor(e, courseCounts(), { cards });
  assert.equal(plan.goal, 10);
  assert.equal(plan.courses.find((c) => c.course === "il")!.target, 10);
  for (const today of ["2026-11-13", "2026-11-24"]) assert.equal(planFor(studyEngine(state(qs, qs.map((x) => p(x.id, { due: "2026-10-01" }))), today), courseCounts(), { cards }).goal, 10);
});

test("capped plans scale course targets proportionally with largest remainder rounding", () => {
  assert.deepEqual(apportion([1, 1, 1], 5), [2, 2, 1]);
  assert.deepEqual(apportion([80, 10, 10], 40), [32, 4, 4]);
  const qs = ["il", "asy", "pr"].flatMap((c) => Array.from({ length: 1000 }, (_, i) => q(`${c}-${i}`, c as QuestionDTO["course"], "T")));
  const e = studyEngine(state(qs), "2026-12-01"), plan = planFor(e);
  assert.equal(plan.goal, 40);
  assert.equal(plan.courses.reduce((a, c) => a + c.target, 0), 40);
  assert(plan.courses[0].target > plan.courses[1].target);
});

test("every filter uses its tile target and clamps to what is actually ready", () => {
  const e = studyEngine(state([q("il", "il", "T"), q("pr", "pr", "T")]), "2026-11-10");
  const plan = planFor(e), record = emptyStudyRecord(), done = { il: 1, asy: 0, pr: 0 };
  for (const filter of ["il", "asy", "pr"] as const) {
    const n = studyNumbers(e, readyCards([], [], record, undefined, filter, e.today), plan, done, filter);
    assert.equal(n.goal, plan.courses.find((c) => c.course === filter)!.target);
    assert.equal(n.left, Math.min(Math.max(0, n.goal - done[filter]), n.ready));
    assert(n.left <= n.ready);
    if (!n.ready) assert.equal(n.minutes, 0);
  }
});

test("passed courses step out of All questions, cards, goals and reviews, then return after the last final", () => {
  const qs = [q("il", "il", "T"), q("asy", "asy", "T"), q("pr", "pr", "T")];
  const record = emptyStudyRecord(), cards = [card("il-c", "il"), card("asy-c", "asy"), card("pr-c", "pr")];
  const e = studyEngine(state(qs), "2026-12-03");
  assert.deepEqual(activeCourses(e.today), ["asy", "pr"]);
  assert.deepEqual(e.queues().fresh.map((q) => q.course), ["asy", "pr"]);
  assert(e.buildRound("all").every((it) => it.q.course !== "il"));
  assert.equal(e.buildRound("il").length, 1);
  assert.deepEqual(readyCards(cards, [], record, undefined, "all", e.today).fresh.map((c) => c.course), ["asy", "pr"]);
  assert.deepEqual(planFor(e).courses.map((c) => c.course), ["asy", "pr"]);
  const after = studyEngine(state(qs), "2026-12-10");
  assert.equal(after.queues().fresh.length, 3);
  assert.equal(readyCards(cards, [], record, undefined, "all", after.today).fresh.length, 3);
  assert.equal(planFor(after).courses.length, 3);
  assert.equal(planFor(after).active, false);
});

test("seeded new-question shares follow the plan, redistribute shortages, and reviews include every course", () => {
  const qs = ["il", "asy", "pr"].flatMap((c) => Array.from({ length: 30 }, (_, i) => q(`${c}-${i}`, c as QuestionDTO["course"], "T")));
  const seeded = () => { let seed = 7; return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); };
  const e = studyEngine(state(qs), "2026-11-10", { random: seeded() });
  const round = e.buildRound("all", "new", { il: 8, asy: 1, pr: 1 });
  assert.deepEqual(["il", "asy", "pr"].map((c) => round.filter((it) => it.q.course === c).length), [8, 1, 1]);
  assert.deepEqual(round, studyEngine(state(qs), "2026-11-10", { random: seeded() }).buildRound("all", "new", { il: 8, asy: 1, pr: 1 }));
  const shortage = studyEngine(state(qs.filter((q) => q.course !== "il" || q.id === "il-0")), "2026-11-10").buildRound("all", "new", { il: 8, asy: 1, pr: 1 });
  assert.equal(shortage.length, 10);
  const progress = qs.slice(0, 30).map((x) => p(x.id, { due: "2026-09-01" }));
  progress.push(p("asy-0", { due: "2026-11-10" }), p("pr-0", { due: "2026-11-10" }));
  const mixed = studyEngine(state(qs, progress), "2026-11-10").buildRound("all");
  assert.deepEqual(new Set(mixed.filter((it) => it.review).map((it) => it.q.course)), new Set(["il", "asy", "pr"]));
});

test("missed lessons cover at most four topics and continue without dropping or repeating topics", () => {
  const topics = Array.from({ length: 11 }, (_, i) => `topic-${i}`), seen: string[] = [];
  let rest = topics;
  while (rest.length) {
    const batch = missedLessonBatch(rest);
    assert(batch.topics.length <= 4);
    seen.push(...batch.topics); rest = batch.remaining;
  }
  assert.deepEqual(seen, topics);
  assert.equal(missedLessonBatch(topics).remaining.length, 7);
});

test("day credit restores known courses without inventing a course for old aggregate activity", () => {
  const s = state([q("q", "il", "T")], [p("q", { lastAt: "2026-11-10T18:00:00Z" })]);
  const e = studyEngine(s, "2026-11-10"), record = emptyStudyRecord();
  record.cards["custom-card"] = { ...reviewCard(undefined, true, e.today), last_at: "2026-11-10T18:00:00Z" };
  const inferred = inferredDone(e, record, [{ day: e.today, course: "asy", minutes: 45 }], [card("custom-card", "pr")]);
  assert.deepEqual(inferred, { il: 1, asy: 10, pr: 1 });
  const work = reconcileDayWork(e.today, 20, inferred, null);
  assert.equal(work.total, 20);
  const plan = planFor(e);
  assert.equal(studyNumbers(e, readyCards([], [], record, s, "all", e.today), plan, work.done, "all", work.total).answered, 20);
  assert.equal(studyNumbers(e, readyCards([], [], record, s, "il", e.today), plan, work.done, "il", work.total).answered, 1);
  assert.deepEqual(reconcileDayWork(e.today, 0, courseCounts(), { ...work, date: "2026-11-09" }).done, courseCounts());
});

test("progress totals use day activity, guessed counts stay separate, and update totals agree", () => {
  const s = state([q("q", "il", "T")], [p("q", { guessed: 7, correct: 2, wrong: 5 })]);
  s.days = [{ date: "2026-11-10", answered: 12, correct: 8 }, { date: "2026-11-09", answered: 5, correct: 3 }];
  const e = studyEngine(s, "2026-11-10");
  assert.equal(e.totalAnswers, 17);
  assert.equal(e.missProfile().guessed, 7);
  assert.equal(questionUpdate(e, { date: e.today, added: 100, byCourse: { il: 3, asy: 2 }, note: "" }).total, 5);
  assert.equal(reviewGreeting("9 reviews on the docket", 4), "4 reviews are waiting");
  assert.equal(reviewGreeting("One review is waiting", 0), "Ready when you are, Austin");
});
