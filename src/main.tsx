import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import "./base.css";
import { ThemeModeProvider } from "./helpers/themeMode";
import { TooltipProvider } from "./components/Tooltip";
import { Toaster } from "./components/Toaster";
import { SignIn } from "./components/SignIn";
import { supabase } from "./helpers/supabase";
import LawstinApp from "./pages/_index";

// Safari ignores user-scalable=no; block pinch zoom so the installed app behaves like a native one.
// Double-tap zoom is already off through touch-action: manipulation in base.css.
document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
document.addEventListener("touchmove", (e) => { if ((e as TouchEvent & { scale?: number }).scale !== undefined && (e as TouchEvent & { scale: number }).scale !== 1) e.preventDefault(); }, { passive: false });

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60 * 1000 } } });

/** Keeps a rendering error from leaving a blank screen in the installed app. */
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "var(--background)", color: "var(--foreground)", fontFamily: "var(--font-family-base)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
          <h1 style={{ fontFamily: "var(--font-family-script)", fontStyle: "italic", fontWeight: 400, fontSize: 36, color: "var(--uh-red)" }}>Something went wrong</h1>
          <button onClick={() => window.location.reload()} style={{ height: 48, padding: "0 28px", borderRadius: 14, background: "var(--uh-red)", color: "#fff", fontSize: 17, fontWeight: 600 }}>Reload</button>
        </div>
      </div>
    );
  }
}

function Root() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  return session ? <LawstinApp key={session.user.id} userId={session.user.id} email={session.user.email ?? null} /> : <SignIn />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <TooltipProvider>
          <Boundary><Root /></Boundary>
          <Toaster />
        </TooltipProvider>
      </ThemeModeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
