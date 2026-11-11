import { Suspense, lazy, useEffect, useRef, useState, type ComponentType } from "react";
import { X } from "lucide-react";
import { afterOverlayClose, useBackClose } from "../helpers/useBackClose";
import { useModalFocus } from "../helpers/useModalFocus";
import { COURSES, type CourseCode } from "../helpers/studyEngine";
import layout from "./QuizSession.module.css";
import styles from "../pages/_index.module.css";

export type ToolProps = { course?: CourseCode; arg?: string; onClose: () => void };
const modules = import.meta.glob<{ default: ComponentType<ToolProps> }>("../components/tools/*.tsx");
const tools = Object.fromEntries(Object.entries(modules).map(([path, load]) => [path.split("/").pop()!.replace(/\.tsx$/, ""), lazy(load)]));
export const hasTool = (name: string) => Object.prototype.hasOwnProperty.call(tools, name);
const route = () => window.location.hash.startsWith("#/tool/") ? window.location.hash.split("/").slice(2).map((p) => { try { return decodeURIComponent(p); } catch { return ""; } }) : null;

function ToolFrame({ parts, onClose }: { parts: string[]; onClose: () => void }) {
  const [name, c, arg] = parts, Tool = tools[name];
  const ref = useModalFocus<HTMLDivElement>(!Tool);
  useBackClose(onClose, !Tool, false);
  const course = Object.prototype.hasOwnProperty.call(COURSES, c) ? c as CourseCode : undefined;
  return <div ref={ref} tabIndex={-1} className={styles.toolHost}>
    <Suspense fallback={<div className={layout.modal} role="dialog" aria-modal="true" aria-label="Study tool"><div className={layout.top}><div className={layout.topIn}><span /><span className={layout.examTitle}>Study tool</span><button className={layout.x} aria-label="Close" onClick={onClose}><X size={16} /></button></div></div><div className={styles.empty} role="status">Loading…</div></div>}>
      {Tool ? <Tool course={course} arg={arg} onClose={onClose} /> : <div className={layout.modal} role="dialog" aria-modal="true" aria-label="Study tool"><div className={layout.top}><div className={layout.topIn}><span /><span className={layout.examTitle}>Study tool</span><button className={layout.x} aria-label="Close" onClick={onClose}><X size={16} /></button></div></div><div className={styles.empty}><h2>Tool unavailable</h2></div></div>}
    </Suspense>
  </div>;
}

export function ToolHost() {
  const [parts, setParts] = useState(route);
  const previous = useRef(window.location.hash.startsWith("#/tool/") ? "#/study" : window.location.hash || "#/study");
  const entered = useRef(false);
  useEffect(() => {
    const sync = () => {
      const next = route();
      if (next) entered.current = true; else previous.current = window.location.hash || "#/study";
      setParts(next);
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const close = () => {
    const back = entered.current;
    entered.current = false;
    setParts(null);
    afterOverlayClose(() => {
      if (back) history.back();
      else history.replaceState(null, "", previous.current);
    });
  };
  return parts ? <ToolFrame key={parts.join("/")} parts={parts} onClose={close} /> : null;
}
