import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  .handler(async ({ data }) => {
    const url = data.url;
    const cached = cache.get(url);
    if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

    const empty: LinkPreview = {
      url, title: null, description: null, image: null, siteName: null,
    };

    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 5000);
      const res = await fetch(url, {
        redirect: "follow",
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
