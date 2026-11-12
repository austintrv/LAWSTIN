export type SemesterCode = 'il' | 'asy' | 'pr' | 'clinic' | 'tutoring';
export type SemesterCourse = {code:SemesterCode;name:string;short:string;kind:'exam'|'workspace';format?:'essay'|'mc';notes?:'closed'|'open'|'printed';final?:string};
export type Semester = {name:string;courses:SemesterCourse[]};
export const DEFAULT_SEMESTER:Semester={name:'Fall 2026',courses:[
 {code:'il',name:'International Law',short:'Intl Law',kind:'exam',format:'essay',notes:'printed',final:'2026-12-02'},
 {code:'asy',name:'Asylum Law',short:'Asylum',kind:'exam',format:'essay',notes:'open',final:'2026-12-07'},
 {code:'pr',name:'Professional Responsibility',short:'Pro Res',kind:'exam',format:'mc',notes:'closed',final:'2026-12-09'},
 {code:'clinic',name:'Civil Clinic',short:'Clinic',kind:'workspace'}, {code:'tutoring',name:'Civil Procedure Tutoring',short:'Tutoring',kind:'workspace'}]};
export function validFinal(value:unknown):value is string {return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value;}
export function parseSemester(value:unknown):Semester {
 let input=value;if(typeof input==='string'){try{input=JSON.parse(input);}catch{input=null;}}
 const obj=input as Partial<Semester>|null;
 return {name:typeof obj?.name==='string' && obj.name.trim()?obj.name.trim():DEFAULT_SEMESTER.name,courses:DEFAULT_SEMESTER.courses.map(base=>{
 const c=Array.isArray(obj?.courses)?obj.courses.find(c=>c?.code===base.code):undefined;
 return {...base,name:typeof c?.name==='string'&&c.name.trim()?c.name.trim():base.name,short:typeof c?.short==='string'&&c.short.trim()?c.short.trim():base.short,
 kind:base.kind,...(base.kind==='exam'?{format:c?.format==='mc'||c?.format==='essay'?c.format:base.format,notes:['closed','open','printed'].includes(c?.notes??'')?c!.notes:base.notes,final:c?.final===''?'':validFinal(c?.final)?c.final:base.final}:{} )};})};
}
