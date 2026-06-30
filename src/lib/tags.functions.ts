import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CATEGORIAS = ["origem", "perfil", "interesse", "prioridade", "restricao", "acao", "territorio", "campanha", "interno"] as const;

export const listTagsWithUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: tags } = await context.supabase
      .from("tags")
      .select("id,nome,cor,categoria,descricao,created_at")
      .order("categoria")
      .order("nome");
    const ids = (tags ?? []).map((t) => t.id);
    let counts: Record<string, number> = {};
    if (ids.length) {
      const { data: rels } = await context.supabase
        .from("contact_tags")
        .select("tag_id")
        .in("tag_id", ids);
      counts = (rels ?? []).reduce<Record<string, number>>((acc, r) => {
        acc[r.tag_id] = (acc[r.tag_id] ?? 0) + 1;
        return acc;
      }, {});
    }
    return { tags: (tags ?? []).map((t) => ({ ...t, usage: counts[t.id] ?? 0 })) };
  });

const tagInputSchema = z.object({
  nome: z.string().trim().min(1).max(60),
  cor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default("#64748b"),
  categoria: z.enum(CATEGORIAS).default("perfil"),
  descricao: z.string().trim().max(400).nullable().optional(),
});

export const upsertTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid().optional() }).and(tagInputSchema).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...payload } = data;
    if (id) {
      const { error } = await context.supabase.from("tags").update(payload).eq("id", id);
      if (error) throw error;
      return { id };
    }
    const { data: row, error } = await context.supabase.from("tags").insert(payload).select("id").single();
    if (error) throw error;
    return { id: row.id };
  });

export const deleteTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), force: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("contact_tags")
      .select("tag_id", { count: "exact", head: true })
      .eq("tag_id", data.id);
    if ((count ?? 0) > 0 && !data.force) {
      throw new Error(`Tag em uso por ${count} contato(s). Remova as associações primeiro ou use Forçar exclusão.`);
    }
    if (data.force) {
      await context.supabase.from("contact_tags").delete().eq("tag_id", data.id);
    }
    const { error } = await context.supabase.from("tags").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });
