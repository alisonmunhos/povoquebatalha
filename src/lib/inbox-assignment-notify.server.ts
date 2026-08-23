/**
 * Aviso no WhatsApp pessoal da equipe quando uma conversa do Inbox é atribuída
 * ou repassada. Usa templates oficiais (Utility) já aprovados pela Meta:
 *   - inbox_conversa_atribuida_br  {{responsavel}} {{contato}} {{resumo}}
 *   - inbox_conversa_repassada_br  {{responsavel}} {{contato}} {{novo_responsavel}}
 *
 * Regras: nunca lança erro para fora (a atribuição não pode falhar por causa do
 * aviso) e só envia para quem tem contato vinculado com telefone e sem opt-out.
 */
import { whatsappCloud, hasWhatsappCloudEnv } from "@/integrations/whatsapp-cloud/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

const TEMPLATE_ASSIGNED = "inbox_conversa_atribuida_br";
const TEMPLATE_REASSIGNED = "inbox_conversa_repassada_br";

export type NotifyOutcome = { user_id: string; template: string; ok: boolean; error?: string };

function clamp(text: string | null | undefined, max: number, fallback: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

type StaffTarget = { user_id: string; name: string; phone: string | null; blocked: string | null };

/** Resolve nome + WhatsApp da equipe a partir de profiles.contact_id → contacts. */
export async function resolveStaffWhatsapp(supabase: Client, userIds: string[]): Promise<Map<string, StaffTarget>> {
  const out = new Map<string, StaffTarget>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return out;

  const { data: profs } = await supabase
    .from("profiles")
    .select("id, full_name, contact_id")
    .in("id", ids);

  const contactIds = (profs ?? [])
    .map((p) => p.contact_id as string | null)
    .filter((x): x is string => Boolean(x));

  const contactMap = new Map<string, { phone: string | null; opt_out: boolean; nome: string | null }>();
  if (contactIds.length > 0) {
    const { data: cs } = await supabase
      .from("contacts")
      .select("id, nome, phone_e164, phone_whatsapp_candidate, opt_out_at, whatsapp_status")
      .in("id", contactIds);
    for (const c of cs ?? []) {
      const unusable = c.whatsapp_status === "invalido" || c.whatsapp_status === "opt_out";
      contactMap.set(c.id as string, {
        phone: (c.phone_whatsapp_candidate as string | null) ?? (c.phone_e164 as string | null),
        opt_out: Boolean(c.opt_out_at) || unusable,
        nome: c.nome as string | null,
      });
    }
  }

  for (const p of profs ?? []) {
    const contact = p.contact_id ? contactMap.get(p.contact_id as string) : undefined;
    const name = (p.full_name as string | null) ?? contact?.nome ?? "Colega";
    if (!contact) {
      out.set(p.id as string, { user_id: p.id as string, name, phone: null, blocked: "sem_contato_vinculado" });
      continue;
    }
    if (!contact.phone) {
      out.set(p.id as string, { user_id: p.id as string, name, phone: null, blocked: "sem_telefone" });
      continue;
    }
    if (contact.opt_out) {
      out.set(p.id as string, { user_id: p.id as string, name, phone: null, blocked: "opt_out" });
      continue;
    }
    out.set(p.id as string, { user_id: p.id as string, name, phone: contact.phone, blocked: null });
  }
  return out;
}

async function templateLanguage(supabase: Client, name: string): Promise<string | null> {
  const { data } = await supabase
    .from("whatsapp_templates")
    .select("language, status")
    .eq("name", name)
    .maybeSingle();
  if (!data) return null;
  if ((data.status as string) !== "approved") return null;
  return (data.language as string | null) ?? "pt_BR";
}

/**
 * Envia os avisos da atribuição. Retorna o resultado de cada tentativa para
 * registro no histórico da conversa (nunca lança).
 */
export async function notifyConversationAssignment(
  supabase: Client,
  params: {
    actorId: string;
    newAssignee: string | null;
    previousAssignee: string | null;
    contactName: string | null;
    lastMessagePreview: string | null;
  },
): Promise<NotifyOutcome[]> {
  const results: NotifyOutcome[] = [];
  try {
    if (!hasWhatsappCloudEnv()) return results;

    const targets: Array<{ user_id: string; template: string }> = [];
    if (params.newAssignee && params.newAssignee !== params.actorId) {
      targets.push({ user_id: params.newAssignee, template: TEMPLATE_ASSIGNED });
    }
    if (
      params.previousAssignee &&
      params.previousAssignee !== params.newAssignee &&
      params.previousAssignee !== params.actorId
    ) {
      targets.push({ user_id: params.previousAssignee, template: TEMPLATE_REASSIGNED });
    }
    if (targets.length === 0) return results;

    const staff = await resolveStaffWhatsapp(
      supabase,
      [params.newAssignee, params.previousAssignee].filter((x): x is string => Boolean(x)),
    );

    const contato = clamp(params.contactName, 60, "um contato");
    const resumo = clamp(params.lastMessagePreview, 120, "sem mensagem recente");

    for (const t of targets) {
      const person = staff.get(t.user_id);
      if (!person || person.blocked || !person.phone) {
        results.push({ user_id: t.user_id, template: t.template, ok: false, error: person?.blocked ?? "sem_whatsapp" });
        continue;
      }
      const language = await templateLanguage(supabase, t.template);
      if (!language) {
        results.push({ user_id: t.user_id, template: t.template, ok: false, error: "template_nao_aprovado" });
        continue;
      }

      const bodyParams: Record<string, string> =
        t.template === TEMPLATE_ASSIGNED
          ? { responsavel: person.name, contato, resumo }
          : {
              responsavel: person.name,
              contato,
              novo_responsavel: params.newAssignee
                ? (staff.get(params.newAssignee)?.name ?? "outra pessoa")
                : "ninguém",
            };

      try {
        const res = await whatsappCloud.sendTemplate(person.phone, t.template, language, bodyParams);
        results.push({
          user_id: t.user_id,
          template: t.template,
          ok: Boolean(res?.ok),
          ...(res?.ok ? {} : { error: res?.error ?? "falha_no_envio" }),
        });
      } catch (e) {
        results.push({
          user_id: t.user_id,
          template: t.template,
          ok: false,
          error: e instanceof Error ? e.message : "erro_desconhecido",
        });
      }
    }
  } catch (e) {
    results.push({
      user_id: params.newAssignee ?? "-",
      template: "-",
      ok: false,
      error: e instanceof Error ? e.message : "erro_desconhecido",
    });
  }
  return results;
}
