// Ferramenta: resumo geral da campanha.
import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

const DAY_MS = 24 * 60 * 60 * 1000;

export default defineTool({
  name: "resumo_geral",
  title: "Resumo geral da campanha",
  description:
    "Mostra o total de contatos, os contatos novos dos últimos 7 dias, as campanhas agrupadas por situação, as mensagens recebidas ainda não lidas e o uso da página /story nos últimos 7 dias.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Chamada não autenticada.");
    const supabase = supabaseForUser(ctx);
    const seteDiasAtras = new Date(Date.now() - 7 * DAY_MS).toISOString();

    const [contatos, novos, campanhas, naoLidas, story] = await Promise.all([
      supabase.from("contacts").select("id", { count: "exact", head: true }),
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", seteDiasAtras),
      supabase.from("campaigns").select("status"),
      supabase
        .from("inbound_messages")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
      supabase.from("story_events").select("event").gte("created_at", seteDiasAtras),
    ]);

    const falha = [contatos, novos, campanhas, naoLidas, story].find((r) => r.error);
    if (falha?.error) throw new ToolError(falha.error.message);

    const campanhasPorSituacao: Record<string, number> = {};
    for (const row of campanhas.data ?? []) {
      campanhasPorSituacao[row.status] = (campanhasPorSituacao[row.status] ?? 0) + 1;
    }

    const storyPorEvento: Record<string, number> = {};
    for (const row of story.data ?? []) {
      storyPorEvento[row.event] = (storyPorEvento[row.event] ?? 0) + 1;
    }

    const resumo = {
      contatos_total: contatos.count ?? 0,
      contatos_novos_7_dias: novos.count ?? 0,
      campanhas_por_situacao: campanhasPorSituacao,
      mensagens_nao_lidas: naoLidas.count ?? 0,
      story_7_dias: storyPorEvento,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(resumo) }],
      structuredContent: { resumo },
    };
  },
});
