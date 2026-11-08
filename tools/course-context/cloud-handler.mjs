import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { COURSES } from "./courses.mjs";
import { CloudContextStore, dbResult } from "./cloud-context.mjs";
import { checkedBridgeUrl, invokeGoogleBridge, googleBridgeSource } from "./google-bridge.mjs";

const readonly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const course = z.enum(COURSES.map(course => course.id));
const studyCourse = z.enum(["il", "asy", "pr"]);
const actor = z.enum(["ChatGPT", "Claude", "Codex", "Claude Code", "ChatGPT Desktop", "Claude Desktop"]);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const toolResult = action => async args => {
  try { return { content: [{ type: "text", text: JSON.stringify(await action(args), null, 2) }] }; }
  catch (error) { return { isError: true, content: [{ type: "text", text: error.message || "LAWSTIN could not complete this request." }] }; }
};

export function registerCloudTools(server, { client, context, connectionStatus }) {
  const rpc = async (name, args) => dbResult(client.rpc(name, args));
  server.registerTool("get_lawstin_connection_status", { description: "Check whether the saved-question quiz and the five-course Drive connection are ready. Work projects are excluded.", inputSchema: {}, annotations: readonly }, toolResult(connectionStatus));
  server.registerTool("list_courses", { description: "List the five school courses. Saved multiple-choice and voice quizzes cover International Law, Asylum Law, and Professional Responsibility.", inputSchema: {}, annotations: readonly }, toolResult(() => context.list()));
  server.registerTool("read_course_context", { description: "Read this course's actual shared Drive Markdown files and record private cloud version history. Returns the revision needed to save a handoff. If Drive setup is pending, report it; do not invent context.", inputSchema: { course }, annotations: readonly }, toolResult(args => context.read(args.course)));
  server.registerTool("write_course_handoff", { description: "Replace only Current work in the existing Drive AI-MEMORY.md. Read first; use its revision and merge newer work if a stale edit is refused. Include relevant goal, completed work, next steps, blockers, and verification.", inputSchema: { course, expected_revision: revision, current_work: z.string().trim().min(1).max(16000), actor }, annotations: write }, toolResult(args => context.writeHandoff(args.course, args.expected_revision, args.current_work, args.actor)));
  server.registerTool("record_course_fact", { description: "Add one durable current fact to this course's existing memory Log, dated in America/Chicago. Read first and provide the revision. Keep private facts within their authorized course context.", inputSchema: { course, expected_revision: revision, fact: z.string().trim().min(1).max(2000), actor }, annotations: write }, toolResult(args => context.recordFact(args.course, args.expected_revision, args.fact, args.actor)));
  server.registerTool("checkpoint_course_context", { description: "Checkpoint the latest Drive context and list its private cloud version history. Mac Git history is separate. No course memory is stored in the public repository.", inputSchema: { course, limit: z.number().int().min(1).max(30).default(10) }, annotations: write }, toolResult(args => context.history(args.course, args.limit)));
  server.registerTool("read_course_memory_version", { description: "Read a previous AI-MEMORY.md from this course's private cloud history. Use a version UUID returned by checkpoint_course_context. Does not restore or overwrite anything.", inputSchema: { course, version: z.string().uuid() }, annotations: readonly }, toolResult(args => context.readVersion(args.course, args.version)));
  server.registerTool("search_course_context", { description: "Literal search in one course's current shared Drive context only. Does not search course source documents, other courses, student submissions, or work.", inputSchema: { course, query: z.string().trim().min(1).max(200) }, annotations: readonly }, toolResult(args => context.search(args.course, args.query)));

  server.registerTool("start_lawstin_quiz", {
    description: "Start a quiz using LAWSTIN's saved questions and return its first question. Create a unique request_key for this quiz and reuse it on retries. Read the question and choices A–D, then wait for the user's answer. Never invent questions or reveal an answer before submission. Mixed mode prioritizes due, then unseen, then other saved questions.",
    inputSchema: { request_key: z.string().min(1).max(120), course: studyCourse.optional(), mode: z.enum(["mixed", "due", "new"]).default("mixed") }, annotations: { ...write, idempotentHint: true },
  }, toolResult(args => rpc("start_chat_quiz", { p_request_key: args.request_key, p_course: args.course || null, p_mode: args.mode })));
  server.registerTool("next_lawstin_question", {
    description: "Get the next saved question in this quiz. An unanswered question is returned again. To explicitly skip it, supply its attempt ID as skip_attempt_id. Repeating, skipping, asking for clarification, and silence never count as answers.",
    inputSchema: { session_id: z.string().uuid(), skip_attempt_id: z.string().uuid().optional() }, annotations: { ...write, idempotentHint: true },
  }, toolResult(args => rpc("next_chat_quiz_question", { p_session_id: args.session_id, p_skip_attempt_id: args.skip_attempt_id || null })));
  server.registerTool("answer_lawstin_question", {
    description: "Save one clear user answer to a question returned by LAWSTIN. Submit only after the user chooses A, B, C, or D; clarify ambiguous speech before calling. Use the returned attempt_id. Mark guessed only when the user says it was a guess. The existing LAWSTIN answer/review rules update progress and streak totals. Retries for the same attempt and answer count once. Only saved:true confirms recording; then give the returned explanation.",
    inputSchema: { attempt_id: z.string().uuid(), choice: z.enum(["A", "B", "C", "D"]), guessed: z.boolean().default(false) }, annotations: { ...write, idempotentHint: true },
  }, toolResult(args => rpc("answer_chat_quiz", { p_attempt_id: args.attempt_id, p_choice: args.choice, p_guessed: args.guessed })));
  server.registerTool("end_lawstin_quiz", {
    description: "End a quiz and return its saved score. Any unanswered question is left uncounted. Use when the user asks to stop; saved answers already remain in LAWSTIN.",
    inputSchema: { session_id: z.string().uuid() }, annotations: { ...write, idempotentHint: true },
  }, toolResult(args => rpc("end_chat_quiz", { p_session_id: args.session_id })));

  // Voice questions: short open-ended prompts with a stored answer key. The assistant
  // judges the spoken answer against the key; LAWSTIN records the verdict.
  server.registerTool("start_lawstin_voice_quiz", {
    description: "Start a spoken quiz from LAWSTIN's short-answer voice questions (no answer choices). Use this instead of start_lawstin_quiz in voice mode or whenever Austin asks for short, spoken, or open-ended questions. Create a unique request_key and reuse it on retries. Optional topic narrows to a topic, doctrine, or case name. Returns the first question plus answer_key_private: ask only question.prompt aloud, keep the key to yourself until he answers.",
    inputSchema: { request_key: z.string().min(1).max(120), course: studyCourse.optional(), topic: z.string().trim().min(1).max(120).optional(), mode: z.enum(["mixed", "due", "new"]).default("mixed") }, annotations: { ...write, idempotentHint: true },
  }, toolResult(args => rpc("start_voice_quiz", { p_request_key: args.request_key, p_course: args.course || null, p_mode: args.mode, p_topic: args.topic || null })));
  server.registerTool("next_lawstin_voice_question", {
    description: "Get the next voice question in this session, with its private answer key (model answer, key points, partial-credit line, likely mistakes, and a follow-up bank of rule, cases, and notes). Ask only the prompt; never read or hint at the key before Austin answers. An ungraded question is returned again; to skip it, pass its attempt ID as skip_attempt_id.",
    inputSchema: { session_id: z.string().uuid(), skip_attempt_id: z.string().uuid().optional() }, annotations: { ...write, idempotentHint: true },
  }, toolResult(args => rpc("next_voice_quiz_question", { p_session_id: args.session_id, p_skip_attempt_id: args.skip_attempt_id || null })));
  server.registerTool("grade_lawstin_voice_answer", {
    description: "Save your verdict on Austin's spoken answer to a voice question. Judge meaning, not wording: correct = every key point is there in substance; partial = some key points or the right conclusion without the reason; missed = wrong conclusion, a listed wrong turn, or no real answer. Repeats, clarifying questions, and silence are not answers. heard = a one-sentence summary of what he said. Set guessed only if he says he guessed. Only saved:true confirms recording; then tell him the verdict, give the model answer in a sentence or two, and answer any follow-up from the key's context.",
    inputSchema: { attempt_id: z.string().uuid(), verdict: z.enum(["correct", "partial", "missed"]), heard: z.string().trim().max(1500).optional(), guessed: z.boolean().default(false) }, annotations: { ...write, idempotentHint: true },
  }, toolResult(args => rpc("answer_voice_quiz", { p_attempt_id: args.attempt_id, p_verdict: args.verdict, p_heard: args.heard || null, p_guessed: args.guessed })));
  server.registerTool("end_lawstin_voice_quiz", {
    description: "End a voice quiz and return its saved totals (correct, partial, missed) and the topics to review. Use when Austin says to stop. An ungraded question is left uncounted.",
    inputSchema: { session_id: z.string().uuid() }, annotations: { ...write, idempotentHint: true },
  }, toolResult(args => rpc("end_voice_quiz", { p_session_id: args.session_id })));
  server.registerTool("get_lawstin_topic_notes", {
    description: "For a follow-up the current answer key does not cover: return LAWSTIN's verified study notes, saved-question rules, and voice answer keys for one topic, doctrine, or case name in a course. Reads LAWSTIN's database only (no Drive search). If nothing is returned, say so rather than guess.",
    inputSchema: { course: studyCourse, topic: z.string().trim().min(1).max(120) }, annotations: readonly,
  }, toolResult(args => rpc("voice_topic_notes", { p_course: args.course, p_topic: args.topic })));
}

export function createCloudHandler({ supabaseUrl, publicUrl, setupUrl, authenticate, adminClient, fetcher = fetch }) {
  const allowedOrigins = new Set([new URL(setupUrl).origin, "https://chatgpt.com", "https://claude.ai", "http://localhost:5173", "http://127.0.0.1:5173"]);
  const metadataUrl = `${publicUrl}/.well-known/oauth-protected-resource`;
  const headersFor = request => {
    const origin = request.headers.get("Origin");
    return { "Cache-Control": "private, no-store", ...(origin && allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}), "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info, mcp-protocol-version, mcp-session-id", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Expose-Headers": "WWW-Authenticate, mcp-session-id" };
  };
  const json = (request, value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...headersFor(request), "Content-Type": "application/json", ...extra } });
  const limitedJson = async request => {
    if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) throw new Error("Send a JSON request.");
    if (Number(request.headers.get("Content-Length") || 0) > 200000) throw new Error("Request is too large.");
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 200000) throw new Error("Request is too large.");
    return JSON.parse(text);
  };
  return async request => {
    const path = new URL(request.url).pathname.replace(/^.*\/course-cloud(?=\/|$)/, "") || "/";
    const origin = request.headers.get("Origin");
    if (origin && !allowedOrigins.has(origin)) return json(request, { error: "Origin is not allowed." }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headersFor(request) });
    if (request.method === "GET" && path === "/health") return json(request, { service: "LAWSTIN cloud", authentication: "required", school_courses: 5 });
    if (request.method === "GET" && path.startsWith("/.well-known/oauth-protected-resource")) return json(request, { resource: `${publicUrl}/mcp`, authorization_servers: [`${supabaseUrl}/auth/v1`], scopes_supported: ["email", "profile"], bearer_methods_supported: ["header"], resource_name: "LAWSTIN" });
    const auth = await authenticate(request).catch(() => null);
    if (!auth) return json(request, { error: "Sign in to LAWSTIN to connect this app." }, 401, { "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}"` });
    const { client, user } = auth;
    const loadBridge = async () => {
      const config = await dbResult(client.from("course_cloud_config").select("bridge_url").eq("owner_id", user.id).maybeSingle());
      if (!config?.bridge_url) throw new Error(`The cloud Drive connection needs its one-time setup at ${setupUrl}. Saved-question quizzes are available separately.`);
      const secret = await dbResult(adminClient.from("server_secrets").select("value").eq("key", "course_cloud_bridge_key").single());
      return { url: checkedBridgeUrl(config.bridge_url), key: secret.value };
    };
    const bridge = async payload => invokeGoogleBridge({ ...await loadBridge(), payload, fetcher });
    const context = new CloudContextStore({ client, bridge, ownerId: user.id });
    const connectionStatus = async () => {
      const config = await dbResult(client.from("course_cloud_config").select("bridge_url").eq("owner_id", user.id).maybeSingle());
      const sources = await dbResult(client.from("course_context_sources").select("course,name").eq("owner_id", user.id));
      const plugin = await dbResult(adminClient.from("server_secrets").select("value").eq("key", "course_cloud_plugin_url").maybeSingle());
      let oauthReady = false;
      try {
        const response = await fetcher(`${supabaseUrl}/.well-known/oauth-authorization-server/auth/v1`, { signal: AbortSignal.timeout(8000) });
        const metadata = response.ok ? await response.json() : null;
        oauthReady = !!metadata?.authorization_endpoint && !!metadata?.registration_endpoint;
      } catch { /* Setup status reports this separately from the working owner session. */ }
      return { quiz_ready: true, drive_configured: !!config?.bridge_url, oauth_discovery_ready: oauthReady, chatgpt_plugin_url: plugin?.value || null, courses: sources.map(({ course, name }) => ({ id: course, name })), setup_url: setupUrl, mcp_url: `${publicUrl}/mcp` };
    };
    try {
      if (path.startsWith("/setup/")) {
        // Secret-bearing setup source is only returned after an owner explicitly clicks on the first-party setup page.
        if (origin !== new URL(setupUrl).origin && origin !== "http://localhost:5173" && origin !== "http://127.0.0.1:5173") return json(request, { error: "Open Connected apps in LAWSTIN to set up Drive." }, 403);
        if (path === "/setup/status" && request.method === "GET") return json(request, await connectionStatus());
        if (path === "/setup/script" && request.method === "POST") {
          const input = await limitedJson(request);
          if (input.action !== "generate") return json(request, { error: "Choose Copy setup code to continue." }, 400);
          const sources = await dbResult(client.from("course_context_sources").select("course,name,folder_id").eq("owner_id", user.id));
          const secret = await dbResult(adminClient.from("server_secrets").select("value").eq("key", "course_cloud_bridge_key").single());
          return json(request, { source: googleBridgeSource(secret.value, sources) });
        }
        if (path === "/setup/bridge" && request.method === "POST") {
          const input = await limitedJson(request), url = checkedBridgeUrl(input.url);
          const secret = await dbResult(adminClient.from("server_secrets").select("value").eq("key", "course_cloud_bridge_key").single());
          const health = await invokeGoogleBridge({ url, key: secret.value, payload: { action: "health" }, fetcher });
          if (!Array.isArray(health.courses) || health.courses.length !== 5 || COURSES.some(course => !health.courses.includes(course.id))) throw new Error("The Google deployment does not contain all five expected school courses.");
          await dbResult(adminClient.from("course_cloud_config").upsert({ owner_id: user.id, bridge_url: url, updated_at: new Date().toISOString() }));
          return json(request, { saved: true, drive_configured: true });
        }
        return json(request, { error: "Setup action not found." }, 404);
      }
      if (path !== "/mcp") return json(request, { error: "Not found." }, 404);
      if (request.method !== "POST") return json(request, { error: "Use MCP Streamable HTTP POST." }, 405, { Allow: "POST" });
      const body = await limitedJson(request);
      // Let the SDK negotiate the revisions it actually implements. A fabricated
      // modern discovery response prevents clients from falling back to initialize.
      const server = new McpServer({ name: "lawstin-cloud", version: "2.1.0" }, { instructions: "LAWSTIN's cloud connector serves five existing Drive course handoffs, saved multiple-choice quizzes, and short-answer voice quizzes. Work is excluded. In voice mode, or when Austin asks for short or spoken questions, use the voice quiz tools: ask only the prompt, judge his spoken answer by meaning against the private answer key, save the verdict, give a brief model answer, and answer follow-ups from the key's context before reaching for get_lawstin_topic_notes. For a multiple-choice quiz, present one returned question, wait for a clear answer, then save it and use the returned explanation. Never invent questions, assume an unheard answer, reveal an answer key before he answers, or claim progress saved without saved:true. Skips/repeats do not count. Direct Drive setup may be pending independently of quizzes. Private cloud history and Mac Git history are separate." });
      registerCloudTools(server, { client, context, connectionStatus });
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 200000, keepAliveMs: 0 });
      await server.connect(transport);
      const response = await transport.handleRequest(request, { parsedBody: body });
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(headersFor(request))) headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    } catch (error) { return json(request, { error: error.message || "LAWSTIN could not complete the request." }, 400); }
  };
}
