// SERVER-ONLY: acrescenta uma observação ao campo `contacts.observacoes`,
// preservando tudo que já estava lá (histórico acumulado, nunca sobrescrito).
// Assim a busca geral da Gestão da Base encontra o texto da observação.
//
// Import típico (dentro de handler):
//   const { appendContactObservacao } = await import("@/lib/contact-observacoes.server");

/** Limite do campo (o formulário da ficha valida até 4000 caracteres). */
const MAX_LEN = 4000;

/** Prefixo de data/hora no fuso de Brasília — ex.: "[08/08 11:51]". */
export function stampPrefix(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return `[${parts.day}/${parts.month} ${parts.hour}:${parts.minute}]`;
}

/**
 * Monta o novo conteúdo do campo: entrada nova no fim, separada por quebra de
 * linha, sem duplicar se a linha idêntica já existir. Corta pela frente (mantém
 * as entradas mais recentes) se passar do limite do campo.
 */
export function buildObservacoes(
  current: string | null | undefined,
  note: string,
  date: Date = new Date(),
): string | null {
  const clean = (note ?? "").trim();
  if (!clean) return current ?? null;
  const entry = `${stampPrefix(date)} ${clean}`;
  const base = (current ?? "").trim();
  if (base.split("\n").some((l) => l.trim() === entry)) return base;
  let merged = base ? `${base}\n${entry}` : entry;
  if (merged.length > MAX_LEN) merged = merged.slice(merged.length - MAX_LEN).replace(/^[^\n]*\n/, "");
  return merged;
}

/**
 * Lê o valor atual e grava o acumulado. Best-effort: falha aqui nunca deve
 * derrubar o registro do log de agitação.
 */
export async function appendContactObservacao(
  contactId: string,
  note: string,
  date: Date = new Date(),
): Promise<void> {
  const clean = (note ?? "").trim();
  if (!contactId || !clean) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await supabaseAdmin
      .from("contacts")
      .select("observacoes")
      .eq("id", contactId)
      .maybeSingle();
    const next = buildObservacoes(c?.observacoes ?? null, clean, date);
    if (next === null) return;
    await supabaseAdmin.from("contacts").update({ observacoes: next }).eq("id", contactId);
  } catch (e) {
    console.error("[appendContactObservacao] falha", {
      contactId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
