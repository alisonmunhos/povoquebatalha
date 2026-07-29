/**
 * Fonte única da verdade das regras de negócio de contato.
 *
 * Toda tela, indicador, filtro ou motor de envio deve consumir estas funções em
 * vez de reescrever a regra. Se uma regra precisar mudar, ela muda AQUI.
 *
 * Regras cobertas:
 *  - C1  contato ativo            → isActiveContact / ACTIVE_CONTACT_COLUMN
 *  - C2  apto a receber mensagem  → messageBlockReason / canReceiveMessage
 *  - C3  qual é o telefone        → bestPhone / sendablePhone / hasPhone
 *  - C5  busca textual            → normalizeSearchTerm
 *
 * Este módulo é puro (sem imports de servidor) — pode ser usado no navegador.
 */

// ============================================================
// C3 — Telefone
// ============================================================

export type ContactPhoneFields = {
  phone_whatsapp_candidate?: string | null;
  phone_e164?: string | null;
  phone_raw?: string | null;
};

/**
 * Número que deve ser EXIBIDO ao usuário.
 * Precedência: candidato de WhatsApp → formatado (E.164) → bruto digitado.
 * Nunca esconde um número que a pessoa cadastrou só porque ele está mal formatado.
 */
export function bestPhone(c: ContactPhoneFields): string | null {
  return c.phone_whatsapp_candidate || c.phone_e164 || c.phone_raw || null;
}

/**
 * Número que pode ser USADO para enviar. Exige formato reconhecido —
 * número bruto inválido não vira disparo (mesma regra do motor de envio).
 */
export function sendablePhone(c: ContactPhoneFields): string | null {
  return c.phone_whatsapp_candidate || c.phone_e164 || null;
}

/** Tem algum telefone cadastrado (mesmo que precise de revisão). */
export function hasPhone(c: ContactPhoneFields): boolean {
  return !!bestPhone(c);
}

// ============================================================
// C1 — Contato ativo
// ============================================================

/** Coluna que define "fora da base". Consultas devem usar `.is(ACTIVE_CONTACT_COLUMN, null)`. */
export const ACTIVE_CONTACT_COLUMN = "arquivado_at" as const;

export type ContactActiveFields = { arquivado_at?: string | null };

/** Contato ativo = não arquivado. Arquivado nunca entra em total, indicador ou envio. */
export function isActiveContact(c: ContactActiveFields): boolean {
  return !c.arquivado_at;
}

// ============================================================
// C2 — Apto a receber mensagem
// ============================================================

export type ContactEligibility = ContactPhoneFields &
  ContactActiveFields & {
    opt_out_at?: string | null;
    lifecycle_status?: string | null;
    consentimento_whatsapp?: boolean | null;
    whatsapp_status?: string | null;
  };

/** Colunas mínimas que uma consulta precisa trazer para decidir elegibilidade. */
export const ELIGIBILITY_COLUMNS =
  "id,phone_whatsapp_candidate,phone_e164,phone_raw,arquivado_at,opt_out_at,lifecycle_status,consentimento_whatsapp,whatsapp_status";

export type BlockCode =
  | "arquivado"
  | "nao_enviar"
  | "opt_out"
  | "sem_consentimento"
  | "whatsapp_indisponivel"
  | "sem_telefone";

export const BLOCK_LABELS: Record<BlockCode, string> = {
  arquivado: "arquivado",
  nao_enviar: "marcado como não enviar",
  opt_out: "opt-out",
  sem_consentimento: "sem consentimento",
  whatsapp_indisponivel: "whatsapp indisponível",
  sem_telefone: "sem telefone",
};

/**
 * Retorna o motivo do bloqueio, ou `null` quando a pessoa pode receber.
 * A ordem dos testes é a mesma usada pelo motor de envio — assim a prévia,
 * o painel e o disparo sempre contam a mesma coisa.
 *
 * @param requireConsent campanhas exigem consentimento; resposta 1:1 no inbox não.
 */
export function messageBlockReason(
  c: ContactEligibility,
  opts: { requireConsent?: boolean } = {},
): BlockCode | null {
  if (c.arquivado_at) return "arquivado";
  if (c.lifecycle_status === "nao_enviar") return "nao_enviar";
  if (c.opt_out_at) return "opt_out";
  if (opts.requireConsent && c.consentimento_whatsapp !== true) return "sem_consentimento";
  if (
    c.whatsapp_status === "invalido" ||
    c.whatsapp_status === "erro_envio" ||
    c.whatsapp_status === "opt_out"
  ) {
    return "whatsapp_indisponivel";
  }
  if (!sendablePhone(c)) return "sem_telefone";
  return null;
}

/** Atalho booleano de `messageBlockReason`. */
export function canReceiveMessage(
  c: ContactEligibility,
  opts: { requireConsent?: boolean } = {},
): boolean {
  return messageBlockReason(c, opts) === null;
}

/** Contagem agregada por motivo de bloqueio — usada por prévia e painel. */
export function summarizeEligibility(
  rows: ContactEligibility[],
  opts: { requireConsent?: boolean } = {},
) {
  const motivos: Record<BlockCode, number> = {
    arquivado: 0,
    nao_enviar: 0,
    opt_out: 0,
    sem_consentimento: 0,
    whatsapp_indisponivel: 0,
    sem_telefone: 0,
  };
  const aptos: ContactEligibility[] = [];
  for (const r of rows) {
    const reason = messageBlockReason(r, opts);
    if (reason) motivos[reason]++;
    else aptos.push(r);
  }
  return { aptos, motivos, total: rows.length };
}

// ============================================================
// C5 — Busca textual
// ============================================================

/**
 * Normaliza o termo de busca do mesmo jeito que a coluna `nome_normalizado`
 * é gravada no banco (minúsculas, sem acento). Buscar "jose" acha "José".
 * Também remove os caracteres que quebram o parser de filtros do PostgREST.
 */
export function normalizeSearchTerm(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[,()"%]/g, " ")
    .trim();
}
