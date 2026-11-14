// Ferramenta: modelos de mensagem.
import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "listar_templates",
  title: "Modelos de mensagem",
  description:
    "Lista os modelos de mensagem guardados no app, com o texto de cada um, para reutilizar em campanhas.",
  inputSchema: {
    categoria: z.string().min(1).max(60).optional().describe("Filtra por categoria."),
    limite: z.number().int().min(1).max(100).default(30).describe("Quantos modelos devolver."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (args, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Chamada não autenticada.");
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("message_templates")
      .select("id, kind, title, category, shortcut, body, active, updated_at")
      .eq("active", true)
      .is("archived_at", null)
      .order("category", { ascending: true })
      .limit(args.limite);

    if (args.categoria) query = query.eq("category", args.categoria);

    const { data, error } = await query;
    if (error) throw new ToolError(error.message);

    const templates = (data ?? []).map((t) => ({
      id: t.id,
      tipo: t.kind,
      titulo: t.title,
      categoria: t.category,
      atalho: t.shortcut,
      texto: t.body,
      atualizado_em: t.updated_at,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify({ total: templates.length, templates }) }],
      structuredContent: { total: templates.length, templates },
    };
  },
});
