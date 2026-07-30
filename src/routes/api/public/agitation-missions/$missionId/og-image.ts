// Gera uma imagem Open Graph horizontal (1200x630) a partir da mídia real da
// missão, mantendo a prévia do WhatsApp consistente com eventos.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agitation-missions/$missionId/og-image")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: mission } = await supabaseAdmin
          .from("agitation_missions")
          .select("media_path,media_mime,created_at")
          .eq("id", params.missionId)
          .maybeSingle();

        if (!mission?.media_path) return new Response("Sem imagem", { status: 404 });

        const { data: file, error } = await supabaseAdmin.storage
          .from("campaign-media")
          .download(mission.media_path);
        if (error || !file) return new Response("Sem imagem", { status: 404 });

        const { createOpenGraphJpeg } = await import("@/lib/og-image.server");
        const image = await createOpenGraphJpeg(file);

        if (!image) {
          return new Response(file, {
            headers: {
              "Content-Type": mission.media_mime || file.type || "image/jpeg",
              "Cache-Control": "public, max-age=3600, s-maxage=86400",
              "Access-Control-Allow-Origin": "*",
              "X-Preview-Image": "original-media",
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
            "Last-Modified": mission.created_at ? new Date(mission.created_at).toUTCString() : new Date().toUTCString(),
          },
        });
      },
    },
  },
});
