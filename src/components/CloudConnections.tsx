import React, { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { supabase, SUPABASE_URL } from "../helpers/supabase";
import { applyPrefs } from "../helpers/prefs";
import styles from "./CloudConnections.module.css";

const API = `${SUPABASE_URL}/functions/v1/course-cloud`;
const MCP = `${API}/mcp`;
type Status = { quiz_ready: boolean; drive_configured: boolean; oauth_discovery_ready: boolean; chatgpt_plugin_url?: string | null };
async function api(path: string, body?: object) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Sign in to LAWSTIN first.");
  const response = await fetch(API + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Couldn’t reach the connection.");
  return result;
}
function redirectToClient(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("The app returned an unsupported redirect URL.");
  window.location.assign(url.href);
}

export function CloudConnections() {
  const authorizationId = new URLSearchParams(window.location.search).get("authorization_id");
  const [status, setStatus] = useState<Status | null>(null);
  const [consent, setConsent] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [source, setSource] = useState("");
  const [bridgeUrl, setBridgeUrl] = useState("");
  const load = async () => {
    setBusy("status"); setError("");
    try { setStatus(await api("/setup/status")); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(""); }
  };
  useEffect(() => {
    applyPrefs();
    if (!authorizationId) { void load(); return; }
    let active = true;
    setBusy("consent");
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) throw error || new Error("This connection request expired. Start it again from your AI app.");
      if ("redirect_url" in data) redirectToClient(data.redirect_url);
      else setConsent(data);
    }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setBusy(""); });
    return () => { active = false; };
  }, [authorizationId]);

  const decision = async (approve: boolean) => {
    if (!authorizationId || busy) return;
    setBusy("consent"); setError("");
    try {
      const { data, error } = approve ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true }) : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (error || !data) throw error || new Error("Couldn’t finish connecting.");
      redirectToClient(data.redirect_url);
    } catch (error) { setError((error as Error).message); setBusy(""); }
  };
  const copy = async (value: string, message: string) => {
    await navigator.clipboard.writeText(value);
    setNotice(message);
  };
  const copySetup = async () => {
    setBusy("script"); setError(""); setNotice("");
    let readySource = source;
    try {
      if (source) await copy(source, "Setup code copied.");
      else {
        const pending = api("/setup/script", { action: "generate" }).then(data => { readySource = data.source; setSource(data.source); return data.source as string; });
        if (window.ClipboardItem && navigator.clipboard.write) {
          await navigator.clipboard.write([new ClipboardItem({ "text/plain": pending.then(text => new Blob([text], { type: "text/plain" })) })]);
          setNotice("Setup code copied.");
        } else await copy(await pending, "Setup code copied.");
      }
    } catch (error) { setError(readySource ? "The code is ready. Click Copy setup code again, or select it below and copy it." : (error as Error).message); }
    finally { setBusy(""); }
  };
  const connectDrive = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy("drive"); setError(""); setNotice("");
    try { await api("/setup/bridge", { url: bridgeUrl.trim() }); setBridgeUrl(""); setNotice("Google Drive connected."); await load(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(""); }
  };
  return <main className={styles.page}>
    <header className={styles.bar}>
      {!authorizationId && <button aria-label="Back to LAWSTIN" onClick={() => { window.location.hash = "/settings"; }}><ArrowLeft size={20} /></button>}
      <span>LAWSTIN</span>
    </header>
    <div className={styles.content}>
      <div className={styles.heading}><span className={styles.symbol}>{authorizationId ? <ShieldCheck size={26} /> : <Link2 size={26} />}</span><h1>{authorizationId ? "Connect to LAWSTIN" : "Connected apps"}</h1></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status"><Check size={18} />{notice}</p>}
      {authorizationId ? <section className={`${styles.card} ${styles.consent}`}>
        {busy === "consent" && !consent ? <p>Loading connection request…</p> : consent && <>
          <h2>{consent.client.name || "AI app"} wants to connect</h2>
          <p>This gives the app access to your LAWSTIN account, including saved quiz questions and progress, and the five course handoffs connected through Google Drive.</p>
          <ul><li>Ask saved questions and explain your answers.</li><li>Record answers in LAWSTIN’s progress and review schedule.</li><li>Read and update shared course handoffs.</li></ul>
          {consent.scope && <p className={styles.scopes}>Account permissions: {consent.scope.split(" ").join(", ")}</p>}
          <div className={styles.actions}><button className={styles.secondary} disabled={!!busy} onClick={() => void decision(false)}>Cancel</button><button className={styles.primary} disabled={!!busy} onClick={() => void decision(true)}>{busy ? "Connecting…" : "Allow connection"}</button></div>
        </>}
        {!consent && !busy && <a className={styles.secondary} href="./#/connect">Back to connected apps</a>}
      </section> : <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHeading}><h2>Chat quizzes</h2><span className={styles.pending}>{status ? (status.oauth_discovery_ready ? "Connect an app" : "Finish sign-in setup") : "Checking"}</span></div>
          <p>Ask ChatGPT or Claude to quiz you from LAWSTIN. Saved answers count toward your usual progress and review schedule.</p>
          <blockquote>“Quiz me on International Law from LAWSTIN and save my answers.”</blockquote>
          <label className={styles.field}><span>Connection URL</span><input readOnly value={MCP} aria-label="LAWSTIN connection URL" /></label>
          <button className={styles.secondary} onClick={() => void copy(MCP, "Connection URL copied.").catch(() => setError("Select the connection URL above and copy it."))}><Copy size={16} />Copy connection URL</button>
          {status?.chatgpt_plugin_url?.startsWith("https://chatgpt.com/plugins/") && <a className={styles.secondary} style={{ marginTop: 12 }} href={status.chatgpt_plugin_url} target="_blank" rel="noopener noreferrer">Open LAWSTIN in ChatGPT<ExternalLink size={15} /></a>}
          <details><summary>Connect Claude</summary><ol><li>Open Claude’s Customize → Connectors.</li><li>Add a custom connector named LAWSTIN and paste the connection URL.</li><li>Connect it and sign in to LAWSTIN when asked. Approve the connection.</li><li>Start a new cloud chat and ask for a LAWSTIN quiz.</li></ol></details>
          <details open={!status?.oauth_discovery_ready}><summary>Cloud sign-in setup</summary><p>In Supabase, open Authentication → OAuth Server. Enable the OAuth server and Dynamic Client Registration. Set Authorization Path to <code>/</code>.</p><p>Under Authentication → URL Configuration, set Site URL to <code>https://austintrv.github.io/LAWSTIN</code>.</p><a className={styles.secondary} href="https://supabase.com/dashboard/project/vbqfmgsrxurdazujbbuk" target="_blank" rel="noopener noreferrer">Open LAWSTIN’s Supabase project<ExternalLink size={15} /></a><p>{status?.oauth_discovery_ready ? "OAuth discovery is available. A successful connection in your AI app verifies the full sign-in flow." : "After saving those settings, use Refresh below."}</p></details>
          <button className={styles.textButton} disabled={!!busy} onClick={() => void load()}><RefreshCw size={16} />Refresh connection status</button>
        </section>
        <section className={styles.card}>
          <div className={styles.cardHeading}><h2>Course handoffs in Drive</h2><span className={status?.drive_configured ? styles.ready : styles.pending}>{status?.drive_configured ? "Connected" : "Setup needed"}</span></div>
          <p>Your five existing course memories stay in Drive. A small Google-hosted script lets the cloud connector reach them while your Mac is off.</p>
          <ol className={styles.steps}>
            <li><a className={styles.secondary} href="https://script.google.com/home/start" target="_blank" rel="noopener noreferrer">Open Google Apps Script<ExternalLink size={15} /></a><p>Create a project named LAWSTIN Course Handoffs, using the Google account that holds UHLC 2L FALL.</p></li>
            <li><button className={styles.secondary} disabled={!!busy} onClick={() => void copySetup()}><Copy size={16} />{busy === "script" ? "Preparing…" : "Copy setup code"}</button><p>Replace the editor’s starter code with this code, then save. Paste it only into your own Google Apps Script project.</p>{source && <details><summary>View setup code</summary><textarea readOnly value={source} aria-label="Private Google setup code" /></details>}</li>
            <li><p>Choose <b>Deploy → New deployment → Web app</b>. Set <b>Execute as: Me</b> and <b>Who has access: Anyone</b>. Google will ask you to authorize your own script. Only signed LAWSTIN requests can use the connection.</p></li>
            <li><form onSubmit={connectDrive}><label className={styles.field}><span>Google deployment URL ending in /exec</span><input type="url" value={bridgeUrl} onChange={event => setBridgeUrl(event.target.value)} required autoComplete="off" /></label><button className={styles.primary} disabled={!!busy || !bridgeUrl.trim()}>{busy === "drive" ? "Connecting…" : "Connect Drive"}</button></form></li>
          </ol>
        </section>
      </div>}
    </div>
  </main>;
}
