import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { readCache, writeCache } from "./offlineCache";
import { supabase } from "./supabase";
import { materialErrors, SCHOOL_ORDER, type StudyMaterial, type StudyRun } from "./studyMaterials";

async function readAll<T>(table: "study_materials" | "study_runs"): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += 1000) {
    let q = supabase.from(table).select("data").order("created_at", { ascending: table === "study_materials" }).order("id").range(start, start + 999);
    if (table === "study_materials") q = q.eq("retired", false);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data ?? []).map((r) => r.data as T));
    if ((data?.length ?? 0) < 1000) return out;
  }
}

/** Verified study materials and update runs, read from the database. Unchecked items never reach a queue. */
type Library = { materials: StudyMaterial[]; runs: StudyRun[] };

export function useStudyLibrary() {
  const query = useQuery({
    queryKey: ["lawstin-study-library"],
    queryFn: async () => {
      const [materials, runs] = await Promise.all([readAll<StudyMaterial>("study_materials"), readAll<StudyRun>("study_runs")]);
      const verified = materials.filter((m) => materialErrors(m).length === 0)
        .sort((a, b) => SCHOOL_ORDER.indexOf(a.course) - SCHOOL_ORDER.indexOf(b.course));
      return { materials: verified, runs };
    },
    initialData: () => readCache<Library>("library"),
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => { if (query.data) writeCache("library", query.data); }, [query.data]);
  return query;
}
