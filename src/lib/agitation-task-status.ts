/**
 * Vocabulário único dos status de contato dentro de uma missão de agitação.
 * Usado pela tela do agitador, pelo painel do admin e pelas funções de servidor
 * — para não existirem dois dicionários de status que podem divergir.
 */

export const TASK_STATUS = {
  /** Atribuído (ou auto-atribuído) e o agitador ainda não clicou em nada. */
  SEM_ACAO: "sem_acao",
  /** O agitador clicou em "Vou enviar depois". */
  PENDENTE_ENVIO: "pendente_envio",
  /** O agitador confirmou "Enviei". */
  ENVIADO: "enviado",
  /** "Deu erro / não abriu" — contato arquivado por número inválido. */
  ARQUIVADO_ERRO: "arquivado_erro",
  /** "Não quer receber" — contato arquivado por opt-out. */
  ARQUIVADO_OPTOUT: "arquivado_optout",
} as const;

export type AgitationTaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const AGITATION_TASK_STATUSES: AgitationTaskStatus[] = [
  TASK_STATUS.SEM_ACAO,
  TASK_STATUS.PENDENTE_ENVIO,
  TASK_STATUS.ENVIADO,
  TASK_STATUS.ARQUIVADO_ERRO,
  TASK_STATUS.ARQUIVADO_OPTOUT,
];

/** Status arquivados nunca voltam sozinhos para a fila de atribuição. */
export const ARCHIVED_TASK_STATUSES: AgitationTaskStatus[] = [
  TASK_STATUS.ARQUIVADO_ERRO,
  TASK_STATUS.ARQUIVADO_OPTOUT,
];

export function isArchivedTaskStatus(status: string | null | undefined): boolean {
  return status === TASK_STATUS.ARQUIVADO_ERRO || status === TASK_STATUS.ARQUIVADO_OPTOUT;
}

export const TASK_STATUS_LABEL: Record<string, string> = {
  [TASK_STATUS.SEM_ACAO]: "Não enviado",
  [TASK_STATUS.PENDENTE_ENVIO]: "Vou enviar depois",
  [TASK_STATUS.ENVIADO]: "Enviado",
  [TASK_STATUS.ARQUIVADO_ERRO]: "Arquivado — número com erro",
  [TASK_STATUS.ARQUIVADO_OPTOUT]: "Arquivado — não quer receber",
};


/**
 * Cores: "Pendente de envio" usa laranja sólido, um tom claramente diferente do
 * amarelo claro usado no resto do sistema para a palavra "Pendente".
 */
export const TASK_STATUS_CLASS: Record<string, string> = {
  [TASK_STATUS.SEM_ACAO]: "bg-muted text-muted-foreground",
  [TASK_STATUS.PENDENTE_ENVIO]: "bg-orange-500 text-white",
  [TASK_STATUS.ENVIADO]: "bg-emerald-100 text-emerald-800",
  [TASK_STATUS.ARQUIVADO_ERRO]: "bg-rose-600 text-white",
  [TASK_STATUS.ARQUIVADO_OPTOUT]: "bg-rose-600 text-white",
};

export type TaskStatusFilter = "nao_enviados" | "pendente" | "enviado" | "arquivados";

/**
 * Rótulos únicos usados na tela do agitador, no cartão da missão e no painel do
 * admin — para a mesma coisa nunca ter dois nomes diferentes.
 */
export const TASK_STATUS_FILTERS: { key: TaskStatusFilter; label: string }[] = [
  { key: "nao_enviados", label: "Não enviados" },
  { key: "pendente", label: "Vou enviar depois" },
  { key: "enviado", label: "Enviados" },
  { key: "arquivados", label: "Arquivados" },
];


export function taskStatusFilterKey(status: string | null | undefined): TaskStatusFilter {
  if (isArchivedTaskStatus(status)) return "arquivados";
  if (status === TASK_STATUS.ENVIADO) return "enviado";
  if (status === TASK_STATUS.PENDENTE_ENVIO) return "pendente";
  return "nao_enviados";
}
