import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Metadados públicos de um formulário, usados apenas para a pré-visualização
 * do link (WhatsApp/Telegram). Só formulários ativos.
 */
export const getFormMeta = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: form } = await supabaseAdmin
      .from("form_definitions")
      .select("id,title,is_active")
      .eq("slug", data.slug)
      .maybeSingle();

    if (!form || !form.is_active) {
      return { title: null as string | null, description: null as string | null };
    }

    // A descrição da prévia usa o subtítulo da primeira seção, quando existir.
    const { data: section } = await supabaseAdmin
      .from("form_sections")
      .select("subtitle,position")
      .eq("form_definition_id", form.id)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    const description = (section?.subtitle?.trim() || "").slice(0, 180) || null;

    return { title: form.title ?? null, description };
  });
