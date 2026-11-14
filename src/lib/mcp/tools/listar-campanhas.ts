// Ferramenta: listar campanhas.
import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "listar_campanhas",
  title: "Listar campanhas",
  description:
    "Lista as campanhas de mensagem, mais recentes primeiro, com contadores de enviados, entregues, lidos e falhas.",
  inputSchema: {
    status: z
      .enum(["draft", "scheduled", "running", "paused", "done", "canceled"])
      .optional()
      .describe("Situação da campanha. 'paused' são as pausadas."),
    limite: z.number().int().min(1).max(50).default(20).describe("Quantas campanhas devolver."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (args, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Chamada não autenticada.");
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("campaigns")
      .select(
        "id, nome, status, tipo, total_destinatarios, total_enviados, total_entregues, total_lidos, total_falhas, created_at, started_at, paused_at, paused_motivo",
      )
      .order("created_at", { ascending: false })
      .limit(args.limite);

    if (args.status) query = query.eq("status", args.status);

    const { data, error } = await query;
    if (error) throw new ToolError(error.message);

    const campanhas = (data ?? []).map((c) => ({
      id: c.id,
      nome: c.nome,
      situacao: c.status,
      tipo: c.tipo,
      destinatarios: c.total_destinatarios,
      enviados: c.total_enviados,
      entregues: c.total_entregues,
      lidos: c.total_lidos,
      falhas: c.total_falhas,
      criada_em: c.created_at,
      iniciada_em: c.started_at,
      pausada_em: c.paused_at,
      motivo_pausa: c.paused_motivo,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify({ total: campanhas.length, campanhas }) }],
      structuredContent: { total: campanhas.length, campanhas },
    };
  },
});
