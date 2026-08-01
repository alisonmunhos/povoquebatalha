// SERVER-ONLY: dispara automações após um evento e registra em automation_deliveries.
// Chamado a partir dos handlers de rotas públicas (POST /api/public/forms/*).
// Nunca importar de rotas ou *.functions.ts em módulo top-level; use await import(...).
//
// Envio unificado via `sendMessage` (src/lib/wa-send.server.ts). O render de variáveis
// é delegado a `renderVars`; `renderTemplate` permanece exportado como wrapper fino
// apenas para não quebrar chamadas em messages.functions.ts (fase 2 unifica lá também).

import { messageBlockReason } from "@/lib/contact-rules";
import { renderVars, sendMessage, recordWhatsappSendOutcome } from "@/lib/wa-send.server";

type ContactCtx = {
  id: string;
  nome: string | null;
  nome_social?: string | null;
  phone_e164: string | null;
  cidade?: string | null;
  bairro?: string | null;
  recad_token?: string | null;
  consentimento_whatsapp: boolean | null;
  opt_out_at: string | null;
  arquivado_at?: string | null;
};

/**
 * Wrapper de compatibilidade — delega ao renderizador único (`renderVars`).
 * Preserva o comportamento anterior de "variável desconhecida vira string vazia"
 * via `unknownAsEmpty: true`.
 */
export function renderTemplate(
  body: string,
  ctx: { contact: ContactCtx; origin?: string | null },
): string {
  return renderVars(body, ctx.contact, { origin: ctx.origin ?? null, unknownAsEmpty: true });
}

/**
 * Dispara todas as automações ativas para o evento informado.
 * Nunca lança; erros são registrados em automation_deliveries.
 */
export async function triggerAutomationsForEvent(params: {
  eventKey: string;
  contact: ContactCtx;
  origin?: string | null;
}): Promise<void> {
  const { eventKey, contact, origin } = params;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: automations, error: fetchErr } = await supabaseAdmin
      .from("automations")
      .select("id,template_id,active,delay_seconds,require_consent")
      .eq("event_key", eventKey)
      .eq("active", true);

    if (fetchErr) {
      console.error("[automations] falha ao buscar automações", { eventKey, error: fetchErr.message });
      return;
    }
    if (!automations || automations.length === 0) {
      console.log("[automations] nenhuma automação ativa para evento", eventKey);
      return;
    }

    for (const a of automations) {
      // Grava linha "queued" imediatamente para que toda tentativa fique visível
      await supabaseAdmin.from("automation_deliveries").upsert({
        automation_id: a.id, contact_id: contact.id, template_id: a.template_id,
        status: "queued", error: null,
      }, { onConflict: "automation_id,contact_id" });

      // Consentimento / opt-out / arquivado — regras de negócio por automação,
      // aplicadas ANTES de chamar o motor de envio (por isso `skipValidations: true` abaixo).
      if (a.require_consent && !contact.consentimento_whatsapp) {
        await supabaseAdmin.from("automation_deliveries").upsert({
          automation_id: a.id, contact_id: contact.id, template_id: a.template_id,
          status: "skipped", error: "Sem consentimento WhatsApp",
        }, { onConflict: "automation_id,contact_id" });
        continue;
      }
      if (messageBlockReason(contact, { requireConsent: false })) {
        await supabaseAdmin.from("automation_deliveries").upsert({
          automation_id: a.id, contact_id: contact.id, template_id: a.template_id,
          status: "skipped", error: "Contato opt-out/arquivado",
        }, { onConflict: "automation_id,contact_id" });
        continue;
      }
      if (!contact.phone_e164) {
        await supabaseAdmin.from("automation_deliveries").upsert({
          automation_id: a.id, contact_id: contact.id, template_id: a.template_id,
          status: "skipped", error: "Sem telefone normalizado",
        }, { onConflict: "automation_id,contact_id" });
        continue;
      }

      // Idempotência: se já foi enviado, não reenvia
      const { data: existing } = await supabaseAdmin
        .from("automation_deliveries")
        .select("id,status")
        .eq("automation_id", a.id)
        .eq("contact_id", contact.id)
        .maybeSingle();
      if (existing && existing.status === "sent") continue;

      // Carrega template
      const { data: tpl } = await supabaseAdmin
        .from("message_templates")
        .select("id,body,link,active,archived_at")
        .eq("id", a.template_id)
        .maybeSingle();
      if (!tpl || !tpl.active || tpl.archived_at) {
        await supabaseAdmin.from("automation_deliveries").upsert({
          automation_id: a.id, contact_id: contact.id, template_id: a.template_id,
          status: "skipped", error: "Template inativo/arquivado",
        }, { onConflict: "automation_id,contact_id" });
        continue;
      }

      let rendered = renderVars(tpl.body, contact, { origin: origin ?? null, unknownAsEmpty: true });
      // Anexa o link do template ao corpo (se ainda não estiver presente)
      // para que o WhatsApp gere a prévia da postagem no cliente do contato.
      if (tpl.link && !rendered.includes(tpl.link)) {
        rendered = `${rendered}\n\n${tpl.link}`;
      }

      // Envia via motor único. `skipValidations: true` porque já validamos acima
      // com as regras específicas da automação (require_consent, arquivado, etc).
      const result = await sendMessage({
        contact,
        text: rendered,
        textAlreadyRendered: true,
        origin: "automation",
        skipValidations: true,
      });

      await recordWhatsappSendOutcome(contact.id, result);

      if (result.ok) {
        await supabaseAdmin.from("automation_deliveries").upsert({
          automation_id: a.id, contact_id: contact.id, template_id: tpl.id,
          status: "sent", error: null,
          zapi_message_id: result.message_id ?? result.zaap_id ?? null,
          rendered_body: result.rendered_text, sent_at: new Date().toISOString(),
        }, { onConflict: "automation_id,contact_id" });
      } else {
        const err = result.error ?? result.fallback_reason ?? "erro desconhecido";
        console.error("[automations] falha ao enviar", {
          eventKey, contactId: contact.id, automationId: a.id, error: err,
        });
        await supabaseAdmin.from("automation_deliveries").upsert({
          automation_id: a.id, contact_id: contact.id, template_id: tpl.id,
          status: "error", error: err, rendered_body: result.rendered_text,
        }, { onConflict: "automation_id,contact_id" });
      }
    }
  } catch (e) {
    // Não propaga: automações não devem quebrar submissões públicas.
    // Log server-side para diagnóstico via server-function-logs.
    console.error("[triggerAutomationsForEvent] falha", {
      eventKey: params.eventKey,
      contactId: params.contact.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
