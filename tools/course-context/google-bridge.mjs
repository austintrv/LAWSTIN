export function checkedBridgeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "script.google.com" || url.username || url.password || url.port || url.search || url.hash || !/^\/macros\/s\/[A-Za-z0-9_-]{20,250}\/exec$/.test(url.pathname)) throw new Error("Paste the Google web app deployment URL ending in /exec.");
  return url.href;
}

export async function invokeGoogleBridge({ url, key, payload, fetcher = fetch }) {
  checkedBridgeUrl(url);
  const json = JSON.stringify({ ...payload, timestamp: Date.now(), nonce: crypto.randomUUID() });
  const signingKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = [...new Uint8Array(await crypto.subtle.sign("HMAC", signingKey, new TextEncoder().encode(json)))].map(value => value.toString(16).padStart(2, "0")).join("");
  let response = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload: json, signature }), redirect: "manual", signal: AbortSignal.timeout(25000) });
  // Apps Script's ContentService redirects the output to its own Google domain.
  if ([301,302,303].includes(response.status)) {
    const location = response.headers.get("location");
    const target = new URL(location || "");
    if (target.protocol !== "https:" || target.hostname !== "script.googleusercontent.com" || target.username || target.password || target.port) throw new Error("Google returned an unexpected redirect; the bridge was not followed.");
    response = await fetcher(target.href, { method: "GET", redirect: "error", signal: AbortSignal.timeout(25000) });
  }
  if (!response.ok) throw new Error("The Google Drive connection could not be reached. Check its deployment in Connected apps.");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > 4500000) throw new Error("Drive's response exceeded the context size limit.");
  const text = await response.text();
  if (text.length > 4500000) throw new Error("Drive's response exceeded the context size limit.");
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Google returned a sign-in page instead of data. Check the web app's deployment access setting."); }
  if (data.ok !== true) throw new Error(typeof data.error === "string" ? data.error.slice(0, 250) : "Drive did not confirm the request.");
  return data;
}

// This source is delivered only to the signed-in owner, never to an MCP tool or public repository with a real key.
export function googleBridgeSource(key, sources) {
  if (!/^[a-f0-9]{64}$/.test(key) || sources.length !== 5 || sources.some(source => !/^[A-Za-z0-9_-]{10,200}$/.test(source.folder_id))) throw new Error("The school Drive configuration is incomplete.");
  const map = Object.fromEntries(sources.map(source => [source.course, { folder: source.folder_id, name: source.name }]));
  return `// LAWSTIN: only the four shared Markdown files in these five course folders.
const LAWSTIN_KEY = ${JSON.stringify(key)};
const LAWSTIN_COURSES = ${JSON.stringify(map, null, 2)};
const LAWSTIN_FILES = ["AI-MEMORY.md", "CLAUDE-CONTEXT.md", "AGENTS.md", "CLAUDE.md"];

function lawstinHex(bytes) { return bytes.map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, "0"); }).join(""); }
function lawstinHash(text) { return lawstinHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)); }
function lawstinFile(folder, name, required) {
  var list = folder.getFilesByName(name);
  if (!list.hasNext()) { if (required) throw new Error("The shared AI-MEMORY.md file is missing."); return null; }
  var file = list.next();
  if (list.hasNext()) throw new Error("There are duplicate shared files with the same name. Resolve them before continuing.");
  if (file.getSize() > 1048576 || file.getMimeType().indexOf("application/vnd.google-apps.") === 0) throw new Error("Shared context must be a regular Markdown file under 1 MiB.");
  return file;
}
function doPost(e) {
  var lock;
  try {
    if (!e || !e.postData || e.postData.contents.length > 1600000) throw new Error("Invalid request.");
    var envelope = JSON.parse(e.postData.contents);
    if (typeof envelope.payload !== "string" || !/^[a-f0-9]{64}$/.test(envelope.signature || "")) throw new Error("Not authorized.");
    var mac = lawstinHex(Utilities.computeHmacSha256Signature(envelope.payload, LAWSTIN_KEY, Utilities.Charset.UTF_8));
    var mismatch = 0; for (var i = 0; i < 64; i++) mismatch |= mac.charCodeAt(i) ^ envelope.signature.charCodeAt(i);
    if (mismatch) throw new Error("Not authorized.");
    var request = JSON.parse(envelope.payload);
    if (typeof request.timestamp !== "number" || Math.abs(Date.now() - request.timestamp) > 120000 || !/^[a-f0-9-]{36}$/.test(request.nonce || "")) throw new Error("Request expired.");
    lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) throw new Error("Another handoff is saving. Retry shortly.");
    var cache = CacheService.getScriptCache();
    if (cache.get(request.nonce)) throw new Error("Request already received. Read the current handoff before retrying.");
    cache.put(request.nonce, "1", 300);
    var result;
    if (request.action === "health") {
      Object.keys(LAWSTIN_COURSES).forEach(function (id) { DriveApp.getFolderById(LAWSTIN_COURSES[id].folder).getName(); });
      result = { ok: true, courses: Object.keys(LAWSTIN_COURSES) };
    } else {
      if (!Object.prototype.hasOwnProperty.call(LAWSTIN_COURSES, request.course)) throw new Error("Unknown school course. Work is excluded.");
      var folder = DriveApp.getFolderById(LAWSTIN_COURSES[request.course].folder);
      if (request.action === "read") {
        var files = {};
        LAWSTIN_FILES.forEach(function (name) { var file = lawstinFile(folder, name, name === "AI-MEMORY.md"); if (file) files[name] = file.getBlob().getDataAsString("UTF-8"); });
        result = { ok: true, files: files };
      } else if (request.action === "write") {
        if (typeof request.text !== "string" || Utilities.newBlob(request.text).getBytes().length > 1048576 || !/^[a-f0-9]{64}$/.test(request.expected_revision || "")) throw new Error("Invalid handoff.");
        var memory = lawstinFile(folder, "AI-MEMORY.md", true);
        var current = memory.getBlob().getDataAsString("UTF-8");
        var wanted = lawstinHash(request.text);
        if (lawstinHash(current) !== request.expected_revision && lawstinHash(current) !== wanted) throw new Error("The memory changed. Read it again and merge newer work before saving.");
        if (current !== request.text) memory.setContent(request.text);
        result = { ok: true, saved: true, revision: wanted };
      } else throw new Error("Unknown action.");
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(error.message || "Drive request failed.").slice(0, 250) })).setMimeType(ContentService.MimeType.JSON);
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
`;
}
