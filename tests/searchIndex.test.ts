import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchIndex,
  searchIndex,
  normalizeSearch,
  searchSuggestions,
  buildSnippet,
  type SearchIndexSources,
} from "../src/helpers/searchIndex";
import type { QuestionDTO } from "../src/endpoints/state_GET.schema";
import type { StudyMaterial, Flashcard, Hypothetical } from "../src/helpers/studyMaterials";

function mockQuestion(patch: Partial<QuestionDTO> = {}): QuestionDTO {
  return {
    id: "q-1",
    course: "il",
    topic: "Treaties",
    subtopic: "Pacta Sunt Servanda",
    classDay: 1,
    classDate: "2026-10-01",
    source: null,
    batch: "2026-11-10",
    stem: "SECRET_FACT_PATTERN A treaty was entered into between Ardenia and Bolvaria under secret terms.",
    prompt: "SECRET_PROMPT Which treaty rule governs?",
    choices: [
      { id: "A", role: "correct", text: "SECRET_CHOICE_A Pacta sunt servanda", why: "SECRET_WHY" },
      { id: "B", role: "sneaky", text: "SECRET_CHOICE_B Customary rule", why: "SECRET_WHY" },
    ],
    answer: "A",
    rule: "Treaties in force are binding upon the parties and must be performed by them in good faith.",
    authority: "VCLT Article 26",
    ...patch,
  };
}

test("quote and accent folding", () => {
  assert.equal(normalizeSearch("Café"), "cafe");
  assert.equal(normalizeSearch("“pacta sunt servanda”"), '"pacta sunt servanda"');
  assert.equal(normalizeSearch("‘jus cogens’"), "'jus cogens'");
  assert.equal(normalizeSearch("Austin’s test"), "austin's test");

  const items = buildSearchIndex({
    questions: [
      mockQuestion({
        subtopic: "Jus Cogens",
        rule: "A treaty is void if it conflicts with a peremptory norm.",
        authority: "VCLT Art. 53",
      }),
    ],
  });

  // Straight quotes vs curly quotes
  const r1 = searchIndex(items, "“peremptory norm”");
  assert.equal(r1.length, 1);

  // Accents and case
  const r2 = searchIndex(items, "JUS COGENS");
  assert.equal(r2.length, 1);

  // Partial prefix match
  const r3 = searchIndex(items, "peremp");
  assert.equal(r3.length, 1);
});

test("no question stems, prompts, choices, or answers appear in search", () => {
  const q = mockQuestion();
  const items = buildSearchIndex({ questions: [q] });

  // Searching for fact pattern (stem) secret words must yield nothing
  assert.equal(searchIndex(items, "SECRET_FACT_PATTERN").length, 0);
  assert.equal(searchIndex(items, "Ardenia").length, 0);
  assert.equal(searchIndex(items, "SECRET_PROMPT").length, 0);
  assert.equal(searchIndex(items, "SECRET_CHOICE_A").length, 0);

  // Only the rule, authority, topic, and subtopic are searchable
  assert.equal(searchIndex(items, "VCLT").length, 1);
  assert.equal(searchIndex(items, "good faith").length, 1);
  assert.equal(searchIndex(items, "Pacta Sunt Servanda").length, 1);
});

test("hypotheticals include prompt and title only, never facts or sample answer analysis", () => {
  const hypo: Hypothetical = {
    id: "il-hypo-20261026-01",
    course: "il",
    kind: "hypothetical",
    title: "Maritime Boundary Dispute",
    topic: "Law of the Sea",
    subtopic: "Continental Shelf",
    class_date: "2026-10-26",
    class_day: 18,
    batch: "2026-10-26",
    source_files: ["drive-1"],
    source_section: "Section 3",
    sources: [{ file_id: "drive-1", title: "Notes", section: "3", url: "https://docs.google.com/test" }],
    authority: "UNCLOS Article 76",
    verified: { at: "2026-10-26T12:00:00Z", rounds: 1, checker: "Austin", notes: "Verified" },
    facts: "SECRET_HYPO_FACTS Country X and Country Y share an overlapping continental shelf.",
    prompt: "Advise Country X on delimiting its outer continental shelf limits.",
    answer: [
      {
        issue: "SECRET_HYPO_ISSUE Delimitation beyond 200 nautical miles",
        analysis: "SECRET_HYPO_ANALYSIS Apply UNCLOS Article 76 criteria.",
        authority: "UNCLOS Article 76",
      },
    ],
  };

  const items = buildSearchIndex({ materials: [hypo] });

  // Facts and sample answer analysis must NOT match
  assert.equal(searchIndex(items, "SECRET_HYPO_FACTS").length, 0);
  assert.equal(searchIndex(items, "SECRET_HYPO_ANALYSIS").length, 0);
  assert.equal(searchIndex(items, "SECRET_HYPO_ISSUE").length, 0);

  // Title and prompt match
  assert.equal(searchIndex(items, "Maritime Boundary").length, 1);
  assert.equal(searchIndex(items, "delimiting").length, 1);
  assert.equal(searchIndex(items, "UNCLOS").length, 1);
});

test("index ranking: exact phrase and authority matches rank first, then title, then body", () => {
  const items = buildSearchIndex({
    questions: [
      mockQuestion({
        id: "q-body",
        subtopic: "General Principles",
        rule: "A tribunal may look to Model Rule 1.5 when considering attorney fees in arbitration.",
        authority: "Restatement Third",
      }),
      mockQuestion({
        id: "q-title",
        subtopic: "Model Rule 1.5",
        rule: "A lawyer shall not make an agreement for, charge, or collect an unreasonable fee.",
        authority: "Texas Disciplinary Rules",
      }),
      mockQuestion({
        id: "q-auth",
        subtopic: "Reasonable Fees",
        rule: "Factors for reasonable fees include time, labor, novelty, and customary charges.",
        authority: "Model Rule 1.5",
      }),
    ],
  });

  const results = searchIndex(items, "Model Rule 1.5");
  assert.equal(results.length, 3);
  // Authority match ranks first
  assert.equal(results[0].item.id, "rule:q-auth");
  // Title match ranks second
  assert.equal(results[1].item.id, "rule:q-title");
  // Body match ranks third
  assert.equal(results[2].item.id, "rule:q-body");
});

test("every word must match (AND matching across words) and word prefix matching", () => {
  const items = buildSearchIndex({
    questions: [
      mockQuestion({
        id: "q-1",
        subtopic: "State Responsibility",
        rule: "Every internationally wrongful act of a State entails the international responsibility of that State.",
        authority: "ARSIWA Article 1",
      }),
      mockQuestion({
        id: "q-2",
        subtopic: "Diplomatic Protection",
        rule: "A state is entitled to exercise diplomatic protection in respect of an injured national.",
        authority: "ILC Draft Articles",
      }),
    ],
  });

  // Both words match q-1
  const r1 = searchIndex(items, "wrongful State");
  assert.equal(r1.length, 1);
  assert.equal(r1[0].item.id, "rule:q-1");

  // Word prefix match: "internation" matches "internationally" / "international"
  const r2 = searchIndex(items, "internation responsib");
  assert.equal(r2.length, 1);
  assert.equal(r2[0].item.id, "rule:q-1");

  // If one word does not match, result is empty
  const r3 = searchIndex(items, "wrongful diplomatic");
  assert.equal(r3.length, 0);
});

test("snippets contain matched words marked with boundaries", () => {
  const text = "Treaties in force are binding upon the parties and must be performed by them in good faith.";
  const res = buildSnippet(text, ["binding", "parties"], 60);

  assert.ok(res.snippet.includes("binding"));
  assert.ok(res.tokens.some((t) => t.match && t.text.toLowerCase() === "binding"));
  assert.ok(res.tokens.some((t) => t.match && t.text.toLowerCase() === "parties"));
  assert.ok(res.tokens.some((t) => !t.match));
});

test("course chips narrow results", () => {
  const items = buildSearchIndex({
    questions: [
      mockQuestion({ id: "q-il", course: "il", topic: "Custom", rule: "State practice and opinio juris." }),
      mockQuestion({ id: "q-pr", course: "pr", topic: "Competence", rule: "A lawyer shall provide competent representation." }),
    ],
  });

  assert.equal(searchIndex(items, "lawyer", "il").length, 0);
  assert.equal(searchIndex(items, "lawyer", "pr").length, 1);
  assert.equal(searchIndex(items, "lawyer", "all").length, 1);
});

test("search suggestions return closest topics and authorities", () => {
  const items = buildSearchIndex({
    questions: [
      mockQuestion({ topic: "State Immunity", authority: "FSIA Section 1605" }),
      mockQuestion({ topic: "Diplomatic Immunity", authority: "VCDR Article 31" }),
    ],
  });

  const suggestions = searchSuggestions(items, "immun");
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.some((s) => s.includes("Immunity")));
});
