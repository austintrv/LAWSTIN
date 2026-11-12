import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { readCache, writeCache, queueSetting, settingQueue, acknowledgeSetting } from "./offlineCache";
import { flushSettings, useWorkspaceSync } from "./useCourseTasks";
import type { CourseCode, SyllabusUnit, CoverageStatus } from "./studyEngine";
import type { QuestionDTO, ProgressDTO } from "../endpoints/state_GET.schema";
import type { StudyMaterial, Flowchart, Outline, Comparison, Hypothetical } from "./studyMaterials";
import { ruleIsMissed, type RuleAnswer } from "./missedRules";

export const NOTES_PREFIX = "notes:v1:";

export type NoteRow = {
  text: string;
  inNotes: boolean;
  at: string;
};

export const defaultNote = (): NoteRow => ({
  text: "",
  inNotes: false,
  at: "",
});

export function noteKey(course: CourseCode, unitTopic: string): string {
  return `${NOTES_PREFIX}${course}:${unitTopic}`;
}

export function parseNote(raw: unknown): NoteRow {
  if (!raw || typeof raw !== "object") {
    return {
      text: typeof raw === "string" ? raw : "",
      inNotes: false,
      at: new Date().toISOString(),
    };
  }
  const o = raw as Record<string, unknown>;
  return {
    text: typeof o.text === "string" ? o.text : "",
    inNotes: typeof o.inNotes === "boolean" ? o.inNotes : false,
    at: typeof o.at === "string" && Number.isFinite(Date.parse(o.at)) ? o.at : new Date().toISOString(),
  };
}

/**
 * Merges local and server notes using last-write-wins by timestamp `at`.
 * Pending local edits take precedence over equal or older server states.
 */
export function mergeNotes(
  local: NoteRow | undefined,
  server: NoteRow | undefined,
  pending?: NoteRow | undefined
): NoteRow {
  const candLocal = pending ?? local;
  if (!candLocal && !server) return defaultNote();
  if (!candLocal) return server!;
  if (!server) return candLocal;

  const tLocal = Date.parse(candLocal.at) || 0;
  const tServer = Date.parse(server.at) || 0;

  if (tLocal >= tServer) {
    return candLocal;
  }
  return server;
}

/**
 * Formats all course notes into clean text with unit headings for clipboard copy.
 */
export function formatAllNotes(
  units: { topic: string }[],
  notes: Record<string, NoteRow>
): string {
  const parts: string[] = [];
  for (const u of units) {
    const note = notes[u.topic];
    const text = note?.text?.trim() ?? "";
    if (text) {
      parts.push(`# ${u.topic}\n\n${text}`);
    }
  }
  return parts.join("\n\n");
}

export type TopicRule = {
  subtopic: string;
  rule: string;
  authority: string | null;
  isMissed: boolean;
};

export type AssembledTopicData = {
  unitTopic: string;
  unitNames: string[];
  status: CoverageStatus;
  dates: string[];
  questions: QuestionDTO[];
  rules: TopicRule[];
  rulesBySubtopic: { subtopic: string; rules: TopicRule[] }[];
  materials: StudyMaterial[];
  flowcharts: Flowchart[];
  outlines: Outline[];
  comparisons: Comparison[];
  hypo: Hypothetical | undefined;
  authorities: string[];
  missedQuestions: { q: QuestionDTO; p: ProgressDTO }[];
};

/**
 * Pure data assembly for a syllabus unit, handling its topic and `also` names.
 */
export function assembleTopicData({
  course,
  unit,
  questions = [],
  progress = [],
  materials = [],
  answers = [],
  today = new Date().toISOString().slice(0, 10),
}: {
  course: CourseCode;
  unit: SyllabusUnit;
  questions?: QuestionDTO[];
  progress?: ProgressDTO[];
  materials?: StudyMaterial[];
  answers?: RuleAnswer[];
  today?: string;
}): AssembledTopicData {
  const unitNames = [unit.topic, ...(unit.also ?? [])];
  const pmap = new Map<string, ProgressDTO>(progress.map((p) => [p.questionId, p]));

  // Questions for this unit
  const unitQuestions = questions.filter(
    (q) => q.course === course && unitNames.includes(q.topic)
  );

  // Group answers by question id
  const answerGroups = new Map<string, RuleAnswer[]>();
  for (const a of answers) {
    const list = answerGroups.get(a.question_id) ?? [];
    list.push(a);
    answerGroups.set(a.question_id, list);
  }

  // Determine missed questions
  const missedQuestions: { q: QuestionDTO; p: ProgressDTO }[] = [];
  const missedQuestionIds = new Set<string>();
  const missedRuleTexts = new Set<string>();

  for (const q of unitQuestions) {
    const p = pmap.get(q.id);
    if (!p) continue;
    const history = answerGroups.get(q.id) ?? [];
    if (ruleIsMissed(history, p) || p.wrong > 0 || p.lastCorrect === false) {
      missedQuestions.push({ q, p });
      missedQuestionIds.add(q.id);
      if (q.rule) missedRuleTexts.add(q.rule);
    }
  }

  // Rules from questions
  const seenRuleKeys = new Set<string>();
  const rules: TopicRule[] = [];
  for (const q of unitQuestions) {
    if (!q.rule) continue;
    const subtopic = q.subtopic ?? unit.topic;
    const ruleKey = `${subtopic}|${q.rule}`;
    if (seenRuleKeys.has(ruleKey)) continue;
    seenRuleKeys.add(ruleKey);

    const isMissed =
      missedRuleTexts.has(q.rule) ||
      unitQuestions.some((uq) => uq.rule === q.rule && missedQuestionIds.has(uq.id));

    rules.push({
      subtopic,
      rule: q.rule,
      authority: q.authority ?? null,
      isMissed,
    });
  }

  // Group rules by subtopic
  const subtopicMap = new Map<string, TopicRule[]>();
  for (const r of rules) {
    const list = subtopicMap.get(r.subtopic) ?? [];
    list.push(r);
    subtopicMap.set(r.subtopic, list);
  }
  const rulesBySubtopic = [...subtopicMap.entries()].map(([subtopic, rList]) => ({
    subtopic,
    rules: rList,
  }));

  // Study materials for this unit
  const unitMaterials = materials.filter(
    (m) => m.course === course && unitNames.includes(m.topic)
  );
  const flowcharts = unitMaterials.filter(
    (m): m is Flowchart => m.kind === "flowchart"
  );
  const outlines = unitMaterials.filter(
    (m): m is Outline => m.kind === "outline"
  );
  const comparisons = unitMaterials.filter(
    (m): m is Comparison => m.kind === "comparison"
  );
  const hypo = unitMaterials.find(
    (m): m is Hypothetical => m.kind === "hypothetical"
  );

  // Distinct authorities
  const authSet = new Set<string>();
  for (const q of unitQuestions) {
    if (q.authority?.trim()) authSet.add(q.authority.trim());
  }
  for (const m of unitMaterials) {
    if (m.authority?.trim()) authSet.add(m.authority.trim());
    if (m.kind === "flowchart") {
      for (const n of m.nodes) {
        if (n.authority?.trim()) authSet.add(n.authority.trim());
      }
    }
    if (m.kind === "outline") {
      for (const s of m.sections) {
        if (s.authority?.trim()) authSet.add(s.authority.trim());
      }
    }
    if (m.kind === "comparison") {
      for (const r of m.rows) {
        if (r.authority?.trim()) authSet.add(r.authority.trim());
      }
    }
    if (m.kind === "hypothetical") {
      for (const a of m.answer) {
        if (a.authority?.trim()) authSet.add(a.authority.trim());
      }
    }
    if (m.kind === "drill") {
      for (const it of m.items) {
        if (it.authority?.trim()) authSet.add(it.authority.trim());
      }
    }
  }
  const authorities = [...authSet].sort((a, b) => a.localeCompare(b));

  // Compute status matching studyEngine.coverage
  const n = unitQuestions.length;
  let seenCount = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let isShaky = false;

  for (const q of unitQuestions) {
    const p = pmap.get(q.id);
    if (p) {
      if (p.seen > 0) seenCount++;
      correctCount += p.correct;
      wrongCount += p.wrong;
      if (p.missSneaky > 0 || (p.correct + p.wrong >= 2 && p.correct / (p.correct + p.wrong) < 0.7)) {
        isShaky = true;
      }
    }
  }

  const totalAns = correctCount + wrongCount;
  const acc = totalAns > 0 ? correctCount / totalAns : 0;
  let status: CoverageStatus = "none";
  if (!n) {
    status = "none";
  } else if (!seenCount) {
    status = "unseen";
  } else if (isShaky) {
    status = "shaky";
  } else if (seenCount < n || acc < 0.85) {
    status = "learning";
  } else {
    status = "solid";
  }

  return {
    unitTopic: unit.topic,
    unitNames,
    status,
    dates: unit.dates ?? [],
    questions: unitQuestions,
    rules,
    rulesBySubtopic,
    materials: unitMaterials,
    flowcharts,
    outlines,
    comparisons,
    hypo,
    authorities,
    missedQuestions,
  };
}

/**
 * Hook to manage notes for a given course across all units.
 */
export function useNotes(course?: CourseCode) {
  useWorkspaceSync();
  const qc = useQueryClient();
  const queryKey = ["lawstin-notes", course];

  const getCachedNotes = useCallback((): Record<string, NoteRow> => {
    if (!course) return {};
    const base = readCache<Record<string, NoteRow>>(`notes:${course}`) ?? {};
    const pending = settingQueue();
    const prefix = `${NOTES_PREFIX}${course}:`;
    const out = { ...base };
    for (const [key, row] of Object.entries(pending)) {
      if (key.startsWith(prefix)) {
        const unit = key.slice(prefix.length);
        try {
          out[unit] = parseNote(JSON.parse(row.value));
        } catch {
          out[unit] = parseNote(row.value);
        }
      }
    }
    return out;
  }, [course]);

  const query = useQuery({
    queryKey,
    enabled: !!course,
    queryFn: async (): Promise<Record<string, NoteRow>> => {
      if (!course) return {};
      const prefix = `${NOTES_PREFIX}${course}:`;
      const { data, error } = await supabase
        .from("app_settings")
        .select("key,value,updated_at")
        .like("key", `${prefix}%`);
      if (error) throw error;

      const base = readCache<Record<string, NoteRow>>(`notes:${course}`) ?? {};
      const pending = settingQueue();
      const next: Record<string, NoteRow> = { ...base };

      for (const row of data ?? []) {
        const unit = row.key.slice(prefix.length);
        let parsed: NoteRow;
        try {
          parsed = parseNote(JSON.parse(row.value));
        } catch {
          parsed = parseNote(row.value);
        }
        if (row.updated_at && !parsed.at) {
          parsed.at = row.updated_at;
        }

        let pendingNote: NoteRow | undefined;
        if (pending[row.key]) {
          try {
            pendingNote = parseNote(JSON.parse(pending[row.key].value));
          } catch {
            pendingNote = parseNote(pending[row.key].value);
          }
        }

        next[unit] = mergeNotes(next[unit], parsed, pendingNote);
      }

      // Also merge any pending settings not present on the server
      for (const [key, pRow] of Object.entries(pending)) {
        if (key.startsWith(prefix)) {
          const unit = key.slice(prefix.length);
          let pendingNote: NoteRow | undefined;
          try {
            pendingNote = parseNote(JSON.parse(pRow.value));
          } catch {
            pendingNote = parseNote(pRow.value);
          }
          next[unit] = mergeNotes(next[unit], undefined, pendingNote);
        }
      }

      writeCache(`notes:${course}`, next);
      return next;
    },
    initialData: getCachedNotes,
    initialDataUpdatedAt: 0,
    staleTime: 60 * 1000,
  });

  const [localNotes, setLocalNotes] = useState<Record<string, NoteRow>>(getCachedNotes);

  useEffect(() => {
    if (query.data) {
      setLocalNotes((prev) => {
        const merged = { ...query.data };
        for (const [k, v] of Object.entries(prev)) {
          merged[k] = mergeNotes(v, merged[k]);
        }
        return merged;
      });
    }
  }, [query.data]);

  // Other mounted readers of the same course (search, the topic page) follow each edit.
  useEffect(() => {
    const sync = (ev: Event) => { if ((ev as CustomEvent).detail === course) setLocalNotes((prev) => ({ ...prev, ...getCachedNotes() })); };
    window.addEventListener("lawstin-notes", sync);
    return () => window.removeEventListener("lawstin-notes", sync);
  }, [course, getCachedNotes]);

  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>();

  const getNote = useCallback(
    (unitTopic: string): NoteRow => {
      return localNotes[unitTopic] ?? defaultNote();
    },
    [localNotes]
  );

  const saveNote = useCallback(
    (unitTopic: string, text: string, inNotes?: boolean) => {
      if (!course) return;
      const key = noteKey(course, unitTopic);
      const prev = localNotes[unitTopic] ?? defaultNote();
      const updated: NoteRow = {
        text,
        inNotes: inNotes !== undefined ? inNotes : prev.inNotes,
        at: new Date().toISOString(),
      };

      // 1. Immediately update state, cache and pending queue
      const nextNotes = { ...localNotes, [unitTopic]: updated };
      setLocalNotes(nextNotes);
      writeCache(`notes:${course}`, nextNotes);
      queueSetting(key, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent("lawstin-notes", { detail: course }));

      // 2. Debounced background flush
      clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => {
        void flushSettings();
      }, 700);
    },
    [course, localNotes]
  );

  const toggleInNotes = useCallback(
    (unitTopic: string) => {
      const prev = getNote(unitTopic);
      saveNote(unitTopic, prev.text, !prev.inNotes);
    },
    [getNote, saveNote]
  );

  const flush = useCallback(() => {
    clearTimeout(flushTimer.current);
    void flushSettings();
  }, []);

  // Flush on unmount or blur
  useEffect(() => {
    return () => {
      clearTimeout(flushTimer.current);
      void flushSettings();
    };
  }, []);

  return {
    notes: localNotes,
    getNote,
    saveNote,
    toggleInNotes,
    flush,
    loading: query.isLoading,
  };
}

export function noteUnits(units: SyllabusUnit[] | undefined, questions: QuestionDTO[], course: CourseCode): SyllabusUnit[] {
  if (units?.length) return units;
  const seen = new Set<string>();
  return questions.filter(q => q.course === course && !seen.has(q.topic) && !!seen.add(q.topic)).map(q => ({ topic: q.topic, dates: q.classDate ? [q.classDate] : [] }));
}
