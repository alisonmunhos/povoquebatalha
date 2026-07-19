// Diagnóstico TEMPORÁRIO pra descobrir por que o filtro de formas_ajuda (jsonb
// "contém") não bate nenhum contato — testa lado a lado as formas plausíveis
// de montar essa condição contra o Supabase real (mesma sessão autenticada da
// tela BI), pra provar qual sintaxe o PostgREST de fato aceita, em vez de
// adivinhar. Remover depois que a causa for confirmada.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const debugFormasAjuda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const results: Record<string, number | string> = {};

    try {
      const { count, error } = await s
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .contains("formas_ajuda", ["panfletagem_banquinha"]);
      results.contains_metodo_nativo = error ? `erro: ${error.message}` : (count ?? 0);
    } catch (e) {
      results.contains_metodo_nativo = `exception: ${(e as Error).message}`;
    }

    try {
      const { count, error } = await s
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .filter("formas_ajuda", "cs", '["panfletagem_banquinha"]');
      results.cs_colchetes_direto = error ? `erro: ${error.message}` : (count ?? 0);
    } catch (e) {
      results.cs_colchetes_direto = `exception: ${(e as Error).message}`;
    }

    try {
      const { count, error } = await s
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .or('formas_ajuda.cs.["panfletagem_banquinha"]');
      results.cs_colchetes_dentro_or = error ? `erro: ${error.message}` : (count ?? 0);
    } catch (e) {
      results.cs_colchetes_dentro_or = `exception: ${(e as Error).message}`;
    }

    try {
      const { count, error } = await s
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .filter("formas_ajuda", "cs", "{panfletagem_banquinha}");
      results.cs_chaves_direto = error ? `erro: ${error.message}` : (count ?? 0);
    } catch (e) {
      results.cs_chaves_direto = `exception: ${(e as Error).message}`;
    }

    try {
      const { count, error } = await s
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .not("formas_ajuda", "is", null)
        .not("arquivado_at", "is", null);
      results.sanity_check_generico = error ? `erro: ${error.message}` : (count ?? 0);
    } catch (e) {
      results.sanity_check_generico = `exception: ${(e as Error).message}`;
    }

    return { ok: true as const, esperado_nao_arquivados: 27, results };
  });
