// Serve a capa do evento numa URL pública e estável (sem expiração).
// Necessário porque os robôs de pré-visualização de link (WhatsApp, Telegram,
// Facebook) não conseguem ler URLs assinadas temporárias do storage privado.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/events/$slug/cover")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: event } = await supabaseAdmin
          .from("events")
          .select("cover_path,cover_mime,is_published")
          .eq("slug", params.slug)
          .maybeSingle();

        if (!event || !event.is_published || !event.cover_path) {
          return new Response("Sem capa", { status: 404 });
        }

        const { data: file, error } = await supabaseAdmin.storage
          .from("campaign-media")
          .download(event.cover_path);
        if (error || !file) return new Response("Sem capa", { status: 404 });

        return new Response(file, {
          headers: {
            "Content-Type": event.cover_mime || file.type || "image/jpeg",
            "Cache-Control": "public, max-age=3600, s-maxage=86400",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
