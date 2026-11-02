// Pure Markdown updates shared by the Mac and cloud connectors.
export function replaceCurrentWork(memory, currentWork) {
  const match = /^## Current work\s*\r?$/m.exec(memory);
  if (!match) throw new Error("AI-MEMORY.md has no '## Current work' section. Add it before saving a handoff.");
  if (/^#{1,2}\s/m.test(currentWork)) throw new Error("Use plain text or bullets inside the handoff, not top-level headings.");
  const start = match.index + match[0].length;
  const next = /^## /m.exec(memory.slice(start));
  return memory.slice(0, start).trimEnd() + "\n" + currentWork.trim() + "\n\n" + memory.slice(next ? start + next.index : memory.length);
}

export function appendFact(memory, fact, actor, date) {
  if (typeof fact !== "string" || !fact.trim() || fact.length > 2000 || /[\r\n]/.test(fact)) throw new Error("Provide one factual paragraph of at most 2,000 characters.");
  const match = /^## Log\s*\r?$/m.exec(memory);
  if (!match) throw new Error("AI-MEMORY.md has no '## Log' section.");
  const entry = `- ${date} (${actor}): ${fact.trim()}`;
  if (memory.includes(entry)) return memory;
  const end = match.index + match[0].length;
  return memory.slice(0, end).trimEnd() + "\n" + entry + "\n" + memory.slice(end).replace(/^\s*\n/, "");
}
