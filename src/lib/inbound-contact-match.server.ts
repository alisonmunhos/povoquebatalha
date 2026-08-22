// SERVER-ONLY: identificação do contato a partir de um número recebido.
//
// Regra única usada por TODOS os recebedores de mensagem (WhatsApp Cloud API e
// o receptor legado da Z-API):
//   1) telefone PRINCIPAL (phone_last8)
//   2) só se não achar nada, telefone SECUNDÁRIO (phone_secundario_last8)
// Em cada etapa, prefere contato não arquivado e atualizado mais recentemente.
//
// Motivo: quando o mesmo número está cadastrado como principal num contato e
// como secundário em outro, a consulta antiga (`.or(...)` + `limit(1)` sem
// ordenação) podia devolver o cadastro errado — a mensagem aparecia no Inbox
// com o nome/telefone de outra pessoa.
//
// Nunca cria contato: mensagem recebida só vincula a quem já existe na base.

type Row = { id: string };

async function findByColumn(
  column: "phone_last8" | "phone_secundario_last8",
  last8: string,
): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq(column, last8)
    .order("arquivado_at", { ascending: true, nullsFirst: true })
    .order("updated_at", { ascending: false })
    .limit(1);
  const rows = (data ?? []) as Row[];
  return rows[0]?.id ?? null;
}

/** Recebe o telefone cru do webhook e devolve o id do contato (ou null). */
export async function matchInboundContactId(phone: string | null | undefined): Promise<string | null> {
  const digits = (phone ?? "").replace(/\D+/g, "");
  if (digits.length < 8) return null;
  const last8 = digits.slice(-8);
  return (await findByColumn("phone_last8", last8)) ?? (await findByColumn("phone_secundario_last8", last8));
}
