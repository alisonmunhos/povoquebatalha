import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff } from "@/lib/authz";
import { promises as dns } from "node:dns";

function isPrivateIPv4(ip: string): boolean {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local (metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    return isPrivateIPv4(v4);
  }
  return false;
}

async function assertPublicUrl(raw: string): Promise<string> {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("URL inválida."); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Apenas URLs http/https são permitidas.");
  }
  const host = parsed.hostname;
  if (!host || host === "localhost") throw new Error("Host não permitido.");
  // Bloqueia literal IPs em faixas privadas antes de resolver
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && isPrivateIPv4(host)) {
    throw new Error("Endereço de destino não permitido.");
  }
  if (host.includes(":") && isPrivateIPv6(host)) {
    throw new Error("Endereço de destino não permitido.");
  }
  try {
    const addrs = await dns.lookup(host, { all: true });
    for (const a of addrs) {
      if (a.family === 4 && isPrivateIPv4(a.address)) throw new Error("private");
      if (a.family === 6 && isPrivateIPv6(a.address)) throw new Error("private");
    }
  } catch (e) {
    if (e instanceof Error && e.message === "private") {
      throw new Error("Endereço de destino não permitido.");
    }
    throw new Error("Falha ao resolver o host.");
  }
  return parsed.toString();
}

export type LinkPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  error?: string;
};

const cache = new Map<string, { at: number; data: LinkPreview }>();
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 50;

function pickMeta(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      return m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    }
  }
  return null;
}

function metaRegex(prop: string): RegExp[] {
  return [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${prop}["']`, "i"),
  ];
}

function absoluteUrl(maybe: string | null, base: string): string | null {
  if (!maybe) return null;
  try {
    return new URL(maybe, base).toString();
  } catch {
    return null;
  }
}

export const fetchLinkPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ url: z.string().trim().url().max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    let url: string;
    try {
      url = await assertPublicUrl(data.url);
    } catch (e) {
      return {
        url: data.url, title: null, description: null, image: null, siteName: null,
        error: e instanceof Error ? e.message : "URL inválida",
      } as LinkPreview;
    }
    const cached = cache.get(url);
    if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

    const empty: LinkPreview = {
      url, title: null, description: null, image: null, siteName: null,
    };

    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 5000);
      const res = await fetch(url, {
        redirect: "manual",
        signal: ctl.signal,
        headers: {
          // UA que costuma servir OG tags completas
          "user-agent":
            "Mozilla/5.0 (compatible; WhatsApp/2.24) AppleWebKit/537.36 (KHTML, like Gecko)",
          "accept": "text/html,application/xhtml+xml",
          "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        const out: LinkPreview = { ...empty, error: `HTTP ${res.status}` };
        return out;
      }
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("html")) {
        const out: LinkPreview = { ...empty, error: "Conteúdo não é HTML" };
        return out;
      }
      // Lê no máximo ~200KB
      const reader = res.body?.getReader();
      let html = "";
      if (reader) {
        const decoder = new TextDecoder();
        let received = 0;
        while (received < 200_000) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          html += decoder.decode(value, { stream: true });
        }
        try { await reader.cancel(); } catch { /* noop */ }
      } else {
        html = await res.text();
      }

      const finalUrl = res.url || url;
      const title =
        pickMeta(html, metaRegex("og:title")) ??
        pickMeta(html, metaRegex("twitter:title")) ??
        (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null);
      const description =
        pickMeta(html, metaRegex("og:description")) ??
        pickMeta(html, metaRegex("twitter:description")) ??
        pickMeta(html, metaRegex("description"));
      const imageRaw =
        pickMeta(html, metaRegex("og:image")) ??
        pickMeta(html, metaRegex("twitter:image"));
      const siteName =
        pickMeta(html, metaRegex("og:site_name")) ??
        (() => { try { return new URL(finalUrl).hostname.replace(/^www\./, ""); } catch { return null; } })();
      const image = absoluteUrl(imageRaw, finalUrl);

      const out: LinkPreview = { url: finalUrl, title, description, image, siteName };
      cache.set(url, { at: Date.now(), data: out });
      if (cache.size > MAX_ENTRIES) {
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
      }
      return out;
    } catch (e) {
      return { ...empty, error: e instanceof Error ? e.message : "Falha ao carregar" };
    }
  });
