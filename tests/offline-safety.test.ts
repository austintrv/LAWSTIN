import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgeSetting, applyStudyEvents, clearCaches, enqueueStudy, queueSetting, readCache, readStudyQueue, settingQueue, writeStudyQueue } from "../src/helpers/offlineCache";
import { draftKey, readDrafts, removeDraft, saveDraft } from "../src/helpers/useWritten";
import type { SpotterDTO } from "../src/endpoints/ai_POST.schema";

const memory = () => {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new Proxy(store, {
    get: (obj, key) => key === "getItem" ? (k: string) => obj[k] ?? null : key === "setItem" ? (k: string, v: string) => { obj[k] = v; } : key === "removeItem" ? (k: string) => { delete obj[k]; } : obj[key as string],
  }) });
};
const spot = (id: string, course: SpotterDTO["course"] = "il"): SpotterDTO => ({ course, topic: id, facts: "Sample facts", call: "Discuss", issues: [], materialId: id });

test("pending settings retain newer edits when an earlier write is acknowledged", () => {
  memory(); const first = queueSetting("workspace:notes:clinic", "First");
  queueSetting(first.key, "Latest"); acknowledgeSetting(first);
  assert.equal(settingQueue()[first.key].value, "Latest");
  assert.equal(readCache(first.key), "Latest");
  acknowledgeSetting(settingQueue()[first.key]); assert.deepEqual(settingQueue(), {});
});
test("hours use the cached known total and keep the absolute pending total for retries", () => {
  memory(); const key = "workspace:clinic:hours";
  const known = { logged: 87.5, required: 200, as_of: "2026-11-11" };
  const row = queueSetting(key, JSON.stringify({ ...known, logged: known.logged + 2 }));
  assert.equal(JSON.parse(readCache<string>(key)!).logged, 89.5);
  assert.deepEqual(settingQueue()[key], row);
});
test("study event retries retain client ids and count each card or drill only once per day", () => {
  memory(); const first = enqueueStudy("card", "c1", false, "2026-11-11");
  assert(first[0].id < 0 && Number.isSafeInteger(first[0].id));
  assert.deepEqual(enqueueStudy("card", "c1", true, "2026-11-11"), []);
  assert.equal(readStudyQueue()[0].id, first[0].id);
  writeStudyQueue([]);
  assert.deepEqual(enqueueStudy("card", "c1", true, "2026-11-11"), []);
  assert.equal(enqueueStudy("card", "c1", true, "2026-11-12").length, 1);
  enqueueStudy("drill", "d1:0", true, "2026-11-12");
  assert.deepEqual(enqueueStudy("drill", "d1:0", false, "2026-11-12"), []);
});
test("pending events overlay a fresh state without mutating server counts or losing essay weights", () => {
  memory(); const rows = enqueueStudy("written", "essay", true, "2026-11-11", 5, 3);
  const state = { days: [{ date: "2026-11-11", answered: 14, correct: 10 }] };
  assert.deepEqual(applyStudyEvents(state, rows).days, [{ date: "2026-11-11", answered: 19, correct: 13 }]);
  assert.equal(state.days[0].answered, 14);
});
test("drafts are independent per prompt and survive reopening a different course", () => {
  memory(); saveDraft({ spot: spot("one"), answer: "First essay", ready: true });
  saveDraft({ spot: spot("two", "asy"), answer: "Second essay" });
  assert.equal(readDrafts().one.answer, "First essay"); assert.equal(readDrafts().two.answer, "Second essay");
  removeDraft(spot("two", "asy")); assert.equal(readDrafts().one.ready, true); assert.equal(readDrafts().two, undefined);
  const generated = { ...spot("generated"), materialId: undefined };
  assert.notEqual(draftKey(generated), draftKey({ ...generated, facts: "Another prompt" }));
});
test("legacy unfinished drafts migrate once and sign-out clears all new outboxes and drafts", () => {
  memory(); localStorage.setItem("lawstin-written", JSON.stringify({ spot: spot("legacy"), answer: "Kept" }));
  assert.equal(readDrafts().legacy.answer, "Kept"); removeDraft(spot("legacy")); assert.deepEqual(readDrafts(), {});
  saveDraft({ spot: spot("new"), answer: "Private" }); enqueueStudy("card", "one", true, "2026-11-11");
  queueSetting("workspace:notes:clinic", "Private"); localStorage.setItem("lawstin-written-pending", "[]");
  clearCaches(); assert.deepEqual(readDrafts(), {}); assert.deepEqual(readStudyQueue(), []); assert.deepEqual(settingQueue(), {});
  assert.equal(localStorage.getItem("lawstin-written-pending"), null);
});

test("text and course-dot tokens meet 4.5:1 contrast in both themes", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../src/base.css", import.meta.url), "utf8");
  const themes: Record<string, Record<string, string>> = { ":root": {}, ".dark": {} };
  for (const match of css.matchAll(/(:root|\.dark)\s*\{([^{}]*)\}/g)) {
    for (const token of match[2].matchAll(/(--[\w-]+)\s*:\s*(#[a-f\d]{6})\b/gi)) themes[match[1]][token[1]] = token[2];
  }
  const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = (c: number[]) => c.map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((s, x, i) => s + x * [.2126, .7152, .0722][i], 0);
  const contrast = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
  for (const dark of [false, true]) {
    const tokens = { ...themes[":root"], ...(dark ? themes[".dark"] : {}) }, card = rgb(tokens["--card"]);
    for (const name of ["--uh-red-button", "--uh-red-button-hover", "--course-il-dot", "--course-asy-dot", "--course-pr-dot"]) assert(contrast(rgb(tokens[name]), [1, 1, 1]) >= 4.5, `${dark} ${name}`);
    for (const name of ["--faint-foreground", "--success", "--course-asy"]) {
      const color = rgb(tokens[name]), tint = color.map((x, i) => x * .15 + card[i] * .85);
      assert(contrast(color, tint) >= 4.5, `${dark} ${name} on tinted card`);
    }
  }
});
