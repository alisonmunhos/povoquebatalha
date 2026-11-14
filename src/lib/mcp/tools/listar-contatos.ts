// Ferramenta: listar contatos com filtros.
import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const CAMPOS =
  "id, nome, phone_e164, cidade, uf, origem, lifecycle_status, consentimento_whatsapp, opt_out_at, created_at";

export default defineTool({
  name: "listar_contatos",
  title: "Listar contatos",
  description:
    "Lista contatos da base, mais recentes primeiro, com filtros opcionais por texto (nome, cidade, bairro ou parte do telefone), situação do cadastro e origem.",
  inputSchema: {
    busca: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe("Nome, cidade, bairro ou parte do telefone. Ex.: 'Karen', 'Porto Alegre', '9912'."),
    status: z
      .enum([
        "importado_aguardando_recadastro",
        "link_enviado",
        "recadastro_iniciado",
        "recadastro_concluido",
        "nao_respondeu",
        "telefone_invalido",
        "precisa_revisao",
        "duplicado_possivel",
        "duplicado_mesclado",
        "nao_enviar",
      ])
      .optional()
      .describe("Situação do cadastro no funil."),
    origem: z
      .enum(["recadastro", "inscricao", "import", "manual"])
      .optional()
      .describe("De onde o contato veio."),
    limite: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe("Quantos contatos devolver (1 a 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (args, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Chamada não autenticada.");
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("contacts")
      .select(CAMPOS)
      .order("created_at", { ascending: false })
      .limit(args.limite);

    // Só caracteres que quebram a sintaxe de filtro do PostgREST são removidos.
    const termo = (args.busca ?? "").replace(/[,()%\\]/g, " ").trim();
    if (termo) {
      const digitos = termo.replace(/\D/g, "");
      const base = `nome.ilike.%${termo}%,cidade.ilike.%${termo}%,bairro.ilike.%${termo}%`;
      query = query.or(
        digitos.length >= 3 ? `${base},phone_digits.like.%${digitos}%` : base,
      );
    }

    if (args.status) query = query.eq("lifecycle_status", args.status);
    if (args.origem) query = query.eq("origem", args.origem);

    const { data, error } = await query;
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
