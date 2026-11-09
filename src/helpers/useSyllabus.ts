import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { readCache, writeCache } from "./offlineCache";
import { supabase } from "./supabase";
import { COURSE_KEYS, type CourseCode, type Syllabus, type SyllabusUnit } from "./studyEngine";

export const SYLLABUS_PREFIX = "syllabus:v1:";
const isUnit = (u: unknown): u is SyllabusUnit => {
  const x = u as SyllabusUnit;
  return !!x && typeof x.topic === "string" && Array.isArray(x.dates) && x.dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d)))
    && (x.also === undefined || (Array.isArray(x.also) && x.also.every((t) => typeof t === "string")));
};

/** Each course's units as taught (`syllabus:v1:<course>` rows, kept current by the question update). */
export function useSyllabus() {
  const query = useQuery({
    queryKey: ["lawstin-syllabus"],
    queryFn: async (): Promise<Syllabus> => {
      const { data, error } = await supabase.from("app_settings").select("key,value").like("key", `${SYLLABUS_PREFIX}%`);
      if (error) throw error;
      const out: Syllabus = {};
      for (const row of data ?? []) {
        const course = row.key.slice(SYLLABUS_PREFIX.length) as CourseCode;
        if (!COURSE_KEYS.includes(course)) continue;
        try {
          const units = (JSON.parse(row.value) as { units?: unknown[] }).units;
          if (Array.isArray(units)) out[course] = units.filter(isUnit);
        } catch { /* A malformed row leaves that course on its question topics. */ }
      }
      return out;
    },
    initialData: () => readCache<Syllabus>("syllabus"),
    initialDataUpdatedAt: 0,
    staleTime: 10 * 60 * 1000,
  });
  useEffect(() => { if (query.data) writeCache("syllabus", query.data); }, [query.data]);
  return query.data ?? {};
}
