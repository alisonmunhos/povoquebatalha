import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Dados públicos mínimos para montar as meta tags de /termos/$slug no servidor.
export const getLegalPageMeta = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().trim().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row } = await supabaseAdmin
        .from("legal_pages")
        .select("title,pdf_url,cover_jpeg_base64")
        .eq("slug", data.slug.toLowerCase())
        .maybeSingle();
      if (!row) return null;
      const r = row as { title: string; pdf_url: string | null; cover_jpeg_base64: string | null };
      return { title: r.title, hasPdf: Boolean(r.pdf_url), hasCover: Boolean(r.pdf_url && r.cover_jpeg_base64) };
    } catch {
      return null;
    }
  });
