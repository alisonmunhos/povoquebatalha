// Client-safe: lista canônica de variáveis suportadas e renderização pura para preview.
// Também é reusado pelo motor server-side (`wa-send.server.ts`) para manter uma única fonte
// de verdade sobre quais variáveis existem e como são resolvidas.

export const MESSAGE_VARIABLES = [
  "saudacao",
  "primeiro_nome",
  "primeiro_nome_ou_ola",
  "nome",
  "cidade",
  "bairro",
  "uf",
  "link_atualizacao",
  "link_recadastro",
  "link_inscricao",
] as const;

export type MessageVarName = (typeof MESSAGE_VARIABLES)[number];

export type MessageVarContact = {
  nome?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  uf?: string | null;
  recad_token?: string | null;
};

export type MessageVarOptions = {
  /** Base URL pública (ex.: https://app.example.com); usado nos links. */
  origin?: string | null;
  /** Se true, variáveis desconhecidas viram string vazia. Padrão: false (mantém {{var}} literal). */
  unknownAsEmpty?: boolean;
};

/** Saudação por horário de Brasília (UTC-3). Mantida igual em server e client. */
export function saudacaoBrasil(): string {
  const h = new Date(Date.now() - 3 * 3600 * 1000).getUTCHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

export function renderMessageVars(
  body: string,
  c: MessageVarContact,
  opts: MessageVarOptions = {},
): string {
  const primeiro = (c.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const origin = opts.origin ?? "";
  const linkAtual = c.recad_token && origin
    ? `${origin}/atualizacao?t=${c.recad_token}`
    : origin
      ? `${origin}/atualizacao`
      : "";
  const linkInscr = origin ? `${origin}/inscrever` : "";
  const values: Record<string, string> = {
    nome: c.nome ?? "",
    primeiro_nome: primeiro,
    primeiro_nome_ou_ola: primeiro || "Olá",
    cidade: c.cidade ?? "",
    bairro: c.bairro ?? "",
    uf: c.uf ?? "",
    saudacao: saudacaoBrasil(),
    link_atualizacao: linkAtual,
    link_recadastro: linkAtual,
    link_inscricao: linkInscr,
  };
  return body.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, k: string) => {
    if (Object.prototype.hasOwnProperty.call(values, k)) return values[k];
    return opts.unknownAsEmpty ? "" : m;
  });
}
