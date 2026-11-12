import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeNotes,
  formatAllNotes,
  assembleTopicData,
  type NoteRow,
} from "../src/helpers/useNotes";
import type { QuestionDTO, ProgressDTO } from "../src/endpoints/state_GET.schema";
import type { SyllabusUnit } from "../src/helpers/studyEngine";
import type { Flowchart, Outline, Hypothetical, Comparison } from "../src/helpers/studyMaterials";

test("notes merge and last-write-wins", () => {
  const localOlder: NoteRow = {
    text: "Older local text",
    inNotes: false,
    at: "2026-11-10T10:00:00.000Z",
  };
  const serverNewer: NoteRow = {
    text: "Newer server text",
    inNotes: true,
    at: "2026-11-10T11:00:00.000Z",
  };

  // Server newer wins over local older
  const res1 = mergeNotes(localOlder, serverNewer);
  assert.equal(res1.text, "Newer server text");
  assert.equal(res1.inNotes, true);

  // Local newer wins over server older
  const localNewer: NoteRow = {
    text: "Newer local text",
    inNotes: true,
    at: "2026-11-10T12:00:00.000Z",
  };
  const res2 = mergeNotes(localNewer, serverNewer);
  assert.equal(res2.text, "Newer local text");
  assert.equal(res2.inNotes, true);

  // Equal timestamps: local wins to protect typed text
  const localSame: NoteRow = {
    text: "Same time local text",
    inNotes: false,
    at: "2026-11-10T11:00:00.000Z",
  };
  const res3 = mergeNotes(localSame, serverNewer);
  assert.equal(res3.text, "Same time local text");

  // Pending unacknowledged write overrides older server ack
  const pending: NoteRow = {
    text: "Pending local edit",
    inNotes: true,
    at: "2026-11-10T13:00:00.000Z",
  };
  const res4 = mergeNotes(localOlder, serverNewer, pending);
  assert.equal(res4.text, "Pending local edit");

  // If local is undefined, server is returned
  assert.deepEqual(mergeNotes(undefined, serverNewer), serverNewer);
  // If server is undefined, local is returned
  assert.deepEqual(mergeNotes(localNewer, undefined), localNewer);
});

test("copy-all formatting formats clean text with unit headings", () => {
  const units = [
    { topic: "Sources of International Law" },
    { topic: "Use of Force & Jus ad Bellum" },
    { topic: "Empty Unit" },
    { topic: "State Immunity" },
  ];
  const notes: Record<string, NoteRow> = {
    "Sources of International Law": {
      text: "- Customary international law: state practice and opinio juris\n- Treaties: Vienna Convention",
      inNotes: true,
      at: "2026-11-10T10:00:00Z",
    },
    "Use of Force & Jus ad Bellum": {
      text: "# Art 2(4)\nGeneral prohibition\n# Art 51\nSelf-defense exception",
      inNotes: true,
      at: "2026-11-10T10:00:00Z",
    },
    "Empty Unit": {
      text: "   ",
      inNotes: false,
      at: "2026-11-10T10:00:00Z",
    },
    "State Immunity": {
      text: "Restrictive theory of immunity for commercial acts (jure gestionis).",
      inNotes: true,
      at: "2026-11-10T10:00:00Z",
    },
  };

  const formatted = formatAllNotes(units, notes);
  const expected = [
    "# Sources of International Law\n\n- Customary international law: state practice and opinio juris\n- Treaties: Vienna Convention",
    "# Use of Force & Jus ad Bellum\n\n# Art 2(4)\nGeneral prohibition\n# Art 51\nSelf-defense exception",
    "# State Immunity\n\nRestrictive theory of immunity for commercial acts (jure gestionis).",
  ].join("\n\n");

  assert.equal(formatted, expected);
  // Empty unit without text is not included as blank section
  assert(!formatted.includes("Empty Unit"));
});

test("topic page data assembly for a unit with also names", () => {
  const unit: SyllabusUnit = {
    topic: "Laws of War",
    dates: ["2026-10-15", "2026-10-17"],
    also: ["Laws of War Part I", "International Humanitarian Law"],
  };

  const makeChoice = (id: string, role: "correct" | "sneaky" | "average" | "bad", text: string) => ({
    id,
    role,
    text,
    why: "why",
  });

  const q1: QuestionDTO = {
    id: "il-20261015-01",
    course: "il",
    topic: "Laws of War",
    subtopic: "Distinction",
    classDay: 10,
    classDate: "2026-10-15",
    batch: "2026-10-15",
    source: null,
    stem: "Scenario 1",
    prompt: "Prompt 1",
    choices: [
      makeChoice("A", "correct", "Correct 1"),
      makeChoice("B", "sneaky", "Sneaky 1"),
      makeChoice("C", "average", "Avg 1"),
      makeChoice("D", "bad", "Bad 1"),
    ],
    answer: "A",
    rule: "The principle of distinction requires parties to distinguish combatants from civilians.",
    authority: "Additional Protocol I, Art. 48",
  };

  const q2: QuestionDTO = {
    id: "il-20261017-02",
    course: "il",
    topic: "Laws of War Part I", // matched through also
    subtopic: "Proportionality",
    classDay: 11,
    classDate: "2026-10-17",
    batch: "2026-10-17",
    source: null,
    stem: "Scenario 2",
    prompt: "Prompt 2",
    choices: [
      makeChoice("A", "correct", "Correct 2"),
      makeChoice("B", "sneaky", "Sneaky 2"),
      makeChoice("C", "average", "Avg 2"),
      makeChoice("D", "bad", "Bad 2"),
    ],
    answer: "A",
    rule: "Proportionality prohibits attacks expected to cause excessive civilian harm.",
    authority: "Additional Protocol I, Art. 51(5)(b)",
  };

  const qOther: QuestionDTO = {
    id: "il-20261020-03",
    course: "il",
    topic: "State Immunity",
    subtopic: "Immunity",
    classDay: 12,
    classDate: "2026-10-20",
    batch: "2026-10-20",
    source: null,
    stem: "Other scenario",
    prompt: "Other prompt",
    choices: [
      makeChoice("A", "correct", "Correct 3"),
      makeChoice("B", "sneaky", "Sneaky 3"),
      makeChoice("C", "average", "Avg 3"),
      makeChoice("D", "bad", "Bad 3"),
    ],
    answer: "A",
    rule: "State immunity rule",
    authority: "FSIA",
  };

  const prog1: ProgressDTO = {
    questionId: q1.id,
    seen: 2,
    correct: 1,
    wrong: 1, // missed!
    box: 1,
    due: "2026-10-20",
    lastChoice: "B",
    lastCorrect: false,
    lastAt: "2026-10-18T12:00:00Z",
    missSneaky: 1,
    missAverage: 0,
    missBad: 0,
    guessed: 0,
    starred: false,
    flagged: false,
  };

  const prog2: ProgressDTO = {
    questionId: q2.id,
    seen: 3,
    correct: 3,
    wrong: 0,
    box: 3,
    due: "2026-11-01",
    lastChoice: "A",
    lastCorrect: true,
    lastAt: "2026-10-19T12:00:00Z",
    missSneaky: 0,
    missAverage: 0,
    missBad: 0,
    guessed: 0,
    starred: false,
    flagged: false,
  };

  const fc: Flowchart = {
    id: "il-flowchart-20261015-01",
    course: "il",
    kind: "flowchart",
    title: "Targeting Flowchart",
    topic: "Laws of War",
    subtopic: "Targeting",
    class_date: "2026-10-15",
    class_day: 10,
    batch: "2026-10-15",
    source_files: ["doc1"],
    source_section: "Sec 1",
    sources: [{ file_id: "doc1", title: "Targeting", section: "1", url: "https://drive.google.com/file/d/1" }],
    authority: "Geneva Conventions",
    verified: { at: "2026-10-16T00:00:00Z", rounds: 1, checker: "Test", notes: "ok" },
    start: "n1",
    nodes: [
      { id: "n1", question: "Is the target a military objective?", authority: "AP I Art 52", branches: [{ label: "Yes", outcome: "Proceed" }, { label: "No", outcome: "Unlawful" }] },
    ],
  };

  const outline: Outline = {
    id: "il-outline-20261017-01",
    course: "il",
    kind: "outline",
    title: "Geneva Law Summary",
    topic: "Laws of War Part I", // matched through also
    subtopic: "Summary",
    class_date: "2026-10-17",
    class_day: 11,
    batch: "2026-10-17",
    source_files: ["doc2"],
    source_section: "Sec 2",
    sources: [{ file_id: "doc2", title: "Summary", section: "2", url: "https://drive.google.com/file/d/2" }],
    authority: "Common Article 3",
    verified: { at: "2026-10-18T00:00:00Z", rounds: 1, checker: "Test", notes: "ok" },
    sections: [
      { heading: "Core protections", text: "Humane treatment is required.", authority: "Common Art. 3" },
    ],
  };

  const assembled = assembleTopicData({
    course: "il",
    unit,
    questions: [q1, q2, qOther],
    progress: [prog1, prog2],
    materials: [fc, outline],
    answers: [],
  });

  // Assembled includes both q1 (Laws of War) and q2 (Laws of War Part I)
  assert.equal(assembled.questions.length, 2);
  assert(assembled.questions.some((q) => q.id === q1.id));
  assert(assembled.questions.some((q) => q.id === q2.id));
  assert(!assembled.questions.some((q) => q.id === qOther.id));

  // Both materials matched
  assert.equal(assembled.materials.length, 2);
  assert.equal(assembled.flowcharts.length, 1);
  assert.equal(assembled.flowcharts[0].id, fc.id);
  assert.equal(assembled.outlines.length, 1);
  assert.equal(assembled.outlines[0].id, outline.id);

  // Rules grouped by subtopic
  assert.equal(assembled.rules.length, 2);
  const distinctionRule = assembled.rules.find((r) => r.subtopic === "Distinction");
  assert(distinctionRule);
  assert.equal(distinctionRule.isMissed, true); // q1 was missed

  const propRule = assembled.rules.find((r) => r.subtopic === "Proportionality");
  assert(propRule);
  assert.equal(propRule.isMissed, false); // q2 was not missed

  // Authorities collected distinctly across questions and materials
  assert(assembled.authorities.includes("Additional Protocol I, Art. 48"));
  assert(assembled.authorities.includes("Additional Protocol I, Art. 51(5)(b)"));
  assert(assembled.authorities.includes("AP I Art 52"));
  assert(assembled.authorities.includes("Common Art. 3"));
  assert(!assembled.authorities.includes("FSIA")); // qOther excluded

  // Missed question prompt
  assert.equal(assembled.missedQuestions.length, 1);
  assert.equal(assembled.missedQuestions[0].q.id, q1.id);

  // Status is shaky because q1 has missSneaky and wrong
  assert.equal(assembled.status, "shaky");
});
