// Ferramenta: achar contato por telefone.
import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "buscar_contato",
  title: "Achar contato por telefone",
  description:
    "Procura contatos pelo número de telefone, com ou sem DDI/DDD e com qualquer formatação. Devolve no máximo 5 resultados.",
  inputSchema: {
    telefone: z
      .string()
      .min(6)
      .max(20)
      .describe("Número de telefone. Ex.: '51991234567', '+55 51 99123-4567'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (args, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Chamada não autenticada.");
    const digitos = args.telefone.replace(/\D/g, "");
    if (digitos.length < 6) throw new ToolError("Informe pelo menos 6 dígitos de telefone.");

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, nome, phone_e164, cidade, uf, origem, lifecycle_status, consentimento_whatsapp, opt_out_at, created_at",
      )
      .or(`phone_digits.eq.${digitos},phone_digits.like.%${digitos},phone_e164.eq.${digitos}`)
      .limit(5);

    if (error) throw new ToolError(error.message);

    const contatos = (data ?? []).map((c) => ({
      id: c.id,
      nome: c.nome,
      telefone: c.phone_e164,
      cidade: c.cidade,
      uf: c.uf,
      origem: c.origem,
      situacao: c.lifecycle_status,
      consentimento_whatsapp: c.consentimento_whatsapp,
      opt_out_em: c.opt_out_at,
      criado_em: c.created_at,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify({ total: contatos.length, contatos }) }],
      structuredContent: { total: contatos.length, contatos },
    };
  },
});
