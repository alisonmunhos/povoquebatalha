import { z } from "zod";

export const crmFilterSchema = z.object({
  // Busca geral
  search: z.string().trim().optional(),

  // Localização
  cidade: z.string().trim().optional(),
  bairro: z.string().trim().optional(),
  uf: z.string().trim().length(2).optional(),
  cidades: z.array(z.string()).optional(),
  bairros: z.array(z.string()).optional(),
  ufs: z.array(z.string()).optional(),

  // Perfil
  profissao: z.string().trim().optional(),
  instituicao: z.string().trim().optional(),
  profissoes: z.array(z.string()).optional(),
  coletivo_alicerce: z.boolean().optional(),
  tipo_contato: z.string().optional(),
  tipos_contato: z.array(z.string()).optional(),
  participa_movimento_social: z.boolean().optional(),
  movimentos_sociais: z.array(z.string()).optional(),
  movimento_social_contains: z.string().trim().optional(),

  // Participação
  formas_ajuda: z.array(z.string()).optional(),
  origem: z.string().optional(),
  origens: z.array(z.string()).optional(),
  origem_detalhe: z.string().optional(),
  origem_detalhes: z.array(z.string()).optional(),

  // Origem e captação (Bloco C)
  source_modules: z.array(z.string()).optional(),
  source_form_types: z.array(z.string()).optional(),
  source_user_id: z.string().uuid().optional(),
  sem_origem_rastreada: z.boolean().optional(),
  captado_desde: z.string().optional(),
  captado_ate: z.string().optional(),

  tag_ids: z.array(z.string().uuid()).optional(),
  segment_id: z.string().uuid().optional(),

  // Comunicação
  consent: z.enum(["sim", "nao"]).optional(),
  optOut: z.enum(["sim", "nao"]).optional(),
  bloqueado: z.enum(["sim", "nao"]).optional(),
  archived: z.enum(["sim", "nao", "todos"]).default("nao"),
  phone_status: z.string().optional(),
  phone_statuses: z.array(z.string()).optional(),
  whatsapp_status: z.string().optional(),
  whatsapp_statuses: z.array(z.string()).optional(),
  lifecycle_status: z.string().optional(),
  lifecycle_statuses: z.array(z.string()).optional(),

  // Importação
  import_id: z.string().uuid().optional(),
  import_ids: z.array(z.string().uuid()).optional(),

  // Histórico
  recebeu_campanha_id: z.string().uuid().optional(),
  nao_recebeu_campanha_id: z.string().uuid().optional(),
  erro_campanha_id: z.string().uuid().optional(),
  recebeu_template_id: z.string().uuid().optional(),
  nao_recebeu_template_id: z.string().uuid().optional(),
});
export type CrmFilters = z.infer<typeof crmFilterSchema>;

/** Remove caracteres que quebram o parser de `.or()` do PostgREST. */
function safe(v: string): string {
  return v.replace(/[,()"%]/g, " ").trim();
}

const SEARCH_COLS = [
  "nome",
  "phone_e164",
  "email",
  "profissao",
  "instituicao",
  "observacoes",
  "bairro",
  "cidade",
  "origem_detalhe",
  "movimento_social_nome",
  "formas_ajuda_outro",
];

export function applyCrmFilters<T extends {
  ilike: (col: string, v: string) => T;
  or: (v: string) => T;
  eq: (col: string, v: unknown) => T;
  is: (col: string, v: null) => T;
  not: (col: string, op: string, v: unknown) => T;
  in: (col: string, v: unknown[]) => T;
  contains: (col: string, v: unknown) => T;
  gte: (col: string, v: unknown) => T;
  lte: (col: string, v: unknown) => T;
}>(q: T, f: CrmFilters): T {
  // Arquivados
  if (f.archived === "nao") q = q.is("arquivado_at", null);
  else if (f.archived === "sim") q = q.not("arquivado_at", "is", null);

  // Busca geral em vários campos
  if (f.search) {
    const s = safe(f.search);
    if (s) q = q.or(SEARCH_COLS.map((c) => `${c}.ilike.%${s}%`).join(","));
  }

  // Localização (aceita único e múltiplos)
  if (f.cidade) q = q.ilike("cidade", `%${safe(f.cidade)}%`);
  if (f.cidades?.length) {
    q = q.or(f.cidades.map((v) => `cidade.ilike.${safe(v)}`).join(","));
  }
  if (f.bairro) q = q.ilike("bairro", `%${safe(f.bairro)}%`);
  if (f.bairros?.length) {
    q = q.or(f.bairros.map((v) => `bairro.ilike.${safe(v)}`).join(","));
  }
  if (f.uf) q = q.eq("uf", f.uf.toUpperCase());
  if (f.ufs?.length) q = q.in("uf", f.ufs.map((u) => u.toUpperCase()));

  // Perfil
  if (f.profissao) q = q.ilike("profissao", `%${safe(f.profissao)}%`);
  if (f.instituicao) q = q.ilike("instituicao", `%${safe(f.instituicao)}%`);
  if (f.profissoes?.length) {
    q = q.or(f.profissoes.map((v) => `profissao.ilike.${safe(v)}`).join(","));
  }
  if (typeof f.coletivo_alicerce === "boolean") q = q.eq("coletivo_alicerce", f.coletivo_alicerce);
  if (f.tipo_contato) q = q.eq("tipo_contato", f.tipo_contato);
  if (f.tipos_contato?.length) q = q.in("tipo_contato", f.tipos_contato);
  if (typeof f.participa_movimento_social === "boolean")
    q = q.eq("participa_movimento_social", f.participa_movimento_social);
  if (f.movimentos_sociais?.length) {
    q = q.or(
      f.movimentos_sociais.map((v) => `movimento_social_nome.ilike.${safe(v)}`).join(","),
    );
  }
  if (f.movimento_social_contains) {
    q = q.ilike("movimento_social_nome", `%${safe(f.movimento_social_contains)}%`);
  }

  // Participação
  if (f.formas_ajuda?.length) {
    // Cada opção selecionada vira uma cláusula OR (`formas_ajuda @> [slug]`),
    // expandindo `panfletagem_banquinha` para casar também com o valor legado `panfletagem`.
    const clauses: string[] = [];
    for (const slug of f.formas_ajuda) {
      const variants =
        slug === "panfletagem_banquinha" ? ["panfletagem_banquinha", "panfletagem"] : [slug];
      for (const v of variants) clauses.push(`formas_ajuda.cs.["${v.replace(/"/g, "")}"]`);
    }
    if (clauses.length) q = q.or(clauses.join(","));
  }
  if (f.origem) q = q.eq("origem", f.origem);
  if (f.origens?.length) q = q.in("origem", f.origens);
  if (f.origem_detalhe) q = q.ilike("origem_detalhe", `%${safe(f.origem_detalhe)}%`);
  if (f.origem_detalhes?.length) {
    q = q.or(f.origem_detalhes.map((v) => `origem_detalhe.ilike.${safe(v)}`).join(","));
  }

  // Origem e captação (Bloco C)
  if (f.source_modules?.length) q = q.in("primary_source_module", f.source_modules);
  if (f.source_form_types?.length) q = q.in("source_form_type", f.source_form_types);
  if (f.source_user_id) q = q.eq("created_by_source_user_id", f.source_user_id);
  if (f.sem_origem_rastreada) q = q.is("primary_source_module", null);
  if (f.captado_desde) q = q.gte("source_captured_at", f.captado_desde);
  if (f.captado_ate) q = q.lte("source_captured_at", f.captado_ate);

  // Comunicação
  if (f.consent === "sim") q = q.eq("consentimento_whatsapp", true);
  if (f.consent === "nao") q = q.eq("consentimento_whatsapp", false);
  if (f.optOut === "sim") q = q.not("opt_out_at", "is", null);
  if (f.optOut === "nao") q = q.is("opt_out_at", null);
  if (f.bloqueado === "sim") q = q.eq("lifecycle_status", "nao_enviar" as never);
  if (f.bloqueado === "nao") q = q.not("lifecycle_status", "eq", "nao_enviar");
  if (f.phone_status) q = q.eq("phone_status", f.phone_status);
  if (f.phone_statuses?.length) q = q.in("phone_status", f.phone_statuses);
  if (f.whatsapp_status) q = q.eq("whatsapp_status", f.whatsapp_status);
  if (f.whatsapp_statuses?.length) q = q.in("whatsapp_status", f.whatsapp_statuses);
  if (f.lifecycle_status) q = q.eq("lifecycle_status", f.lifecycle_status);
  if (f.lifecycle_statuses?.length) q = q.in("lifecycle_status", f.lifecycle_statuses);

  // Importação
  if (f.import_id) q = q.eq("import_id", f.import_id);
  if (f.import_ids?.length) q = q.in("import_id", f.import_ids);

  return q;
}
