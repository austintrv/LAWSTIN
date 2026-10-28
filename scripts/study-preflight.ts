import fs from "node:fs";
import { dateKey } from "../src/helpers/dateKey";
import type { MaterialLibrary } from "../src/helpers/studyMaterials";

type Coverage = { course: string; topic: string; subtopic: string; latest: string; n: number };
type Topic = { course: string; topic: string; right: number; answered: number; sneaky_misses: number; guessed: number };
type Brief = { captured_at: string; coverage: Coverage[]; topics: Topic[]; half_known: unknown[]; card_progress: Record<string, { seen: number; due: string }>; answers_since_last_study_run: number; flags: unknown[] };
const input = process.argv[2];
if (!input) throw new Error("Pass a private JSON task brief from the read-only SQL in the study skill. Do not open Drive sources before preflight.");
const brief = JSON.parse(fs.readFileSync(input, "utf8")) as Brief;
const library = JSON.parse(fs.readFileSync("src/data/study-materials.json", "utf8")) as MaterialLibrary;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
if (!brief.captured_at || !Number.isFinite(Date.parse(brief.captured_at)) || Date.now() - Date.parse(brief.captured_at) > 24 * 3600_000
  || Date.parse(brief.captured_at) > Date.now() + 300_000 || !Array.isArray(brief.coverage) || !Array.isArray(brief.topics)
  || !Number.isFinite(brief.answers_since_last_study_run) || !Array.isArray(brief.flags) || !Array.isArray(brief.half_known)
  || !brief.card_progress || typeof brief.card_progress !== "object") throw new Error("A current complete question-history brief is required. No Drive reads or writes.");
const courses = ["il", "asy", "pr"];
const weak = brief.topics.filter(t => courses.includes(t.course) && ((t.answered >= 2 && t.right / t.answered < .7) || t.sneaky_misses > 0 || t.guessed > 0));
const latest = library.runs[0]?.run_date ?? "1970-01-01";
const covered = new Set(library.materials.map(m => `${m.course}|${m.topic}|${m.subtopic}|${m.class_date}`));
const gaps = brief.coverage.filter(c => courses.includes(c.course) && dateKey.isValid(c.latest) && c.latest <= today
  && !covered.has(`${c.course}|${c.topic}|${c.subtopic}|${c.latest}`));
const targets = courses.map(course => {
  const backlog = library.materials.filter(m => m.course === course && m.kind === "flashcard" && !(brief.card_progress[m.id]?.seen)).length;
  const hasWeak = weak.some(w => w.course === course);
  const hasGap = gaps.some(g => g.course === course);
  const hasNewAnswers = brief.answers_since_last_study_run > 0;
  return { course, target: !hasGap && !(hasWeak && hasNewAnswers) ? 0 : backlog >= 35 ? hasWeak && hasNewAnswers ? 1 : 0 : backlog >= 20 ? 2 : 8 };
});
const total = targets.reduce((n, t) => n + t.target, 0);
console.log(JSON.stringify({ should_run: total > 0, today, last_study_run: latest, targets, total_cap: brief.answers_since_last_study_run === 0 ? Math.min(6, total) : total,
  gaps, weak_topics: weak, half_known: brief.half_known, flags: brief.flags, reason: total ? "Verified coverage gaps or new evidence of weak recall" : "No uncovered classes or new weak-topic evidence; write nothing and stop" }, null, 2));
