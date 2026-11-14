// Ferramenta: detalhes de uma campanha.
import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "detalhes_campanha",
  title: "Detalhes de uma campanha",
  description:
    "Mostra uma campanha pelo id: contadores, situação, motivo da pausa (se houver), as 10 últimas falhas e as 10 últimas mensagens enviadas.",
  inputSchema: {
    campanha_id: z.string().uuid().describe("Id da campanha (vem de listar_campanhas)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (args, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Chamada não autenticada.");
    const supabase = supabaseForUser(ctx);

    const { data: campanha, error } = await supabase
      .from("campaigns")
      .select(
        "id, nome, status, tipo, mensagem_template, total_destinatarios, total_enviados, total_entregues, total_lidos, total_falhas, created_at, started_at, paused_at, paused_motivo, canceled_motivo",
      )
      .eq("id", args.campanha_id)
      .maybeSingle();

    if (error) throw new ToolError(error.message);
    if (!campanha) throw new ToolError("Campanha não encontrada ou sem permissão de leitura.");

    const [falhas, enviados] = await Promise.all([
      supabase
        .from("campaign_recipients")
        .select("contact_id, erro, failed_at")
        .eq("campaign_id", args.campanha_id)
        .not("failed_at", "is", null)
        .order("failed_at", { ascending: false })
        .limit(10),
      supabase
        .from("campaign_recipients")
        .select("contact_id, status, sent_at")
        .eq("campaign_id", args.campanha_id)
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false })
        .limit(10),
    ]);

    const primeiraFalha = falhas.error ?? enviados.error;
    if (primeiraFalha) throw new ToolError(primeiraFalha.message);

    const detalhe = {
      id: campanha.id,
      nome: campanha.nome,
      situacao: campanha.status,
      tipo: campanha.tipo,
      mensagem: campanha.mensagem_template,
      destinatarios: campanha.total_destinatarios,
      enviados: campanha.total_enviados,
      entregues: campanha.total_entregues,
      lidos: campanha.total_lidos,
      falhas: campanha.total_falhas,
      criada_em: campanha.created_at,
      iniciada_em: campanha.started_at,
      pausada_em: campanha.paused_at,
      motivo_pausa: campanha.paused_motivo,
      motivo_cancelamento: campanha.canceled_motivo,
      ultimas_falhas: (falhas.data ?? []).map((f) => ({
        contato_id: f.contact_id,
        erro: f.erro,
        quando: f.failed_at,
      })),
      ultimos_envios: (enviados.data ?? []).map((e) => ({
        contato_id: e.contact_id,
        situacao: e.status,
        quando: e.sent_at,
      })),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(detalhe) }],
      structuredContent: { campanha: detalhe },
    };
  },
});
