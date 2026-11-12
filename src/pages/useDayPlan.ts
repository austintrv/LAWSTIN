import { useSyncedSetting } from "../helpers/useSyncedSetting";
import type { DayPlanSnapshot } from "../../supabase/functions/_shared/reminderPlan";
import { useEffect, useRef, useState } from "react";
import { COURSE_KEYS, DAILY_GOAL, FINALS, EXAMS, courseCounts, type CourseCode } from "../helpers/studyEngine";
import type { Flashcard, StudyRecord } from "../helpers/studyMaterials";
import { finalsPlan, holdDayGoal, inferredDone, readyCards, reconcileDayWork, restoreDayGoal, studyNumbers, type DayGoal, type DayWork } from "../helpers/studySession";
import type { WrittenEntry } from "../helpers/useWritten";
import type { Engine } from "./StudyParts";

const read = (key: string) => { try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage unavailable. Keep the in-memory plan. */ } };

export function useDayPlan({ e, record, flashcards, entries, lastEssay, enabled, fallbackGoal = DAILY_GOAL, ready, userId }: {
  e: Engine; record: StudyRecord; flashcards: Flashcard[]; entries: WrittenEntry[]; lastEssay: Partial<Record<CourseCode, string>>;
  enabled: boolean; fallbackGoal?: number; ready: boolean; userId: string;
}) {
  const mirror=useSyncedSetting<DayPlanSnapshot|null>(`dayplan:v1:${e.today}`,null);
  const workKey = `lawstin-day-work:${userId}`;
  const [savedWork, setWork] = useState<DayWork | null>(() => read(workKey));
  const savedGoal = useRef<DayGoal | null>(restoreDayGoal(read("lawstin-day-goal"), e.today));
  const config=JSON.stringify([FINALS,EXAMS]);
  const previousConfig=useRef(read("lawstin-day-plan-config"));
  if(previousConfig.current && previousConfig.current!==config) savedGoal.current=null;
  previousConfig.current=config;
  const work = reconcileDayWork(e.today, e.todayCount?.answered ?? 0, inferredDone(e, record, entries, flashcards), savedWork ?? mirror.value?.work ?? null);
  const workRef = useRef(work);
  workRef.current = work;
  const cardCounts = Object.fromEntries(COURSE_KEYS.map((c) => {
    const cards = readyCards(flashcards, e.ruleCards(c), record, undefined, c, e.today);
    return [c, { due: cards.due.length, fresh: cards.fresh.length }];
  })) as Parameters<typeof finalsPlan>[1]["cards"];
  const raw = finalsPlan(e, { cards: cardCounts, lastEssay, fallbackGoal, done: work.done, totalDone: work.total, planOn: enabled });
  const plan = holdDayGoal(raw, e.today, savedGoal.current ?? (mirror.value?.config===config ? mirror.value.saved : null), raw.active ? undefined : fallbackGoal);
  useEffect(() => {
    if (!ready) return;
    savedGoal.current = plan.saved;
    write("lawstin-day-plan-config",config);
    write("lawstin-day-goal", plan.saved);
    write(workKey, work);
  });
  const snapshot={config,saved:plan.saved,work,enabled};
  const serialized=JSON.stringify(snapshot);
  useEffect(()=>{if(ready && mirror.loaded && !mirror.error && JSON.stringify(mirror.value)!==serialized)mirror.save(snapshot);},[ready,mirror.loaded,serialized,mirror.value]);
  const credit = (course: CourseCode | undefined, count = 1) => {
    const before = workRef.current;
    return () => {
      const current = workRef.current;
      const next = { date: e.today, total: Math.max(before.total + count, current.total), done: course ? { ...current.done, [course]: Math.max(before.done[course] + count, current.done[course]) } : current.done };
      workRef.current = next;
      write(workKey, next);
      setWork(next);
    };
  };
  const cardsFor = (filter: Parameters<typeof studyNumbers>[4]) => readyCards(flashcards, e.ruleCards(filter), record, undefined, filter, e.today);
  const numbers = (filter: Parameters<typeof studyNumbers>[4] = "all") => studyNumbers(e, cardsFor(filter), plan, work.done, filter, work.total);
  const remaining = courseCounts();
  plan.courses.forEach((c) => { remaining[c.course] = Math.max(0, c.target - work.done[c.course]); });
  return { plan, credit, cardsFor, numbers, remaining };
}
