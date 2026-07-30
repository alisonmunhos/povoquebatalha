import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Metadados públicos de um formulário, usados apenas para a pré-visualização
 * do link (WhatsApp/Telegram). Só formulários publicados.
 */
export const getFormMeta = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: form } = await supabaseAdmin
      .from("form_definitions")
      .select("title,description,is_published")
      .eq("slug", data.slug)
      .maybeSingle();

    if (!form || !form.is_published) {
      return { title: null as string | null, description: null as string | null };
    }

    return {
      title: form.title ?? null,
      description: (form.description?.trim() || "").slice(0, 180) || null,
    };
  });
