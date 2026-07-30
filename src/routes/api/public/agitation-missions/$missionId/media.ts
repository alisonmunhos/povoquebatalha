// Serve a imagem da missão de agitação numa URL pública e estável, para que ela
// apareça como capa na pré-visualização do link no WhatsApp.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agitation-missions/$missionId/media")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: mission } = await supabaseAdmin
          .from("agitation_missions")
          .select("media_path,media_mime")
          .eq("id", params.missionId)
          .maybeSingle();

        if (!mission?.media_path) return new Response("Sem imagem", { status: 404 });

        const { data: file, error } = await supabaseAdmin.storage
          .from("campaign-media")
          .download(mission.media_path);
        if (error || !file) return new Response("Sem imagem", { status: 404 });

        return new Response(file, {
          headers: {
            "Content-Type": mission.media_mime || file.type || "image/jpeg",
            "Cache-Control": "public, max-age=3600, s-maxage=86400",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
