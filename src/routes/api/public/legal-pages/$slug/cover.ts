import { createFileRoute } from "@tanstack/react-router";

// Imagem de prévia (og:image) da página com PDF.
export const Route = createFileRoute("/api/public/legal-pages/$slug/cover")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = params.slug.trim().toLowerCase();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("legal_pages")
          .select("cover_jpeg_base64")
          .eq("slug", slug)
          .maybeSingle();
        const b64 = (data as { cover_jpeg_base64?: string | null } | null)?.cover_jpeg_base64;
        if (!b64) return new Response("Sem capa.", { status: 404 });
        return new Response(Buffer.from(b64, "base64"), {
          headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=600" },
        });
      },
    },
  },
});
