// Fonte única da verdade para "esse contato já existe na base?".
//
// Regra master (cascata, da maior para a menor confiança):
//   1. Token de recadastro — identidade explícita, o próprio link da pessoa
//   2. WhatsApp normalizado (E.164) — chave primária de identidade do sistema
//   3. WhatsApp pelos 8 últimos dígitos — pega número salvo sem DDI/nono dígito
//   4. E-mail exato (minúsculo, sem espaços)
//
// Nome NUNCA identifica sozinho: quando só o nome bate, registramos um par
// pendente na tela de Duplicidades em vez de fundir automaticamente.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

export type IdentityMatch = {
  id: string;
  phone_e164: string | null;
  email: string | null;
  recad_token: string | null;
  arquivado_at: string | null;
  is_system_user: boolean | null;
  /** Como o contato foi reconhecido. */
  matched_by: "recad_token" | "phone" | "phone_last8" | "email";
};

const SELECT = "id,phone_e164,email,recad_token,arquivado_at,is_system_user";

export function normalizeEmail(email?: string | null): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e.length > 3 && e.includes("@") ? e : null;
}

export function last8(phone?: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : null;
}

export async function resolveExistingContact(
  admin: Admin,
  input: { recad_token?: string | null; phone_e164?: string | null; phone_raw?: string | null; email?: string | null },
): Promise<IdentityMatch | null> {
  const email = normalizeEmail(input.email);

  if (input.recad_token) {
    const { data } = await admin.from("contacts").select(SELECT).eq("recad_token", input.recad_token).maybeSingle();
    if (data) return { ...data, matched_by: "recad_token" };
  }

  if (input.phone_e164) {
    const { data } = await admin
      .from("contacts")
      .select(SELECT)
      .eq("phone_e164", input.phone_e164)
      .order("created_at", { ascending: true })
      .limit(1);
    if (data?.[0]) return { ...data[0], matched_by: "phone" };
  }

  const l8 = last8(input.phone_e164 ?? input.phone_raw);
  if (l8) {
    const { data } = await admin
      .from("contacts")
      .select(SELECT)
      .eq("phone_last8", l8)
      .is("arquivado_at", null)
      .order("created_at", { ascending: true })
      .limit(1);
    if (data?.[0]) return { ...data[0], matched_by: "phone_last8" };
  }

  if (email) {
    const { data } = await admin
      .from("contacts")
      .select(SELECT)
      .ilike("email", email)
      .order("created_at", { ascending: true })
      .limit(1);
    if (data?.[0]) return { ...data[0], matched_by: "email" };
  }

  return null;
}

/**
 * Registra um par pendente de duplicidade (sem fundir nada). Usado quando a
 * entrada pública encontra sinais conflitantes — por exemplo, mesmo e-mail com
 * telefone diferente.
 */
export async function flagPossibleDuplicate(
  admin: Admin,
  a: string,
  b: string,
  reason: string,
  matchType: "forte" | "provavel" | "possivel" = "provavel",
): Promise<void> {
  if (a === b) return;
  const [x, y] = a < b ? [a, b] : [b, a];
  const { data: existing } = await admin
    .from("contact_duplicates")
    .select("id")
    .eq("contact_a", x)
    .eq("contact_b", y)
    .maybeSingle();
  if (existing) return;
  await admin.from("contact_duplicates").insert({ contact_a: x, contact_b: y, match_type: matchType, reason });
}
