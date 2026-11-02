import { COURSES, CONTEXT_FILES } from "./courses.mjs";
import { replaceCurrentWork, appendFact } from "./memory.mjs";

export async function sha256(text) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(value => value.toString(16).padStart(2, "0")).join("");
}
export function checkedFiles(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Drive returned invalid context files.");
  const files = {};
  for (const name of Object.keys(input)) {
    if (!CONTEXT_FILES.includes(name) || typeof input[name] !== "string" || new TextEncoder().encode(input[name]).length > 1048576) throw new Error("Drive returned a file outside the shared-context allowlist or size limit.");
    files[name] = input[name];
  }
  if (typeof files["AI-MEMORY.md"] !== "string") throw new Error("The course's shared AI-MEMORY.md is missing.");
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}
export async function dbResult(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message || "LAWSTIN could not complete the request.");
  return data;
}

export class CloudContextStore {
  constructor({ client, bridge, ownerId }) { this.client = client; this.bridge = bridge; this.ownerId = ownerId; }
  course(id) {
    const course = COURSES.find(course => course.id === id);
    if (!course) throw new Error("Choose one of the five school courses. Work is excluded.");
    return course;
  }
  async list() { return COURSES.map(({ id, name }) => ({ id, name })); }
  async checkpoint(id, files) {
    this.course(id);
    const memoryRevision = await sha256(files["AI-MEMORY.md"]);
    const contentHash = await sha256(JSON.stringify(files));
    await dbResult(this.client.from("course_context_versions").upsert({ owner_id: this.ownerId, course: id, content_hash: contentHash, memory_revision: memoryRevision, files }, { onConflict: "owner_id,course,content_hash", ignoreDuplicates: true }));
    return dbResult(this.client.from("course_context_versions").select("id,memory_revision,created_at").eq("owner_id", this.ownerId).eq("course", id).eq("content_hash", contentHash).single());
  }
  async read(id) {
    const course = this.course(id);
    const data = await this.bridge({ action: "read", course: id });
    const files = checkedFiles(data.files);
    const version = await this.checkpoint(id, files);
    return { course: id, name: course.name, revision: version.memory_revision, checkpoint: version.id, history: "private_cloud_versions", files };
  }
  async save(id, expected, actor, update) {
    if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error("Read the course first and provide its revision.");
    const before = await this.read(id);
    if (before.revision !== expected) throw new Error("The course memory changed. Read it again and merge the newer work before saving.");
    const next = update(before.files["AI-MEMORY.md"]);
    const written = await this.bridge({ action: "write", course: id, expected_revision: expected, text: next });
    if (written.saved !== true) throw new Error("Drive did not confirm saving the memory.");
    try {
      const after = await this.read(id);
      return { saved: true, course: id, revision: after.revision, checkpoint: after.checkpoint,
        ...(after.files["AI-MEMORY.md"] !== next ? { warning: "Drive changed again after the save. Read the latest context before making further edits." } : {}) };
    } catch (error) {
      return { saved: true, course: id, revision: await sha256(next), warning: `Drive confirmed the save, but its cloud history/readback is pending: ${error.message}. Do not repeat the write with the old revision.` };
    }
  }
  async writeHandoff(id, expected, work, actor) {
    return this.save(id, expected, actor, memory => replaceCurrentWork(memory, work));
  }
  async recordFact(id, expected, fact, actor) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return this.save(id, expected, actor, memory => appendFact(memory, fact, actor, date));
  }
  async history(id, limit = 10) {
    await this.read(id);
    return dbResult(this.client.from("course_context_versions").select("id,memory_revision,created_at").eq("owner_id", this.ownerId).eq("course", id).order("created_at", { ascending: false }).limit(limit));
  }
  async readVersion(id, version) {
    this.course(id);
    const data = await dbResult(this.client.from("course_context_versions").select("files").eq("owner_id", this.ownerId).eq("course", id).eq("id", version).single());
    return checkedFiles(data.files)["AI-MEMORY.md"];
  }
  async search(id, query) {
    const context = await this.read(id), matches = [];
    for (const [file, text] of Object.entries(context.files)) text.split(/\r?\n/).forEach((line, index) => {
      if (matches.length < 40 && line.toLocaleLowerCase().includes(query.toLocaleLowerCase())) matches.push({ file, line: index + 1, text: line.slice(0, 2000) });
    });
    return { course: id, matches, limit: 40 };
  }
}
