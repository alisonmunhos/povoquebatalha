// Regras compartilhadas para sugerir qual contato deve sobreviver a uma mesclagem
// e para explicar a sugestão em linguagem simples. Puro (sem I/O) — usado no
// servidor e no navegador.

export type MergeCandidate = {
  id: string;
  nome: string | null;
  nome_social?: string | null;
  email?: string | null;
  email_secundario?: string | null;
  phone_raw?: string | null;
  phone_e164?: string | null;
  phone_status?: string | null;
  whatsapp_status?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  uf?: string | null;
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  profissao?: string | null;
  observacoes?: string | null;
  origem?: string | null;
  origem_detalhe?: string | null;
  lifecycle_status?: string | null;
  is_system_user?: boolean | null;
  arquivado_at?: string | null;
  consentimento_whatsapp?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

/** Campos que contam como "cadastro preenchido" na hora de escolher o sobrevivente. */
const COMPLETENESS_FIELDS = [
  "nome_social",
  "email",
  "phone_raw",
  "cep",
  "endereco",
  "numero",
  "bairro",
  "cidade",
  "uf",
  "profissao",
  "observacoes",
  "instituicao",
  "rede_social",
  "faixa_etaria",
] as const;

export function completenessScore(c: MergeCandidate): number {
  let score = 0;
  for (const f of COMPLETENESS_FIELDS) {
    const v = c[f];
    if (typeof v === "string" && v.trim() !== "") score += 1;
  }
  if (c.phone_status === "valido") score += 3;
  if (c.whatsapp_status === "confirmado") score += 3;
  if (c.consentimento_whatsapp) score += 1;
  if (c.lifecycle_status === "recadastro_concluido") score += 2;
  return score;
}

function time(v?: string | null): number {
  return v ? new Date(v).getTime() : 0;
}

/**
 * Ordem de preferência para o sobrevivente:
 * 1. Não estar arquivado
 * 2. Ser usuário do sistema (manter o login vinculado)
 * 3. Cadastro mais completo
 * 4. Atualizado mais recentemente
 */
export function suggestSurvivor(list: MergeCandidate[]): MergeCandidate | null {
  if (!list.length) return null;
  return [...list].sort((a, b) => {
    const arch = Number(!!a.arquivado_at) - Number(!!b.arquivado_at);
    if (arch !== 0) return arch;
    const sys = Number(!!b.is_system_user) - Number(!!a.is_system_user);
    if (sys !== 0) return sys;
    const comp = completenessScore(b) - completenessScore(a);
    if (comp !== 0) return comp;
    return time(b.updated_at ?? b.created_at) - time(a.updated_at ?? a.created_at);
  })[0];
}

export function survivorReason(c: MergeCandidate): string {
  const parts: string[] = [];
  if (c.is_system_user) parts.push("é usuário do sistema");
  if (c.whatsapp_status === "confirmado") parts.push("WhatsApp confirmado");
  else if (c.phone_status === "valido") parts.push("telefone válido");
  if (c.lifecycle_status === "recadastro_concluido") parts.push("cadastro concluído");
  if (!parts.length) parts.push("cadastro mais completo");
  return parts.join(", ");
}

/** Rótulo de confiança em português a partir do match_type do banco. */
export const CONFIANCA_LABEL: Record<string, string> = {
  forte: "Alta",
  provavel: "Média",
  possivel: "Baixa",
};

/** Só pedimos a digitação de confirmação quando a confiança é baixa. */
export function requiresTypedConfirmation(matchType?: string | null): boolean {
  return matchType !== "forte" && matchType !== "provavel";
}
