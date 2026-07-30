import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Metadados públicos da missão usados na pré-visualização do link (título e se
 * existe imagem anexada).
 */
export const getMissionMeta = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ mission_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mission } = await supabaseAdmin
      .from("agitation_missions")
      .select("title,media_path,created_at")
      .eq("id", data.mission_id)
      .maybeSingle();

    return {
      title: mission?.title ?? null,
      hasMedia: Boolean(mission?.media_path),
      imageVersion: mission?.media_path ? `${mission.created_at ?? ""}:${mission.media_path}` : null,
    };
  });
