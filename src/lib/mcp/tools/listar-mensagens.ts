// Ferramenta: mensagens recebidas no inbox.
import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "listar_mensagens_recebidas",
  title: "Mensagens recebidas",
  description:
    "Lista as mensagens recebidas pelo WhatsApp, mais recentes primeiro. Pode mostrar só as ainda não lidas.",
  inputSchema: {
    somente_nao_lidas: z.boolean().default(false).describe("Mostrar só as que ainda não foram lidas."),
    limite: z.number().int().min(1).max(100).default(20).describe("Quantas mensagens devolver."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (args, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Chamada não autenticada.");
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("inbound_messages")
      .select("id, from_name, from_phone, conteudo, tipo, received_at, read_at, assigned_to")
      .eq("is_system_event", false)
      .order("received_at", { ascending: false })
      .limit(args.limite);

    if (args.somente_nao_lidas) query = query.is("read_at", null);

    const { data, error } = await query;
    if (error) throw new ToolError(error.message);

    const mensagens = (data ?? []).map((m) => ({
      id: m.id,
      remetente: m.from_name,
      telefone: m.from_phone,
      conteudo: m.conteudo,
      tipo: m.tipo,
      recebida_em: m.received_at,
      lida_em: m.read_at,
      atribuida_a: m.assigned_to,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify({ total: mensagens.length, mensagens }) }],
      structuredContent: { total: mensagens.length, mensagens },
    };
  },
});
