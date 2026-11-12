import { useMemo } from 'react';
import { useSyncedSetting } from './useSyncedSetting';
import { DEFAULT_SEMESTER, parseSemester, configureSemester, type Semester } from './semester';
import { COURSES, EXAMS, FINALS, type CourseCode } from './studyEngine';
import { SCHOOL_COURSES } from './studyMaterials';
export function applySemester(semester:Semester) {
 configureSemester(semester);
 for(const c of semester.courses) Object.assign(SCHOOL_COURSES[c.code],{name:c.name,short:c.short});
}
export function useSemester(){
 const setting=useSyncedSetting<Semester>('semester:v1',DEFAULT_SEMESTER);
 const semester=useMemo(()=>parseSemester(setting.value),[setting.value]);
 applySemester(semester);
 return {...setting,value:semester,save:(next:Semester)=>setting.save(parseSemester(next))};
}
