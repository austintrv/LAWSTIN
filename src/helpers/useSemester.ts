import { useMemo } from 'react';
import { useSyncedSetting } from './useSyncedSetting';
import { DEFAULT_SEMESTER, parseSemester, type Semester } from './semester';
import { COURSES, EXAMS, FINALS, type CourseCode } from './studyEngine';
import { SCHOOL_COURSES } from './studyMaterials';
export function applySemester(semester:Semester) {
 for(const c of semester.courses){
  Object.assign(SCHOOL_COURSES[c.code],{name:c.name,short:c.short});
  if(c.kind==='exam'){
   const code=c.code as CourseCode;Object.assign(COURSES[code],{name:c.name,short:c.short});FINALS[code]=c.final??'';
   EXAMS[code]={format:c.format??'essay',notes:c.notes==='closed'?'closed':'open',labels:[c.format==='mc'?'Multiple choice':'Essay',c.notes==='closed'?'Closed book':c.notes==='printed'?'Printed notes':'Open book']};
  }
 }
}
export function useSemester(){
 const setting=useSyncedSetting<Semester>('semester:v1',DEFAULT_SEMESTER);
 const semester=useMemo(()=>parseSemester(setting.value),[setting.value]);
 applySemester(semester);
 return {...setting,value:semester,save:(next:Semester)=>setting.save(parseSemester(next))};
}
