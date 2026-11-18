import { useCallback, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { validatePacket } from "../../skills/review-packet/references/validate.mjs";
import { shuffle } from "./matchPairs";
import { queueSetting, readCache, settingQueue, writeCache } from "./offlineCache";
import { supabase } from "./supabase";
import { flushSettings, useWorkspaceSync } from "./useCourseTasks";
import type { SchoolCourse } from "./studyMaterials";

export type Key = { model: string; criteria: string[] };
type Prompt = Key & { prompt: string };
export type Option = { id: string; text: string; why?: string };
export type Question = {
  id: string;
  text: string;
  topics: string[];
  tasks: string[];
  source: string;
  explanation: string;
  caseIdentification?: string;
  challenge?: string;
  correctId?: string;
  choices?: Option[];
  facts?: string;
  truth?: boolean;
  recall?: Prompt;
  key?: Key;
  justification?: Prompt;
  repair?: Key;
};
export type Section = { kind: string; title: string; questions: Question[]; definitions?: Option[] };
export type Packet = {
  version: 1;
  title: string;
  instructions: string;
  sections: Section[];
  tomorrow: { id: string; text: string; key: Key; source: string }[];
};
export function parsePacket(raw: string): Packet {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON. Check the file for missing commas, quotes, or brackets.");
  }
  return validatePacket(value) as Packet;
}
export type Answers = Record<string, string>;
export type Round = { submitted: boolean; answers: Answers };
export type Entry = {
  id: string;
  revision: number;
  packet: Packet;
  section: number;
  order: Record<string, string[]>;
  main: Round;
  visits: Round[];
};
export const freshRound = (): Round => ({ submitted: false, answers: {} });
export const field = (q: { id: string }, part: string) => q.id + ":" + part;
export const bankKey = (s: Section) => "bank:" + s.kind;
export function newEntry(packet: Packet): Entry {
  const order: Record<string, string[]> = {};
  const ids = (choices: Option[]) =>
    shuffle(
      choices.map((o) => o.id),
      Math.random,
    );
  for (const s of packet.sections) {
    if (s.definitions) order[bankKey(s)] = ids(s.definitions);
    for (const q of s.questions) if (q.choices) order[field(q, "choices")] = ids(q.choices);
  }
  return { id: crypto.randomUUID(), revision: 0, packet, section: 0, order, main: freshRound(), visits: [] };
}
export function writing(q: Question, answers: Answers) {
  const parts: { part: string; label: string; key: Key }[] = [];
  if (q.recall) parts.push({ part: "recall", label: q.recall.prompt, key: q.recall });
  if (q.truth !== undefined && answers[field(q, "pick")] === "false")
    parts.push({
      part: "repair",
      label: "Repair the statement",
      key: q.repair ?? { model: q.text, criteria: ["Recognize that the original statement is true."] },
    });
  if (q.justification)
    parts.push({ part: "justification", label: q.justification.prompt, key: q.justification });
  if (q.key) parts.push({ part: "response", label: "Your response", key: q.key });
  return parts;
}
export const correct = (q: Question) => q.correctId ?? (q.truth === undefined ? undefined : String(q.truth));
export function complete(q: Question, answers: Answers) {
  return (
    (!correct(q) || !!answers[field(q, "pick")]) &&
    writing(q, answers).every((p) => answers[field(q, p.part)]?.trim())
  );
}

// Each imported packet owns one settings row, independent of exam and quiz history.
export function usePackets(course: SchoolCourse) {
  useWorkspaceSync();
  const client = useQueryClient();
  const prefix = "packet:v1:" + course + ":";
  const key = ["review-packets", course];
  const local = (): Entry[] => {
    const entries = new Map<string, Entry>();
    const keys = new Set([
      ...Object.keys(localStorage)
        .filter((k) => k.startsWith("lawstin-cache:" + prefix))
        .map((k) => k.slice("lawstin-cache:".length)),
      ...Object.keys(settingQueue()).filter((k) => k.startsWith(prefix)),
    ]);
    const pending = settingQueue();
    for (const k of keys) {
      const raw = pending[k]?.value ?? readCache<string>(k);
      if (raw) {
        const e: Entry = JSON.parse(raw);
        entries.set(e.id, e);
      }
    }
    return Array.from(entries.values());
  };
  const query = useQuery({
    queryKey: key,
    initialData: local,
    initialDataUpdatedAt: 0,
    queryFn: async () => {
      const before = new Map(local().map((e) => [e.id, JSON.stringify(e)]));
      const data: Entry[] = [];
      for (let start = 0; ; start += 100) {
        const res = await supabase
          .from("app_settings")
          .select("value")
          .like("key", prefix + "%")
          .order("key")
          .range(start, start + 99);
        if (res.error) throw res.error;
        for (const row of res.data ?? []) data.push(JSON.parse(row.value));
        if ((res.data?.length ?? 0) < 100) break;
      }
      const merged = new Map(local().map((e) => [e.id, e]));
      const pending = settingQueue();
      for (const e of data) {
        const k = prefix + e.id;
        if (pending[k] || JSON.stringify(merged.get(e.id)) !== before.get(e.id)) continue;
        merged.set(e.id, e);
        writeCache(k, JSON.stringify(e));
      }
      return Array.from(merged.values());
    },
  });
  const save = (draft: Entry) => {
    const rowKey = prefix + draft.id;
    const cached = settingQueue()[rowKey]?.value ?? readCache<string>(rowKey);
    if (cached) {
      const latest: Entry = JSON.parse(cached);
      if (latest.revision !== draft.revision) {
        client.setQueryData<Entry[]>(key, (old = []) => [...old.filter((e) => e.id !== latest.id), latest]);
        throw new Error(
          "Another tab saved this packet. Its latest answers are now open. Try your edit again.",
        );
      }
    }
    const entry = { ...draft, revision: draft.revision + 1 };
    queueSetting(rowKey, JSON.stringify(entry));
    client.setQueryData<Entry[]>(key, (old = []) => [...old.filter((e) => e.id !== entry.id), entry]);
    void flushSettings();
  };
  // Controlled inputs need the new snapshot during the input event. React Query's
  // observer notifications can otherwise arrive after React restores the old value.
  const subscribe = useCallback((notify: () => void) => client.getQueryCache().subscribe(event => {
    if (event.type === "updated" && event.query.queryKey[0] === "review-packets"
      && event.query.queryKey[1] === course) notify();
  }), [client, course]);
  const entries = useSyncExternalStore(subscribe, () => client.getQueryData<Entry[]>(key) ?? query.data);
  return { entries, save, loading: query.isFetching, error: query.isError };
}
