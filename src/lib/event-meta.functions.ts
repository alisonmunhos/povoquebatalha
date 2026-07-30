import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Metadados públicos do evento usados apenas para a pré-visualização do link
 * (título, descrição e se existe capa). Somente eventos publicados.
 */
export const getEventMeta = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: event } = await supabaseAdmin
      .from("events")
      .select("title,description,location,starts_at,cover_path,is_published,updated_at")
      .eq("slug", data.slug)
      .maybeSingle();

    if (!event || !event.is_published) {
      return {
        title: null as string | null,
        description: null as string | null,
        hasCover: false,
        imageVersion: null as string | null,
      };
    }

    const quando = new Date(event.starts_at).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    const description =
      (event.description?.trim() || "").slice(0, 180) ||
      [quando, event.location?.trim()].filter(Boolean).join(" · ");

    return {
      title: event.title,
      description,
      hasCover: Boolean(event.cover_path),
      imageVersion: event.cover_path ? `${event.updated_at ?? ""}:${event.cover_path}` : null,
    };
  });
