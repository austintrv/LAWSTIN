export type NamedItem = { subtopic?: string | null; title?: string; heading?: string; topic?: string; rule?: string | null; text?: string; back?: string; authority?: string | null };
const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const normalize = (s: string) => clean(s).toLocaleLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

export function isBareCitation(text: string): boolean {
  const s = clean(text);
  if (!s) return true;
  if (/^(?:in re\b|ex parte\b)/i.test(s) || /\b(?:v\.?|versus)\s+/i.test(s)) return true;
  if (/^(?:(?:model\s+)?rules?(?:\s+of\s+professional\s+conduct)?|(?:AP\s+I|UN\s+Charter|U\.?S\.?\s+Const\.?)?\s*(?:art(?:icle)?\.?|sec(?:tion)?\.?|§+))\s*[\dIVX]+[\w.()\s,;§–-]*$/i.test(s)) return true;
  return /^(?:\d+\s+)?(?:U\.?S\.?|S\.\s*Ct\.|F\.(?:\s?Supp\.)?\s?\d*d|[A-Z][a-z]+\.)(?:\s+\d+|\s*\([\w\s.]+\))+$/i.test(s)
    || /^[\dIVX]+(?:[.():\s§–-]+[\da-zIVX]+)*$/i.test(s);
}

export function firstClause(rule: string): string {
  const s = clean(rule);
  const clause = s.split(/[.;](?:\s|$)/)[0];
  if (clause.length <= 90) return clause;
  const cut = clause.slice(0, 91).lastIndexOf(" ");
  return clause.slice(0, cut > 0 ? cut : 90);
}
export function firstSentence(rule: string): string {
  return clean(rule).match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? clean(rule);
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
