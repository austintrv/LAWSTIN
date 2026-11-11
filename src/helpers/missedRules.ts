import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChoiceDTO, ProgressDTO, QuestionDTO } from "../endpoints/state_GET.schema";
import { ANSWER_QUEUE, readCache, writeCache } from "./offlineCache";
import { supabase } from "./supabase";
import { ROLE_LABEL, type CourseCode } from "./studyEngine";

export const ANSWER_LABEL: Record<string, string> = { ...ROLE_LABEL, guessed: "Right, but guessed" };
export type RuleAnswer = { id?: number; question_id: string; choice: string; is_correct: boolean; role: ChoiceDTO["role"]; local_date: string; answered_at: string };
export type MissedRule = { q: QuestionDTO; misses: number; lastMissed: string | null; role: string };

/** A miss resets the run; repeated right answers on one day count as one clean day. */
export function ruleIsMissed(answers: RuleAnswer[], p?: ProgressDTO): boolean {
  let missed = false;
  const clean = new Set<string>();
  const ordered = [...answers].sort((a, b) => Date.parse(a.answered_at) - Date.parse(b.answered_at) || (a.id ?? 0) - (b.id ?? 0));
  for (const a of ordered) {
    if (!a.is_correct) { missed = true; clean.clear(); }
    else if (missed) { clean.add(a.local_date); if (clean.size >= 2) missed = false; }
  }
  const latest = ordered[ordered.length - 1];
  if (p?.lastCorrect === false && (!latest || !p.lastAt || Date.parse(p.lastAt) >= Date.parse(latest.answered_at))) return true;
  if (missed) return true;
  if ((p?.wrong ?? 0) > ordered.filter(a => !a.is_correct).length) {
    // A stale offline history must not hide a more recent miss in progress.
    return new Set(ordered.filter(a => a.is_correct && p?.lastAt && Date.parse(a.answered_at) > Date.parse(p.lastAt)).map(a => a.local_date)).size < 2;
  }
  return false;
}
export function missedRules(questions: QuestionDTO[], progress: ProgressDTO[], answers: RuleAnswer[], course?: CourseCode): MissedRule[] {
  const groups = new Map<string, RuleAnswer[]>();
  answers.forEach(a => groups.set(a.question_id, [...(groups.get(a.question_id) ?? []), a]));
  const pm = new Map(progress.map(p => [p.questionId, p]));
  return questions.filter(q => q.rule && (!course || q.course === course)).flatMap(q => {
    const history = groups.get(q.id) ?? [], p = pm.get(q.id);
    if (!ruleIsMissed(history, p)) return [];
    const wrong = history.filter(a => !a.is_correct).sort((a, b) => b.answered_at.localeCompare(a.answered_at));
    const last = wrong[0];
    return [{ q, misses: Math.max(p?.wrong ?? 0, wrong.length), lastMissed: last?.answered_at ?? (p?.lastCorrect === false ? p.lastAt : null),
      role: last?.role ?? q.choices.find(c => c.id === p?.lastChoice && c.role !== "correct")?.role ?? "" }];
  }).sort((a, b) => b.misses - a.misses || (b.lastMissed ?? "").localeCompare(a.lastMissed ?? "") || a.q.id.localeCompare(b.q.id));
}
export function closeCallOrder(questions: QuestionDTO[], progress: ProgressDTO[], course?: CourseCode): QuestionDTO[] {
  const pm = new Map(progress.map(p => [p.questionId, p]));
  const rank = (q: QuestionDTO) => { const p = pm.get(q.id)!; return p.missSneaky > 0 || q.choices.some(c => c.role === "sneaky" && c.id === p.lastChoice) ? 0 : p.guessed > 0 ? 1 : 2; };
  return questions.filter(q => (!course || q.course === course) && (pm.get(q.id)?.seen ?? 0) > 0 && q.choices.some(c => c.role === "sneaky"))
    .sort((a, b) => rank(a) - rank(b) || (pm.get(a.id)?.lastAt ?? "").localeCompare(pm.get(b.id)?.lastAt ?? "") || a.id.localeCompare(b.id));
}
export function useRuleAnswers(progress: ProgressDTO[] = [], enabled = true) {
  const stamp = progress.reduce((s, p) => s + p.seen + p.guessed, 0);
  const query = useQuery({ queryKey: ["lawstin-rule-answers", stamp], enabled, initialData: () => readCache<RuleAnswer[]>("rule-answers"), initialDataUpdatedAt: 0, queryFn: async () => {
    const rows: RuleAnswer[] = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await supabase.from("answers").select("id,question_id,choice,is_correct,role,local_date,answered_at").order("id").range(start, start + 999);
      if (error) throw error;
      rows.push(...(data ?? [])); if ((data?.length ?? 0) < 1000) break;
    }
    return rows;
  } });
  useEffect(() => { if (query.data) writeCache("rule-answers", query.data); }, [query.data]);
  return query;
}
export function queuedRuleAnswers(questions: QuestionDTO[]): RuleAnswer[] {
  try {
    return (JSON.parse(localStorage.getItem(ANSWER_QUEUE) ?? "[]") as { questionId: string; choice: string; localDate: string; at: string }[]).flatMap(a => {
      const q = questions.find(q => q.id === a.questionId), c = q?.choices.find(c => c.id === a.choice);
      return q && c ? [{ question_id: q.id, choice: a.choice, is_correct: a.choice === q.answer, role: c.role, local_date: a.localDate, answered_at: a.at }] : [];
    });
  } catch { return []; }
}
