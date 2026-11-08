import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import http from "node:http";
import crypto from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createCloudHandler } from "./cloud-handler.mjs";
import { checkedFiles, CloudContextStore, sha256 } from "./cloud-context.mjs";
import { checkedBridgeUrl, invokeGoogleBridge, googleBridgeSource } from "./google-bridge.mjs";
import { COURSES } from "./courses.mjs";

const KEY = "a".repeat(64), GOOGLE = "https://script.google.com/macros/s/" + "b".repeat(30) + "/exec";
const MEMORY = "# Sample\n\n## Current work\n- Existing task.\n\n## Log\n- Existing fact.\n";
const OWNER = "11111111-1111-4111-8111-111111111111";

function googleFixture() {
  const sources = COURSES.map(course => ({ course: course.id, name: course.name, folder_id: `folder_${course.id}_123456789` }));
  const memories = Object.fromEntries(sources.map(source => [source.folder_id, { "AI-MEMORY.md": MEMORY, "AGENTS.md": "Course instructions." }]));
  const cache = new Map(); let writes = 0, reads = 0, held = false;
  const sandbox = {
    ContentService: { MimeType: { JSON: "json" }, createTextOutput(text) { return { text, setMimeType() { return this; } }; } },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA-256" }, Charset: { UTF_8: "utf8" },
      computeDigest(_, text) { return [...crypto.createHash("sha256").update(text).digest()]; },
      computeHmacSha256Signature(text, key) { return [...crypto.createHmac("sha256", key).update(text).digest()]; },
      newBlob(text) { return { getBytes: () => [...Buffer.from(text)] }; },
    },
    LockService: { getScriptLock() { return { tryLock() { held = true; return true; }, hasLock: () => held, releaseLock() { held = false; } }; } },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value) }) },
    DriveApp: { getFolderById(id) {
      reads++; if (!memories[id]) throw new Error("Unknown folder");
      return { getName: () => id, getFilesByName(name) {
        let available = Object.hasOwn(memories[id], name);
        return { hasNext: () => available, next() { available = false; return {
          getSize: () => Buffer.byteLength(memories[id][name]), getMimeType: () => "text/markdown",
          getBlob: () => ({ getDataAsString: () => memories[id][name] }), setContent(text) { writes++; memories[id][name] = text; },
        }; } };
      } };
    } },
  };
  const context = vm.createContext(sandbox); vm.runInContext(googleBridgeSource(KEY, sources), context);
  const call = (payload, signature) => {
    const text = JSON.stringify({ ...payload, timestamp: Date.now(), nonce: crypto.randomUUID() });
    const envelope = { payload: text, signature: signature || crypto.createHmac("sha256", KEY).update(text).digest("hex") };
    const run = () => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(envelope) } }).text);
    return { result: run(), run };
  };
  return { sources, memories, call, counts: () => ({ reads, writes }) };
}

test("Google-hosted bridge refuses bad signatures and work before touching files", () => {
  const f = googleFixture();
  assert.equal(f.call({ action: "read", course: "il" }, "b".repeat(64)).result.ok, false);
  assert.deepEqual(f.counts(), { reads: 0, writes: 0 });
  assert.equal(f.call({ action: "read", course: "work" }).result.ok, false);
  assert.deepEqual(f.counts(), { reads: 0, writes: 0 });
});

test("Google-hosted bridge reads only allowlisted files and refuses stale or replayed writes", async () => {
  const f = googleFixture(), folder = f.sources[0].folder_id;
  f.memories[folder]["private-submission.txt"] = "Never return this.";
  const read = f.call({ action: "read", course: "il" }).result;
  assert.deepEqual(Object.keys(read.files).sort(), ["AGENTS.md", "AI-MEMORY.md"]);
  const stale = f.call({ action: "write", course: "il", expected_revision: "f".repeat(64), text: "Wrong overwrite" });
  assert.equal(stale.result.ok, false); assert.equal(f.counts().writes, 0);
  const saved = f.call({ action: "write", course: "il", expected_revision: await sha256(MEMORY), text: MEMORY + "A new fact.\n" });
  assert.equal(saved.result.saved, true); assert.equal(f.counts().writes, 1);
  assert.equal(saved.run().ok, false); assert.equal(f.counts().writes, 1);
});

test("Google bridge requests are signed without sending the secret and only follow Google output redirects", async () => {
  const requests = [];
  const data = await invokeGoogleBridge({ url: GOOGLE, key: KEY, payload: { action: "health" }, fetcher: async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) return new Response(null, { status: 302, headers: { Location: "https://script.googleusercontent.com/macros/echo?receipt=fixture" } });
    return Response.json({ ok: true, courses: ["il"] });
  } });
  assert.equal(data.ok, true);
  const envelope = JSON.parse(requests[0].options.body);
  assert.equal(envelope.signature, crypto.createHmac("sha256", KEY).update(envelope.payload).digest("hex"));
  assert.ok(!requests[0].options.body.includes(KEY));
  assert.equal(requests[1].options.method, "GET"); assert.equal(requests[1].options.body, undefined);
  let calls = 0;
  await assert.rejects(invokeGoogleBridge({ url: GOOGLE, key: KEY, payload: {}, fetcher: async () => { calls++; return new Response(null, { status: 302, headers: { Location: "https://example.invalid/collect" } }); } }), /unexpected redirect/);
  assert.equal(calls, 1);
  for (const url of ["http://script.google.com/macros/s/abc/exec", "https://script.google.com.example.invalid/macros/s/abc/exec", GOOGLE + "?key=x", "https://127.0.0.1/private"]) assert.throws(() => checkedBridgeUrl(url));
});

test("cloud context refuses unexpected files and bounds UTF-8 sizes", () => {
  assert.throws(() => checkedFiles({ "AI-MEMORY.md": MEMORY, "private.txt": "private" }), /allowlist/);
  assert.throws(() => checkedFiles({ "AI-MEMORY.md": "🌏".repeat(300000) }), /size limit/);
  assert.throws(() => checkedFiles({ "AGENTS.md": "Only instructions" }), /missing/);
});

test("cloud handoff preserves existing sections and reports an after-save history failure accurately", async () => {
  let files = { "AI-MEMORY.md": MEMORY }, snapshots = 0;
  const store = new CloudContextStore({ ownerId: OWNER, client: {}, bridge: async payload => {
    if (payload.action === "read") return { files };
    assert.equal(payload.expected_revision, await sha256(MEMORY));
    files = { "AI-MEMORY.md": payload.text }; return { saved: true };
  } });
  store.checkpoint = async (_, value) => {
    if (++snapshots > 1) throw new Error("Temporary history failure");
    return { id: OWNER, memory_revision: await sha256(value["AI-MEMORY.md"]) };
  };
  const saved = await store.writeHandoff("il", await sha256(MEMORY), "- Next task.", "ChatGPT");
  assert.equal(saved.saved, true); assert.match(saved.warning, /history\/readback is pending/);
  assert.ok(files["AI-MEMORY.md"].includes("- Existing fact."));
  assert.ok(files["AI-MEMORY.md"].includes("- Next task."));
  await assert.rejects(store.read("work"), /Work is excluded/);
});

function fixtureHandler() {
  const calls = [], privileged = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { saved: true, fixture: name }, error: null }; }, from() { throw new Error("Unexpected data read in quiz-only test"); } };
  const handler = createCloudHandler({ supabaseUrl: "https://project.example", publicUrl: "http://localhost/functions/v1/course-cloud", setupUrl: "https://owner.example/#/connect",
    authenticate: async request => request.headers.get("Authorization") === "Bearer owner-fixture" ? { client, user: { id: OWNER } } : null,
    adminClient: { from(table) { privileged.push(table); throw new Error("Unexpected privileged read"); } },
  });
  return { handler, calls, privileged };
}

test("anonymous and foreign-origin requests never reach private data; OAuth discovery is public", async () => {
  const f = fixtureHandler(), base = "https://example.test/functions/v1/course-cloud";
  const response = await f.handler(new Request(base + "/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
  assert.equal(response.status, 401); assert.match(response.headers.get("WWW-Authenticate"), /resource_metadata=/);
  assert.equal((await f.handler(new Request(base + "/.well-known/oauth-protected-resource"))).status, 200);
  const foreign = await f.handler(new Request(base + "/mcp", { method: "POST", headers: { Authorization: "Bearer owner-fixture", Origin: "https://untrusted.example" } }));
  assert.equal(foreign.status, 403); assert.deepEqual(f.calls, []); assert.deepEqual(f.privileged, []);
  const source = await f.handler(new Request(base + "/setup/script", { method: "POST", headers: { Authorization: "Bearer owner-fixture", Origin: "https://claude.ai", "Content-Type": "application/json" }, body: '{"action":"generate"}' }));
  assert.equal(source.status, 403); assert.deepEqual(f.privileged, []);
});

test("real HTTP MCP client discovers cloud tools and sends quiz answers to the existing database workflow", async t => {
  const f = fixtureHandler();
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const request = new Request(`http://127.0.0.1:${server.address().port}${req.url}`, { method: req.method, headers: req.headers, ...(["GET", "HEAD"].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) });
      const response = await f.handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { res.writeHead(500); res.end(error.message); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const client = new Client({ name: "cloud-test", version: "1.0.0" });
  t.after(() => client.close());
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/functions/v1/course-cloud/mcp`), { requestInit: { headers: { Authorization: "Bearer owner-fixture" } } });
  // Modern clients probe before using the legacy initialize handshake. The SDK
  // implements 2025 revisions, so the probe must fail with a legacy error rather
  // than falsely advertise modern support and strand the client in modern mode.
  const probe = await fetch(`http://127.0.0.1:${server.address().port}/functions/v1/course-cloud/mcp`, {
    method: "POST", headers: { Authorization: "Bearer owner-fixture", "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2026-07-28" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "modern-probe", method: "server/discover", params: {} }),
  });
  assert.equal(probe.status, 400);
  const rejected = await probe.json();
  assert.equal(rejected.error.code, -32000);
  assert.equal(rejected.result, undefined);
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 17);
  const answer = tools.find(tool => tool.name === "answer_lawstin_question");
  assert.equal(answer.annotations.idempotentHint, true);
  await client.callTool({ name: "start_lawstin_quiz", arguments: { request_key: "voice-fixture", course: "il", mode: "due" } });
  await client.callTool({ name: "answer_lawstin_question", arguments: { attempt_id: OWNER, choice: "B", guessed: true } });
  assert.deepEqual(f.calls, [
    { name: "start_chat_quiz", args: { p_request_key: "voice-fixture", p_course: "il", p_mode: "due" } },
    { name: "answer_chat_quiz", args: { p_attempt_id: OWNER, p_choice: "B", p_guessed: true } },
  ]);
  const bad = await client.callTool({ name: "answer_lawstin_question", arguments: { attempt_id: OWNER, choice: "Maybe B" } });
  assert.equal(bad.isError, true); assert.equal(f.calls.length, 2);
  await client.close();
});

test("voice quiz tools send short-answer verdicts and topic lookups to their own database functions", async t => {
  const f = fixtureHandler();
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const request = new Request(`http://127.0.0.1:${server.address().port}${req.url}`, { method: req.method, headers: req.headers, ...(["GET", "HEAD"].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) });
      const response = await f.handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { res.writeHead(500); res.end(error.message); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const client = new Client({ name: "voice-test", version: "1.0.0" });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/functions/v1/course-cloud/mcp`), { requestInit: { headers: { Authorization: "Bearer owner-fixture" } } }));
  const tools = (await client.listTools()).tools;
  for (const name of ["start_lawstin_voice_quiz", "next_lawstin_voice_question", "grade_lawstin_voice_answer", "end_lawstin_voice_quiz", "get_lawstin_topic_notes"]) assert.ok(tools.some(tool => tool.name === name), name);
  assert.equal(tools.find(tool => tool.name === "get_lawstin_topic_notes").annotations.readOnlyHint, true);
  await client.callTool({ name: "start_lawstin_voice_quiz", arguments: { request_key: "spoken-1", course: "asy", topic: "social group" } });
  await client.callTool({ name: "next_lawstin_voice_question", arguments: { session_id: OWNER, skip_attempt_id: OWNER } });
  await client.callTool({ name: "grade_lawstin_voice_answer", arguments: { attempt_id: OWNER, verdict: "partial", heard: "Said no, not visibility, but no case." } });
  await client.callTool({ name: "end_lawstin_voice_quiz", arguments: { session_id: OWNER } });
  await client.callTool({ name: "get_lawstin_topic_notes", arguments: { course: "asy", topic: "M-E-V-G-" } });
  assert.deepEqual(f.calls, [
    { name: "start_voice_quiz", args: { p_request_key: "spoken-1", p_course: "asy", p_mode: "mixed", p_topic: "social group" } },
    { name: "next_voice_quiz_question", args: { p_session_id: OWNER, p_skip_attempt_id: OWNER } },
    { name: "answer_voice_quiz", args: { p_attempt_id: OWNER, p_verdict: "partial", p_heard: "Said no, not visibility, but no case.", p_guessed: false } },
    { name: "end_voice_quiz", args: { p_session_id: OWNER } },
    { name: "voice_topic_notes", args: { p_course: "asy", p_topic: "M-E-V-G-" } },
  ]);
  const bad = await client.callTool({ name: "grade_lawstin_voice_answer", arguments: { attempt_id: OWNER, verdict: "mostly right" } });
  assert.equal(bad.isError, true); assert.equal(f.calls.length, 5);
  const work = await client.callTool({ name: "get_lawstin_topic_notes", arguments: { course: "clinic", topic: "Benson" } });
  assert.equal(work.isError, true); assert.equal(f.calls.length, 5);
  await client.close();
});
