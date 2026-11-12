import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeModeProvider } from "../../src/helpers/themeMode";
import { Toaster } from "../../src/components/Toaster";
import ExamHistory from "../../src/components/tools/ExamHistory";
import MissedRules from "../../src/components/tools/MissedRules";
import CloseCalls from "../../src/components/tools/CloseCalls";
import Topic from "../../src/components/tools/Topic";
import Notes from "../../src/components/tools/Notes";
import type { CourseCode } from "../../src/helpers/studyEngine";
import { applyPrefs } from "../../src/helpers/prefs";
import "../../src/base.css";

applyPrefs();
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60000 } } });
function Harness() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => { const sync = () => setHash(location.hash); window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync); }, []);
  const [, , name, c, arg] = hash.split("/");
  const Component = { ExamHistory, MissedRules, CloseCalls, Topic, Notes }[name];
  return Component ? <Component key={name} course={c as CourseCode || undefined} arg={arg ? decodeURIComponent(arg) : undefined} onClose={() => { location.hash = "#/closed"; }} /> : <h1>Tool closed</h1>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}><ThemeModeProvider><Harness /><Toaster /></ThemeModeProvider></QueryClientProvider>);
