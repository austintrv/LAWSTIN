import type { QuizSnapshot } from "../components/QuizSession";
import { dateKey } from "./dateKey";
import { readCache, writeCache } from "./offlineCache";

export type SavedPractice = { key: string; snap: QuizSnapshot; at: number };

/** JSON turns sparse array entries into null; restore them as unanswered positions. */
export function restorePractice(raw: unknown, now = Date.now()): SavedPractice | null {
  if (!raw || typeof raw !== "object") return null;
  const { key, snap, at } = raw as SavedPractice;
  if (typeof key !== "string" || !/^(round|due|new|missed|starred):(all|il|asy|pr)$/.test(key)
    || !Number.isFinite(at) || at > now || dateKey.today(new Date(at)) !== dateKey.today(new Date(now))) return null;
  if (!snap || !Array.isArray(snap.items) || !snap.items.length || !Number.isInteger(snap.i) || snap.i < 0 || snap.i >= snap.items.length
    || !Array.isArray(snap.picks) || !Array.isArray(snap.results)) return null;
  if (snap.items.some((it) => {
    if (!it || typeof it !== "object") return true;
    const entry = it.q ?? it.card;
    if (!entry || typeof entry.id !== "string" || !["il", "asy", "pr"].includes(entry.course)) return true;
    if (it.card) return [it.card.front, it.card.back, it.card.topic, it.card.reason, it.card.authority].some((v) => typeof v !== "string");
    // Stored AI questions have no server copy to rehydrate from.
    if (it.q?.id.startsWith("ai-")) return typeof it.q.stem !== "string" || typeof it.q.prompt !== "string"
      || !Array.isArray(it.q.choices) || it.q.choices.length !== 4
      || it.q.choices.some((c) => !c || typeof c.text !== "string" || typeof c.why !== "string")
      || !it.q.choices.some((c) => c.id === it.q!.answer);
    return false;
  })) return null;
  return { key, at, snap: { ...snap,
    picks: snap.picks.map((v) => typeof v === "string" ? v : undefined),
    results: snap.results.map((v) => typeof v === "boolean" ? v : undefined),
    shown: Array.isArray(snap.shown) ? snap.shown.map((v) => v === true ? true : undefined) : [],
    typed: Array.isArray(snap.typed) ? snap.typed.map((v) => typeof v === "string" ? v : undefined) : [],
  } };
}

export const readPractice = (userId: string) => restorePractice(readCache(`practice:${userId}`));
export const savePractice = (userId: string, saved: SavedPractice | null) => writeCache(`practice:${userId}`, saved);
