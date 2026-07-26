// Web Push com VAPID usando Web Crypto (funciona no Worker do Cloudflare).
// Referências: RFC 8291 (aes128gcm), RFC 8292 (VAPID).

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ---- VAPID JWT signing ----
async function importVapidPrivateKey(privateB64u: string, publicB64u: string): Promise<CryptoKey> {
  const d = b64urlDecode(privateB64u);
  const pub = b64urlDecode(publicB64u); // 65 bytes: 0x04 || X(32) || Y(32)
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: b64urlEncode(d),
    x: b64urlEncode(x),
    y: b64urlEncode(y),
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function signVapidJwt(audience: string, subject: string, publicKey: string, privateKey: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  };
  const encHeader = b64urlEncode(utf8(JSON.stringify(header)));
  const encPayload = b64urlEncode(utf8(JSON.stringify(payload)));
  const toSign = utf8(`${encHeader}.${encPayload}`);
  const key = await importVapidPrivateKey(privateKey, publicKey);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, toSign as BufferSource);
  return `${encHeader}.${encPayload}.${b64urlEncode(sig)}`;
}

// ---- HKDF ----
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, { name: "HKDF" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, key, length * 8);
  return new Uint8Array(bits);
}

// ---- aes128gcm content encoding (RFC 8188) ----
async function encryptPayload(
  payload: string,
  subP256dh: string, // subscriber public key (b64url)
  subAuth: string, // subscriber auth (b64url)
): Promise<{ body: Uint8Array }> {
  const subPub = b64urlDecode(subP256dh); // 65 bytes uncompressed
  const authSecret = b64urlDecode(subAuth);
  const plaintext = utf8(payload);

  // Ephemeral ECDH keypair
  const kp = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const asPubJwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  const asPub = concat(new Uint8Array([0x04]), b64urlDecode(asPubJwk.x!), b64urlDecode(asPubJwk.y!));

  // Import receiver public key
  const recvJwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: b64urlEncode(subPub.slice(1, 33)),
    y: b64urlEncode(subPub.slice(33, 65)),
    ext: true,
  };
  const recvKey = await crypto.subtle.importKey("jwk", recvJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: recvKey }, kp.privateKey, 256);
  const ecdhSecret = new Uint8Array(sharedBits);

  // Salt (random 16)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK_key = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || ua_public || as_public, 32)
  const keyInfo = concat(utf8("WebPush: info\0"), subPub, asPub);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  // CEK and NONCE per RFC 8188
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  // Header: salt(16) || rs(4) || idlen(1) || keyid(asPub)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const header = concat(salt, rs, new Uint8Array([asPub.length]), asPub);

  // Pad: single record — append 0x02 then zero padding (we use just 0x02)
  const record = concat(plaintext, new Uint8Array([0x02]));

  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aesKey, record as BufferSource));

  return { body: concat(header, ct) };
}

export type PushSub = { endpoint: string; p256dh: string; auth: string };

export async function sendWebPush(sub: PushSub, payload: object): Promise<{ ok: boolean; status: number; gone: boolean }> {
  const VAPID_PUB = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIV = process.env.VAPID_PRIVATE_KEY;
  const VAPID_SUB = process.env.VAPID_SUBJECT || "mailto:contato@example.com";
  if (!VAPID_PUB || !VAPID_PRIV) throw new Error("VAPID keys não configuradas");

  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await signVapidJwt(audience, VAPID_SUB, VAPID_PUB, VAPID_PRIV);

  const { body } = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.length),
      TTL: "86400",
      Urgency: "high",
      Authorization: `vapid t=${jwt}, k=${VAPID_PUB}`,
    },
    body: body as BufferSource,
  });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}
