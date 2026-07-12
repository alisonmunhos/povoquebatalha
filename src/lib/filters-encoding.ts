export function decodeBase64UrlSafe<T = unknown>(s?: string): T | null {
  if (!s) return null;
  try {
    const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (base64.length % 4)) % 4;
    const b64 = base64 + "=".repeat(pad);
    const utf8 = atob(b64);
    const json = decodeURIComponent(Array.from(utf8).map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function encodeBase64UrlSafe(obj: unknown): string {
  const json = JSON.stringify(obj);
  const utf8 = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)));
  const b64 = btoa(utf8);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
