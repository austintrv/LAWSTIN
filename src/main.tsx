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
  return session ? <LawstinApp key={session.user.id} userId={session.user.id} /> : <SignIn />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <TooltipProvider>
          <Root />
          <Toaster />
        </TooltipProvider>
      </ThemeModeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
