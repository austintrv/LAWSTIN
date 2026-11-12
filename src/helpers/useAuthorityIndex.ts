import { useMemo } from "react";
import { buildAuthorityIndex, materialItems, type AuthorityIndex } from "./plainName";
import { useLawstinData } from "./useLawstinData";
import { useStudyLibrary } from "./useStudyLibrary";

/** Authority to plain words, built once per data change from the verified questions and materials. */
export function useAuthorityIndex(): AuthorityIndex {
  const { query } = useLawstinData();
  const library = useStudyLibrary();
  const questions = query.data?.questions, materials = library.data?.materials;
  return useMemo(() => buildAuthorityIndex([...(questions ?? []), ...materialItems(materials ?? [])]), [questions, materials]);
}
