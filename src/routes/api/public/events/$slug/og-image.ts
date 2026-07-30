// Gera uma imagem Open Graph horizontal (1200x630) a partir da capa real do
// evento. O WhatsApp tende a ignorar ou cortar mal capas verticais cruas.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/events/$slug/og-image")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: event } = await supabaseAdmin
          .from("events")
          .select("cover_path,cover_mime,is_published,updated_at")
          .eq("slug", params.slug)
          .maybeSingle();

        if (!event || !event.is_published || !event.cover_path) {
          return new Response("Sem capa", { status: 404 });
        }

        const { data: file, error } = await supabaseAdmin.storage
          .from("campaign-media")
          .download(event.cover_path);
        if (error || !file) return new Response("Sem capa", { status: 404 });

        const { createOpenGraphJpeg } = await import("@/lib/og-image.server");
        const image = await createOpenGraphJpeg(file);

        if (!image) {
          return new Response(file, {
            headers: {
              "Content-Type": event.cover_mime || file.type || "image/jpeg",
              "Cache-Control": "public, max-age=3600, s-maxage=86400",
              "Access-Control-Allow-Origin": "*",
              "X-Preview-Image": "original-cover",
            },
          });
        }

        return new Response(image, {
          headers: {
            "Content-Type": "image/jpeg",
            "Content-Length": String(image.byteLength),
            "Cache-Control": "public, max-age=3600, s-maxage=86400",
            "Access-Control-Allow-Origin": "*",
            "X-Preview-Image": "open-graph-1200x630",
            "Last-Modified": event.updated_at ? new Date(event.updated_at).toUTCString() : new Date().toUTCString(),
          },
        });
      },
    },
  },
});
