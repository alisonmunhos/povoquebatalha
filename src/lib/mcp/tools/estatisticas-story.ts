// Ferramenta: uso da página /story, dia por dia.
import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

// Mesmo fuso usado no card de admin: os dias fecham no horário de Brasília.
const FUSO = "America/Sao_Paulo";
const FORMATADOR_DIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default defineTool({
  name: "estatisticas_story",
  title: "Uso da página /story",
  description:
    "Mostra o uso anônimo da página /story: aberturas, fotos escolhidas, compartilhamentos e downloads, somados e dia por dia (horário de Brasília).",
  inputSchema: {
    dias: z
      .number()
      .int()
      .min(1)
      .max(60)
      .default(14)
      .describe("Quantos dias para trás considerar."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (args, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Chamada não autenticada.");
    const supabase = supabaseForUser(ctx);
    const desde = new Date(Date.now() - args.dias * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("story_events")
      .select("event, created_at")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(50000);

    if (error) throw new ToolError(error.message);

    const porDia = new Map<string, Record<string, number>>();
    const totais: Record<string, number> = {};
    for (const row of data ?? []) {
      const dia = FORMATADOR_DIA.format(new Date(row.created_at));
      const linha = porDia.get(dia) ?? {};
      linha[row.event] = (linha[row.event] ?? 0) + 1;
      porDia.set(dia, linha);
      totais[row.event] = (totais[row.event] ?? 0) + 1;
    }

    const dias = [...porDia.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([dia, valores]) => ({ dia, ...valores }));

    const resultado = {
      periodo_dias: args.dias,
      totais,
      compartilhamentos: (totais.compartilhou ?? 0) + (totais.baixou ?? 0),
      por_dia: dias,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(resultado) }],
      structuredContent: { story: resultado },
    };
  },
});
