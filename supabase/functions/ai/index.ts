// Lawstin AI tutor: "Ask about this", "Harder version", Written practice (issue-spotter + grading).
// Uses the Gemini API with the GEMINI_API_KEY secret. Only Austin's signed-in account can call it.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { QuestionDTO } from "../_shared/types.ts";

const OWNER = "trevinoaustin10@gmail.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

class AiError extends Error {
  constructor(message: string, public code?: string, public status = 400) { super(message); }
}

const COURSE_NAME = { il: "International Law", asy: "Asylum Law", pr: "Professional Responsibility" } as const;
type Course = keyof typeof COURSE_NAME;
const ROLE = { correct: "correct answer", sneaky: "sneaky distractor", average: "average distractor", bad: "really bad answer" } as const;

const VOICE = `You are a law tutor for Austin, a 2L at the University of Houston Law Center. Write in plain, literal language. No metaphors, no figures of speech, no intensifiers ("really", "genuinely", "actually"), no "not X but Y" framing, no pep talk. Use curly quotes and apostrophes (’ “ ”). Use plain text only: no Markdown, no asterisks, no headers.`;
const GROUNDING = `Ground every statement of law in the material provided. When something goes beyond that material, say so in one short clause and give the general rule cautiously. Never invent case names, rule numbers, statute sections, or quotations; cite an authority only if it appears in the material.`;

// ---------- Gemini ----------
let cachedModels: { main: string; lite: string | null } | null = null;
let cachedKey: string | null = null;

// The key lives in the server-only server_secrets table (row "gemini_api_key"); an Edge Function secret also works.
async function geminiKey(): Promise<string | null> {
  const env = Deno.env.get("GEMINI_API_KEY");
  if (env) return env;
  if (cachedKey) return cachedKey;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data } = await db.from("server_secrets").select("value").eq("key", "gemini_api_key").maybeSingle();
  cachedKey = (data?.value as string | undefined)?.trim() || null;
  return cachedKey;
}

// Picks the newest Flash model for answers, and the newest Flash-Lite as a fallback when Flash hits its daily limit.
async function pickModels(key: string): Promise<{ main: string; lite: string | null }> {
  const fixed = Deno.env.get("GEMINI_MODEL");
  if (fixed) return { main: fixed, lite: Deno.env.get("GEMINI_FALLBACK_MODEL") ?? null };
  if (cachedModels) return cachedModels;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${key}`);
  if (!res.ok) throw new AiError("The tutor’s API key was rejected", "BAD_KEY", 503);
  const { models = [] } = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const names = models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /^gemini-[\d.]+-flash/.test(n) && !/(image|tts|audio|live|thinking|exp|preview|embedding|8b|transcribe|translate)/.test(n));
  const version = (n: string) => Number((n.match(/gemini-(\d+(?:\.\d+)?)/) ?? [])[1] ?? 0);
  const byNewest = (a: string, b: string) => version(b) - version(a) || a.length - b.length;
  const flash = names.filter((n) => !/lite/.test(n)).sort(byNewest);
  const lite = names.filter((n) => /lite/.test(n)).sort(byNewest);
  cachedModels = { main: flash[0] ?? lite[0] ?? "gemini-flash-latest", lite: lite[0] ?? null };
  return cachedModels;
}

type Msg = { role: "user" | "assistant"; content: string };

async function gemini(system: string, messages: Msg[], schema?: Record<string, unknown>): Promise<string> {
  const key = await geminiKey();
  if (!key) throw new AiError("The tutor isn’t set up yet", "NO_KEY", 503);
  const { main, lite } = await pickModels(key);
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: schema ? { responseMimeType: "application/json", responseJsonSchema: schema, temperature: 0.7 } : { temperature: 0.5 },
  };
  const call = (model: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let res = await call(main);
  if (res.status === 429 && lite && lite !== main) res = await call(lite);
  if (res.status === 429) throw new AiError("The tutor has hit its daily limit. Try again tomorrow.", "RATE_LIMIT", 503);
  if (res.status === 400 || res.status === 403) {
    const t = await res.text();
    console.error("gemini error", res.status, t.slice(0, 500));
    if (/API_KEY|api key/i.test(t)) { cachedKey = null; throw new AiError("The tutor’s API key was rejected", "BAD_KEY", 503); }
    throw new AiError("The tutor isn’t available right now", "UPSTREAM", 503);
  }
  if (!res.ok) {
    const t = await res.text();
    console.error("gemini error", res.status, t.slice(0, 500));
    throw new AiError("The tutor isn’t available right now", "UPSTREAM", 503);
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const text = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new AiError("The tutor returned an empty answer. Try again.");
  return text;
}

async function geminiJson<T>(system: string, prompt: string, schema: Record<string, unknown>): Promise<T> {
  const text = await gemini(system, [{ role: "user", content: prompt }], schema);
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
  } catch {
    throw new AiError("The tutor returned something unreadable. Try again.");
  }
}

// ---------- Prompts ----------
type QIn = Pick<QuestionDTO, "id" | "course" | "topic" | "subtopic" | "stem" | "prompt" | "choices" | "answer" | "rule" | "authority">;

function describeQuestion(q: QIn, picked: string | null) {
  return [
    `Course: ${COURSE_NAME[q.course]}`,
    `Topic: ${q.topic}${q.subtopic ? ` / ${q.subtopic}` : ""}`,
    "",
    "Fact pattern:",
    q.stem,
    "",
    `Question: ${q.prompt}`,
    "",
    ...q.choices.map((c) => `${c.id}. ${c.text}\n   [${ROLE[c.role]}] ${c.why}`),
    "",
    `Correct answer: ${q.answer}`,
    q.rule ? `Rule: ${q.rule}` : "",
    q.authority ? `Authority: ${q.authority}` : "",
    picked ? `Austin picked: ${picked}${picked === q.answer ? " (correct)" : " (wrong)"}` : "",
  ].filter((l) => l !== "").join("\n");
}

const choiceSchema = {
  type: "object",
  required: ["id", "role", "text", "why"],
  properties: {
    id: { type: "string", enum: ["A", "B", "C", "D"] },
    role: { type: "string", enum: ["correct", "sneaky", "average", "bad"] },
    text: { type: "string" },
    why: { type: "string" },
  },
};
const harderSchema = { type: "object", required: ["stem", "prompt", "choices", "rule"], properties: { stem: { type: "string" }, prompt: { type: "string" }, rule: { type: "string" }, choices: { type: "array", minItems: 4, maxItems: 4, items: choiceSchema } } };
const spotterSchema = { type: "object", required: ["facts", "call", "issues"], properties: { facts: { type: "string" }, call: { type: "string" }, issues: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" } } } };
const gradeSchema = {
  type: "object",
  required: ["score", "summary", "spotted", "missed", "errors", "modelAnswer"],
  properties: {
    score: { type: "integer", minimum: 0, maximum: 10 },
    summary: { type: "string" },
    spotted: { type: "array", items: { type: "object", required: ["issue", "comment"], properties: { issue: { type: "string" }, comment: { type: "string" } } } },
    missed: { type: "array", items: { type: "object", required: ["issue", "rule"], properties: { issue: { type: "string" }, rule: { type: "string" } } } },
    errors: { type: "array", items: { type: "string" } },
    modelAnswer: { type: "string" },
  },
};

// deno-lint-ignore no-explicit-any
type DB = SupabaseClient<any, any, any>;

async function courseRules(db: DB, course: Course) {
  const { data: qs, error } = await db.from("questions").select("id, topic, subtopic, rule, authority").eq("course", course).eq("retired", false).not("rule", "is", null);
  if (error) throw new Error(error.message);
  const { data: ps } = await db.from("progress").select("question_id, correct, wrong");
  const pm = new Map((ps ?? []).map((p) => [p.question_id as string, p]));
  const topics = new Map<string, { c: number; w: number; rules: Map<string, string> }>();
  for (const r of qs ?? []) {
    const t = topics.get(r.topic) ?? { c: 0, w: 0, rules: new Map<string, string>() };
    const p = pm.get(r.id);
    t.c += (p?.correct as number) ?? 0;
    t.w += (p?.wrong as number) ?? 0;
    const key = r.subtopic ?? r.rule;
    if (!t.rules.has(key)) t.rules.set(key, `${r.subtopic ? `${r.subtopic}: ` : ""}${r.rule}${r.authority ? ` (${r.authority})` : ""}`);
    topics.set(r.topic, t);
  }
  return topics;
}

function validQuestion(q: unknown): q is QIn {
  const x = q as QIn;
  return !!x && typeof x.stem === "string" && typeof x.prompt === "string" && Array.isArray(x.choices) && x.choices.length === 4 && ["il", "asy", "pr"].includes(x.course);
}
const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: who } = await db.auth.getUser(token);
    if (who.user?.email !== OWNER) return json({ error: "Unauthorized" }, 401);

    const input = (await req.json()) as Record<string, unknown>;
    const action = input.action;

    if (action === "ask") {
      if (!validQuestion(input.question)) throw new AiError("Bad request");
      const msgs = (Array.isArray(input.messages) ? input.messages : []).slice(-20).map((m: Msg) => ({ role: m.role === "assistant" ? "assistant" : "user", content: clip(m.content, 4000) })) as Msg[];
      if (!msgs.length) throw new AiError("Ask a question first");
      const picked = typeof input.picked === "string" ? input.picked : null;
      const system = `${VOICE}\n${GROUNDING}\nAustin is reviewing the multiple-choice question below and is asking follow-up questions. Answer the question he asks directly in the first sentence, then explain. Keep answers short: one to four short paragraphs, or a short list when listing elements.\n\n${describeQuestion(input.question, picked)}`;
      return json({ action: "ask", reply: await gemini(system, msgs) });
    }

    if (action === "harder") {
      if (!validQuestion(input.question)) throw new AiError("Bad request");
      const q = input.question;
      const target = "ABCD"[Math.floor(Math.random() * 4)];
      const system = `${VOICE}\n${GROUNDING}\nYou write law school multiple-choice questions in the style of a final exam.`;
      const prompt = `Write ONE new multiple-choice question that tests the same rule as the question below at a harder level.

Make it harder by: subtler facts that require applying the rule's elements or exceptions carefully, a sneaky distractor that states a plausible but wrong reading of the rule, and choices of similar length. Use new names and new facts; do not reuse the original fact pattern.

Requirements:
- Four choices with ids A, B, C, D. The correct choice must be ${target}. Exactly one choice of each role: correct, sneaky, average, bad.
- "why" for each choice explains in one to three sentences why it is right or wrong under the rule.
- "rule" restates the governing rule in one or two sentences, consistent with the original rule.
- The stem is a fact pattern of 90 to 180 words. "prompt" is the call of the question.
- Use only law contained in the original question material.

Original question:
${describeQuestion(q, null)}`;
      const raw = await geminiJson<{ stem: string; prompt: string; rule: string; choices: QuestionDTO["choices"] }>(system, prompt, harderSchema);
      const choices = Array.isArray(raw.choices) ? [...raw.choices].sort((a, b) => a.id.localeCompare(b.id)) : [];
      const roles = new Set(choices.map((c) => c.role));
      const ids = new Set(choices.map((c) => c.id));
      const correct = choices.filter((c) => c.role === "correct");
      if (choices.length !== 4 || roles.size !== 4 || ids.size !== 4 || correct.length !== 1 || !raw.stem || raw.stem.length < 40) {
        throw new AiError("The new question came back malformed. Try again.");
      }
      const question: QuestionDTO = {
        id: `ai-${crypto.randomUUID().slice(0, 10)}`,
        course: q.course, topic: q.topic, subtopic: q.subtopic,
        classDay: null, classDate: null, source: "AI", batch: null,
        stem: raw.stem, prompt: raw.prompt, choices, answer: correct[0].id,
        rule: raw.rule || q.rule, authority: q.authority,
      };
      return json({ action: "harder", question });
    }

    if (action === "spotter") {
      const course = input.course as Course;
      if (!COURSE_NAME[course]) throw new AiError("Bad request");
      const topics = await courseRules(db, course);
      if (!topics.size) throw new AiError("No rules in this course yet");
      const list = [...topics.entries()].map(([topic, t]) => {
        const n = t.c + t.w;
        return { topic, t, weight: (n ? 1.4 - t.c / n : 1.2) + Math.random() * 0.6 };
      }).sort((a, b) => b.weight - a.weight);
      const main = list[0];
      const others = list.slice(1, 4);
      const material = [
        `Main topic: ${main.topic}`,
        ...[...main.t.rules.values()].slice(0, 12).map((r) => `- ${r}`),
        ...others.flatMap((o) => [`Other topic: ${o.topic}`, ...[...o.t.rules.values()].slice(0, 4).map((r) => `- ${r}`)]),
      ].join("\n");
      const system = `${VOICE}\n${GROUNDING}\nYou write short issue-spotter essay prompts for a law school ${COURSE_NAME[course]} course.`;
      const prompt = `Write a short issue-spotter for Austin built from the rules below.

- "facts": a fact pattern of 150 to 260 words with new names, in paragraphs separated by a blank line. Center it on the main topic; you may add one issue from another topic listed. Plant two to four issues a strong answer should spot, including at least one close call where the facts cut both ways.
- "call": one sentence, e.g. “Discuss the issues raised.” or a narrower call that fits.
- "issues": the issues a strong answer spots, each stated as “Issue — governing rule — the facts that matter”.

Rules:
${material}`;
      const sp = await geminiJson<{ facts: string; call: string; issues: string[] }>(system, prompt, spotterSchema);
      return json({ action: "spotter", spotter: { course, topic: main.topic, facts: sp.facts, call: sp.call, issues: (sp.issues ?? []).slice(0, 6) } });
    }

    if (action === "grade") {
      const course = input.course as Course;
      if (!COURSE_NAME[course]) throw new AiError("Bad request");
      const answer = clip(input.answer, 12000).trim();
      if (!answer) throw new AiError("Write an answer first");
      const topics = await courseRules(db, course);
      const t = topics.get(String(input.topic));
      const material = t ? [...t.rules.values()].slice(0, 14).map((r) => `- ${r}`).join("\n") : "(no stored rules for this topic)";
      const issues = (Array.isArray(input.issues) ? input.issues : []).slice(0, 12).map((i) => clip(i, 600));
      const system = `${VOICE}\n${GROUNDING}\nYou grade short law school essay answers fairly and specifically, the way a careful professor would. Credit correct analysis even when worded differently from the rubric. Quote or paraphrase Austin’s own words when commenting.`;
      const prompt = `Grade Austin’s answer to this issue-spotter.

Fact pattern:
${clip(input.facts, 8000)}

Call: ${clip(input.call, 1000)}

Rubric (issues a strong answer spots):
${issues.map((i) => `- ${i}`).join("\n")}

Rules for this topic:
${material}

Austin’s answer:
${answer}

Return:
- "score": 0 to 10 for issue spotting, rule statements, and application to the facts.
- "summary": two or three sentences on how the answer did overall.
- "spotted": each rubric issue he addressed, with a one- or two-sentence comment on the quality of his rule statement and application.
- "missed": each rubric issue he did not address, with the governing rule.
- "errors": misstatements of law in his answer (empty if none).
- "modelAnswer": a model answer of 150 to 250 words in IRAC paragraphs separated by blank lines.`;
      const g = await geminiJson<{ score: number; summary: string; spotted: { issue: string; comment: string }[]; missed: { issue: string; rule: string }[]; errors: string[]; modelAnswer: string }>(system, prompt, gradeSchema);
      return json({ action: "grade", grade: { score: Math.max(0, Math.min(10, Math.round(Number(g.score) || 0))), summary: g.summary ?? "", spotted: g.spotted ?? [], missed: g.missed ?? [], errors: g.errors ?? [], modelAnswer: g.modelAnswer ?? "" } });
    }

    throw new AiError("Unknown action");
  } catch (e) {
    const err = e as AiError;
    if (!(e instanceof AiError)) console.error("ai failed", e);
    return json({ error: err.message || "Something went wrong", code: err.code }, err.status ?? 400);
  }
});
