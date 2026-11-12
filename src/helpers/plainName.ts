import type { StudyMaterial } from "./studyMaterials";
export type NamedItem = { subtopic?: string | null; title?: string; heading?: string; topic?: string; rule?: string | null; text?: string; back?: string; authority?: string | null };
const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const normalize = (s: string) => clean(s).toLocaleLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

export function isBareCitation(text: string): boolean {
  const s = clean(text);
  if (!s) return true;
  if (/^(?:[Ii]n [Rr]e|[Ee]x [Pp]arte)\s+[A-Z]/.test(s) || /\b(?:v\.?|versus)\s+/i.test(s)) return true;
  if (/^(?:(?:model\s+)?rules?(?:\s+of\s+professional\s+conduct)?|(?:AP\s+I|UN\s+Charter|U\.?S\.?\s+Const\.?)?\s*(?:art(?:icle)?s?\.?|sec(?:tion)?s?\.?|§+))\s*[\dIVX]+(?:[\d().,;§–\s-]|\b(?:and|or|et|seq|arts?|secs?|paras?|cl|ch|[a-z]{1,2})\b)*$/i.test(s)) return true;
  return /^(?:\d+\s+)?(?:U\.?S\.?|S\.\s*Ct\.|F\.(?:\s?Supp\.)?\s?\d*d|[A-Z][a-z]+\.)(?:\s+\d+|\s*\([\w\s.]+\))+$/i.test(s)
    || /^[\dIVX]+(?:[.():\s§–-]+(?:\d+|[a-z]{1,2}|[ivx]+))*[.():\s]*$/i.test(s);
}

export function firstClause(rule: string): string {
  const s = clean(rule);
  const clause = s.split(/[.;](?:\s|$)/)[0];
  if (clause.length <= 90) return clause;
  const cut = clause.slice(0, 91).lastIndexOf(" ");
  return `${clause.slice(0, cut > 0 ? cut : 90)}…`;
}
const ABBREVIATION = /(?:^|[\s(])(?:vs|v|u\.s|u|s|art|arts|no|nos|inc|corp|co|ltd|cir|ct|cl|e\.g|i\.e|cf|ch|sec|secs|para|paras|subd|supp|mr|mrs|ms|dr|st|ex|re|id|app|div|dist|fed|reg|stat|rev|cong|op)\.$/i;
export function firstSentence(rule: string): string {
  const s = clean(rule);
  for (const m of s.matchAll(/[.!?]["”’)]*(?=\s|$)/g)) {
    const end = m.index! + m[0].length;
    if (m[0][0] === "." && ABBREVIATION.test(s.slice(0, m.index! + 1))) continue;
    return s.slice(0, end);
  }
  return s;
}

export function plainName(item: NamedItem, context: NamedItem = {}): { name: string; cite: string } {
  const candidates = [item.subtopic, item.title, item.heading, context.heading, context.title, item.topic, context.topic];
  const name = candidates.find((s): s is string => !!s?.trim() && !isBareCitation(s))?.trim()
    ?? firstClause(item.rule || item.text || item.back || context.rule || context.text || "");
  const authority = item.authority?.trim() ?? context.authority?.trim() ?? "";
  return { name, cite: authority && !normalize(name).includes(normalize(authority)) ? authority : "" };
}

type Description = { name: string; rule: string; cite: string };
export type AuthorityIndex = Map<string, Description>;
export function buildAuthorityIndex(items: readonly NamedItem[]): AuthorityIndex {
  const groups = new Map<string, NamedItem[]>();
  for (const item of items) {
    if (!item.authority?.trim()) continue;
    const key = normalize(item.authority);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return new Map([...groups].map(([key, group]) => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const item of group) if (item.subtopic?.trim() && !isBareCitation(item.subtopic)) {
      const k = normalize(item.subtopic), prev = counts.get(k);
      counts.set(k, { name: item.subtopic.trim(), count: (prev?.count ?? 0) + 1 });
    }
    const best = [...counts.values()].sort((a, b) => b.count - a.count)[0]?.name;
    const source = group.find(i => best && normalize(i.subtopic ?? "") === normalize(best) && i.rule) ?? group.find(i => i.rule || i.text || i.back) ?? group[0];
    return [key, { name: best ?? plainName(source).name, rule: firstSentence(source.rule || source.text || source.back || ""), cite: source.authority!.trim() }];
  }));
}
export function describeAuthority(authority: string, index: AuthorityIndex): Description | undefined {
  return index.get(normalize(authority));
}

/** Every authority a study material carries, with the item's own words, for building an authority index. */
export function materialItems(materials: readonly StudyMaterial[]): NamedItem[] {
  return materials.flatMap((m): NamedItem[] => {
    const own: NamedItem = { subtopic: m.subtopic, title: m.title, topic: m.topic, authority: m.authority, text: m.kind === "flashcard" ? m.back : undefined };
    switch (m.kind) {
      case "flowchart": return [own, ...m.nodes.map(n => ({ subtopic: n.question, topic: m.topic, authority: n.authority }))];
      case "outline": return [own, ...m.sections.map(x => ({ subtopic: x.heading, topic: m.topic, authority: x.authority, text: x.text }))];
      case "comparison": return [own, ...m.rows.map(x => ({ subtopic: x.label, topic: m.topic, authority: x.authority }))];
      case "drill": return [own, ...m.items.map(x => ({ title: m.title, topic: m.topic, authority: x.authority, text: x.why }))];
      case "hypothetical": return [own, ...m.answer.map(x => ({ subtopic: x.issue, topic: m.topic, authority: x.authority, text: x.analysis }))];
      default: return [own];
    }
  });
}

/** Title for a rule card: the plain name, or `fallback` when the only words available are the rule's own opening. */
export function ruleTitle(item: NamedItem, fallback = "Rule"): { title: string; cite: string } {
  const { name, cite } = plainName(item);
  return { title: item.rule && normalize(name) === normalize(firstClause(item.rule)) ? fallback : name, cite };
}

/** A rule card's front is stored as its subtopic, which can be a bare citation; this gives plain words and the citation. */
export function cardName(card: { front: string; topic: string; back: string; authority: string; rule?: boolean }): { name: string; cite: string } {
  if (!card.rule) return { name: card.front, cite: "" };
  return plainName({ subtopic: card.front, topic: card.topic, rule: card.back, authority: card.authority });
}
