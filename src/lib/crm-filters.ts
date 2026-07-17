// ⚠️ Ao adicionar um campo novo na ficha de contato, sempre volte aqui:
//   (1) reconhecer no mapeamento de importação CSV (src/lib/imports.functions.ts)
//   (2) adicionar como filtro aqui e em src/components/ContactFiltersPanel.tsx
//   (3) persistir de verdade no commitImport, não só em observações.
import { z } from "zod";

/** Sentinela para "célula vazia" dentro de filtros de array (tags, disponibilidade, etc.). */
export const EMPTY_FILTER_TOKEN = "__EMPTY__";

/** Separa o token de "vazio" dos valores reais de um filtro de array. */
export function splitEmptyToken(arr?: string[] | null): { values: string[]; empty: boolean } {
  if (!arr || !arr.length) return { values: [], empty: false };
  const empty = arr.includes(EMPTY_FILTER_TOKEN);
  return { values: arr.filter((v) => v !== EMPTY_FILTER_TOKEN), empty };
}

export const crmFilterSchema = z.object({
  // Busca geral
  search: z.string().trim().optional(),
  email_contains: z.string().trim().optional(),
  tem_email_secundario: z.enum(["sim", "nao"]).optional(),
  tem_phone_secundario: z.enum(["sim", "nao"]).optional(),

  // Localização
  cidade: z.string().trim().optional(),
  bairro: z.string().trim().optional(),
  uf: z.string().trim().length(2).optional(),
  cidades: z.array(z.string()).optional(),
  bairros: z.array(z.string()).optional(),
  ufs: z.array(z.string()).optional(),

  // Perfil
  nome: z.string().trim().optional(),
  nome_social: z.string().trim().optional(),
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
  disponibilidade: z.array(z.string()).optional(),
  quem_indicou: z.string().trim().optional(),
  faixa_etaria: z.string().optional(),
  faixas_etarias: z.array(z.string()).optional(),
  rede_social: z.string().trim().optional(),
  zona_eleitoral: z.string().trim().optional(),
  como_conheceu: z.string().trim().optional(),
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
  is_system_user: z.enum(["sim", "nao"]).optional(),
  system_roles: z.array(z.string()).optional(),


  tag_ids: z.array(z.string().uuid()).optional(),
  segment_id: z.string().uuid().optional(),

  // Comunicação
  // Comunicação
  apto_envio: z.enum(["sim", "nao"]).optional(),
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
  if (f.ufs?.length) {
    const { values, empty } = splitEmptyToken(f.ufs);
    const upper = values.map((u) => u.toUpperCase());
    if (empty && upper.length) q = q.or(`uf.in.(${upper.map((v) => `"${v}"`).join(",")}),uf.is.null`);
    else if (empty) q = q.is("uf", null);
    else if (upper.length) q = q.in("uf", upper);
  }

  // Perfil
  if (f.nome) q = q.ilike("nome", `%${safe(f.nome)}%`);
  if (f.nome_social) q = q.ilike("nome_social", `%${safe(f.nome_social)}%`);
  if (f.profissao) q = q.ilike("profissao", `%${safe(f.profissao)}%`);
  if (f.instituicao) q = q.ilike("instituicao", `%${safe(f.instituicao)}%`);
  if (f.profissoes?.length) {
    q = q.or(f.profissoes.map((v) => `profissao.ilike.${safe(v)}`).join(","));
  }
  if (typeof f.coletivo_alicerce === "boolean") q = q.eq("coletivo_alicerce", f.coletivo_alicerce);
  if (f.tipo_contato) q = q.eq("tipo_contato", f.tipo_contato);
  if (f.tipos_contato?.length) {
    const { values, empty } = splitEmptyToken(f.tipos_contato);
    if (empty && values.length) q = q.or(`tipo_contato.in.(${values.map((v) => `"${v}"`).join(",")}),tipo_contato.is.null`);
    else if (empty) q = q.is("tipo_contato", null);
    else if (values.length) q = q.in("tipo_contato", values);
  }
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
    const { values, empty } = splitEmptyToken(f.formas_ajuda);
    const clauses: string[] = [];
    for (const slug of values) {
      const variants =
        slug === "panfletagem_banquinha" ? ["panfletagem_banquinha", "panfletagem"] : [slug];
      for (const v of variants) clauses.push(`formas_ajuda.cs.["${v.replace(/"/g, "")}"]`);
    }
    if (empty) {
      clauses.push("formas_ajuda.is.null");
      clauses.push("formas_ajuda->0.is.null");
    }
    if (clauses.length) q = q.or(clauses.join(","));
  }
  if (f.disponibilidade?.length) {
    const { values, empty } = splitEmptyToken(f.disponibilidade);
    const clauses = values.map((slug) => `disponibilidade.cs.["${slug.replace(/"/g, "")}"]`);
    if (empty) {
      clauses.push("disponibilidade.is.null");
      clauses.push("disponibilidade->0.is.null");
    }
    if (clauses.length) q = q.or(clauses.join(","));
  }
  if (f.quem_indicou) q = q.ilike("quem_indicou", `%${safe(f.quem_indicou)}%`);
  if (f.faixa_etaria) q = q.eq("faixa_etaria", f.faixa_etaria);
  if (f.faixas_etarias?.length) {
    const { values, empty } = splitEmptyToken(f.faixas_etarias);
    if (empty && values.length) q = q.or(`faixa_etaria.in.(${values.map((v) => `"${v}"`).join(",")}),faixa_etaria.is.null`);
    else if (empty) q = q.is("faixa_etaria", null);
    else if (values.length) q = q.in("faixa_etaria", values);
  }
  if (f.rede_social) q = q.ilike("rede_social", `%${safe(f.rede_social)}%`);
  if (f.zona_eleitoral) q = q.ilike("zona_eleitoral", `%${safe(f.zona_eleitoral)}%`);
  if (f.como_conheceu) q = q.ilike("como_conheceu", `%${safe(f.como_conheceu)}%`);
  if (f.origem) q = q.eq("origem", f.origem);
  if (f.origens?.length) {
    const { values, empty } = splitEmptyToken(f.origens);
    if (empty && values.length) q = q.or(`origem.in.(${values.map((v) => `"${v}"`).join(",")}),origem.is.null`);
    else if (empty) q = q.is("origem", null);
    else if (values.length) q = q.in("origem", values);
  }
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
  if (f.is_system_user === "sim") q = q.eq("is_system_user", true);
  if (f.is_system_user === "nao") q = q.or("is_system_user.is.null,is_system_user.eq.false");
  if (f.system_roles?.length) q = q.in("system_role", f.system_roles);


  // Comunicação
  if (f.email_contains) q = q.ilike("email", `%${safe(f.email_contains)}%`);
  if (f.tem_email_secundario === "sim") q = q.not("email_secundario", "is", null);
  if (f.tem_email_secundario === "nao") q = q.is("email_secundario", null);
  if (f.tem_phone_secundario === "sim") q = q.not("phone_secundario_raw", "is", null);
  if (f.tem_phone_secundario === "nao") q = q.is("phone_secundario_raw", null);
  // "Apto para envio" = consentimento_whatsapp true, sem opt_out, não bloqueado, telefone válido
  if (f.apto_envio === "sim") {
    q = q.eq("consentimento_whatsapp", true)
         .is("opt_out_at", null)
         .not("lifecycle_status", "eq", "nao_enviar")
         .eq("phone_status", "valido");
  }
  if (f.apto_envio === "nao") {
    q = q.or([
      "consentimento_whatsapp.is.null",
      "consentimento_whatsapp.eq.false",
      "opt_out_at.not.is.null",
      "lifecycle_status.eq.nao_enviar",
      "phone_status.neq.valido",
      "phone_status.is.null",
    ].join(","));
  }

  if (f.consent === "sim") q = q.eq("consentimento_whatsapp", true);
  if (f.consent === "nao") q = q.eq("consentimento_whatsapp", false);
  if (f.optOut === "sim") q = q.not("opt_out_at", "is", null);
  if (f.optOut === "nao") q = q.is("opt_out_at", null);
  if (f.bloqueado === "sim") q = q.eq("lifecycle_status", "nao_enviar" as never);
  if (f.bloqueado === "nao") q = q.not("lifecycle_status", "eq", "nao_enviar");
  if (f.phone_status) q = q.eq("phone_status", f.phone_status);
  if (f.phone_statuses?.length) {
    const { values, empty } = splitEmptyToken(f.phone_statuses);
    if (empty && values.length) q = q.or(`phone_status.in.(${values.map((v) => `"${v}"`).join(",")}),phone_status.is.null`);
    else if (empty) q = q.is("phone_status", null);
    else if (values.length) q = q.in("phone_status", values);
  }
  if (f.whatsapp_status) q = q.eq("whatsapp_status", f.whatsapp_status);
  if (f.whatsapp_statuses?.length) {
    const { values, empty } = splitEmptyToken(f.whatsapp_statuses);
    if (empty && values.length) q = q.or(`whatsapp_status.in.(${values.map((v) => `"${v}"`).join(",")}),whatsapp_status.is.null`);
    else if (empty) q = q.is("whatsapp_status", null);
    else if (values.length) q = q.in("whatsapp_status", values);
  }
  if (f.lifecycle_status) q = q.eq("lifecycle_status", f.lifecycle_status);
  if (f.lifecycle_statuses?.length) {
    const { values, empty } = splitEmptyToken(f.lifecycle_statuses);
    if (empty && values.length) q = q.or(`lifecycle_status.in.(${values.map((v) => `"${v}"`).join(",")}),lifecycle_status.is.null`);
    else if (empty) q = q.is("lifecycle_status", null);
    else if (values.length) q = q.in("lifecycle_status", values);
  }

  // Importação
  if (f.import_id) q = q.eq("import_id", f.import_id);
  if (f.import_ids?.length) q = q.in("import_id", f.import_ids);

  return q;
}
