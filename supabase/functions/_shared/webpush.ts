// Web Push (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291),
// written on Web Crypto so it runs in Deno, Node 18+ and browsers with no dependencies.

export type PushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey; subject: string };
export type PushResult = { success: boolean; gone: boolean; statusCode: number; error?: string };

const enc = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;

export function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Bytes {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/** Signed VAPID JWT for the push service's origin. */
export async function vapidJwt(endpoint: string, keys: VapidKeys): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: keys.subject })));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey("jwk", { ...keys.privateJwk, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));
  return `${unsigned}.${b64urlEncode(sig)}`;
}

/** Encrypts a payload for one subscription (aes128gcm, single record). */
export async function encryptPayload(sub: PushSubscription, payload: Uint8Array, salt: Bytes = crypto.getRandomValues(new Uint8Array(16))): Promise<Bytes> {
  const uaPublic = b64urlDecode(sub.keys.p256dh);
  const authSecret = b64urlDecode(sub.keys.auth);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const prkKey = await hmac(authSecret, ecdh);
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = await hmac(prkKey, keyInfo);
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

  const aes = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const padded = concat(payload, new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, padded));

  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** Sends one notification. A 404 or 410 means the device is gone and the subscription should be deleted. */
export async function sendPush(sub: PushSubscription, data: unknown, keys: VapidKeys, ttl = 86400): Promise<PushResult> {
  try {
    const body = await encryptPayload(sub, enc.encode(JSON.stringify(data)));
    const jwt = await vapidJwt(sub.endpoint, keys);
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: String(ttl),
        Urgency: "normal",
        Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
      },
      body,
    });
    const ok = res.status >= 200 && res.status < 300;
    const text = ok ? "" : await res.text().catch(() => "");
    return { success: ok, gone: res.status === 404 || res.status === 410, statusCode: res.status, error: ok ? undefined : text.slice(0, 300) };
  } catch (e) {
    return { success: false, gone: false, statusCode: 0, error: (e as Error).message };
  }
}
