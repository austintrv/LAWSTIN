import { postSettings } from "../endpoints/settings_POST.schema";

// Public half of the notification signing key. The private half lives only in the database.
const VAPID_PUBLIC = "BG5wpMhK8qIZlGXcHOiaGc4h9SMtnBGosykxyOHq8eRdJ0LzXNS3vDQRUn0LUiBfC2gOWEHZfh6LQxk2xcTXzg8";
const STORE = "lawstin-push-identity";

const listeners = new Set<(on: boolean) => void>();
const emit = (on: boolean) => listeners.forEach((l) => l(on));
const read = () => { try { return localStorage.getItem(STORE); } catch { return null; } };
const write = (v: string | null) => { try { if (v) localStorage.setItem(STORE, v); else localStorage.removeItem(STORE); } catch { /* storage unavailable */ } };

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("./");
  if (existing) return existing;
  await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  return navigator.serviceWorker.ready;
}

/** Whether this device currently has an active subscription. */
export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration("./");
  const sub = await reg?.pushManager.getSubscription();
  return !!sub;
}

/** Asks for permission (must run from a tap), subscribes this device and saves it. */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { emit(false); return false; }
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) as BufferSource }));
  const json = sub.toJSON() as Record<string, unknown>;
  await postSettings({ action: "subscribe", subscription: json, previousIdentity: read() });
  write(String(json.endpoint));
  emit(true);
  return true;
}

/** Unsubscribes this device and removes it from the list. */
export async function disablePush(): Promise<void> {
  const reg = pushSupported() ? await navigator.serviceWorker.getRegistration("./") : undefined;
  const sub = await reg?.pushManager.getSubscription();
  const identity = sub?.endpoint ?? read();
  await sub?.unsubscribe();
  await postSettings({ action: "unsubscribe", identity });
  write(null);
  emit(false);
}

/** Calls back with the current state now and whenever it changes. Returns an unsubscribe function. */
export function onPushEnabledChange(cb: (on: boolean) => void): () => void {
  listeners.add(cb);
  isPushEnabled().then(cb).catch(() => cb(false));
  return () => { listeners.delete(cb); };
}
