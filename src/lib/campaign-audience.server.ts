import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { summarizeEligibility } from "@/lib/contact-rules";
import {
  applyCrmFilters,
  fetchAllPaged,
  resolveRelationalFilterIds,
  type CrmFilters,
} from "@/lib/crm-filters";
import { renderVars } from "@/lib/wa-send.server";

type Db = SupabaseClient<Database>;

export type CampaignAudienceContact = {
  id: string;
  nome: string | null;
  nome_social: string | null;
  phone_e164: string | null;
  phone_whatsapp_candidate: string | null;
  phone_raw: string | null;
  cidade: string | null;
  bairro: string | null;
  uf: string | null;
  consentimento_whatsapp: boolean | null;
  opt_out_at: string | null;
  arquivado_at: string | null;
  lifecycle_status: string | null;
  whatsapp_status: string | null;
};

export type AudienceSource =
  | { ids: string[]; filters?: never; segmentId?: never }
  | { filters: Partial<CrmFilters>; ids?: never; segmentId?: never }
  | { segmentId: string; ids?: never; filters?: never };

const CONTACT_COLUMNS =
  "id,nome,nome_social,phone_e164,phone_whatsapp_candidate,phone_raw,cidade,bairro,uf,consentimento_whatsapp,opt_out_at,arquivado_at,lifecycle_status,whatsapp_status";

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

export async function resolveFilterAudienceIds(db: Db, filters: Partial<CrmFilters>): Promise<string[]> {
  const normalized = filters as CrmFilters;
  const relational = await resolveRelationalFilterIds(db, normalized);
  if (relational.noMatch) return [];

  const rows = await fetchAllPaged<{ id: string }>(() => {
    let query = db.from("contacts").select("id").order("created_at", { ascending: false });
    query = applyCrmFilters(query as never, normalized) as typeof query;
    return query;
  });
  const allowed = relational.allowedIds ? new Set(relational.allowedIds) : null;
  return rows
    .map((row) => row.id)
    .filter((id) => (!allowed || allowed.has(id)) && !relational.excludeIds.has(id));
}

export async function resolveAudienceIds(db: Db, source: AudienceSource): Promise<string[]> {
  if ("ids" in source && source.ids) return uniqueIds(source.ids);
  if ("filters" in source && source.filters) return resolveFilterAudienceIds(db, source.filters);

  const { data: segment, error } = await db
    .from("segments")
    .select("tipo,filtro,member_ids")
    .eq("id", source.segmentId)
    .single();
  if (error) throw error;
  if (segment.tipo === "estatico") return uniqueIds((segment.member_ids as string[] | null) ?? []);
  return resolveFilterAudienceIds(db, (segment.filtro ?? {}) as Partial<CrmFilters>);
}

export async function fetchAudienceContacts(db: Db, ids: string[]): Promise<CampaignAudienceContact[]> {
  const unique = uniqueIds(ids);
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += 120) chunks.push(unique.slice(index, index + 120));

  const contacts: CampaignAudienceContact[] = [];
  for (let index = 0; index < chunks.length; index += 6) {
    const results = await Promise.all(
      chunks.slice(index, index + 6).map((chunk) =>
        db.from("contacts").select(CONTACT_COLUMNS).in("id", chunk),
      ),
    );
    for (const result of results) {
      if (result.error) throw result.error;
      contacts.push(...((result.data ?? []) as CampaignAudienceContact[]));
    }
  }
  return contacts;
}

export async function resolveAudience(db: Db, source: AudienceSource) {
  const ids = await resolveAudienceIds(db, source);
  const contacts = await fetchAudienceContacts(db, ids);
  const summary = summarizeEligibility(contacts, { requireConsent: true });
  return {
    ids,
    contacts,
    eligible: summary.aptos as CampaignAudienceContact[],
    reasons: summary.motivos,
    missing: Math.max(0, ids.length - contacts.length),
  };
}

const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

/**
 * Prévia (só exibição): separa os aptos entre dentro da janela de 24h (texto livre)
 * e fora dela (só entrega com template aprovado + nomeado na campanha).
 */
export async function summarizeSendWindow(
  db: Db,
  contactIds: string[],
  campaignTemplateId: string | null | undefined,
): Promise<{ janelaAberta: number; janelaFechadaComTemplate: number; janelaFechadaSemTemplate: number }> {
  const ids = uniqueIds(contactIds);
  const cutoff = new Date(Date.now() - WINDOW_24H_MS).toISOString();
  const open = new Set<string>();
  for (let index = 0; index < ids.length; index += 120) {
    const chunk = ids.slice(index, index + 120);
    const { data, error } = await db
      .from("inbound_messages")
      .select("contact_id")
      .in("contact_id", chunk)
      .gte("received_at", cutoff);
    if (error) throw error;
    for (const row of data ?? []) if (row.contact_id) open.add(row.contact_id);
  }

  let templateOk = false;
  if (campaignTemplateId) {
    const { data: tpl } = await db
      .from("whatsapp_templates")
      .select("id")
      .eq("id", campaignTemplateId)
      .eq("status", "approved")
      .eq("parameter_format", "named")
      .maybeSingle();
    templateOk = Boolean(tpl);
  }

  const janelaAberta = ids.filter((id) => open.has(id)).length;
  const fechada = ids.length - janelaAberta;
  return {
    janelaAberta,
    janelaFechadaComTemplate: templateOk ? fechada : 0,
    janelaFechadaSemTemplate: templateOk ? 0 : fechada,
  };
}

export function ensureCampaignLink(body: string, linkUrl: string | null | undefined): string {
  if (!linkUrl || body.includes(linkUrl)) return body;
  return `${body}${body.trim() ? "\n\n" : ""}${linkUrl}`;
}

export async function replaceCampaignRecipients(
  db: Db,
  campaign: { id: string; mensagem_template: string; link_url?: string | null },
  contacts: CampaignAudienceContact[],
): Promise<void> {
  const { error: deleteError } = await db.from("campaign_recipients").delete().eq("campaign_id", campaign.id);
  if (deleteError) throw deleteError;

  const rows = contacts.map((contact) => ({
    campaign_id: campaign.id,
    contact_id: contact.id,
    rendered_message: ensureCampaignLink(renderVars(campaign.mensagem_template, contact), campaign.link_url),
    status: "queued" as const,
  }));
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await db.from("campaign_recipients").insert(rows.slice(index, index + 500));
    if (error) throw error;
  }
}