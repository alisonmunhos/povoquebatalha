// SERVER-ONLY: dispara automações após um evento e registra em automation_deliveries.
// Chamado a partir dos handlers de rotas públicas (POST /api/public/forms/*).
// Nunca importar de rotas ou *.functions.ts em módulo top-level; use await import(...).
//
// Envio unificado via `sendMessage` (src/lib/wa-send.server.ts). O render de variáveis
// é delegado a `renderVars`; `renderTemplate` permanece exportado como wrapper fino
// apenas para não quebrar chamadas em messages.functions.ts (fase 2 unifica lá também).

import { messageBlockReason, sendablePhone } from "@/lib/contact-rules";
import { renderVars, sendMessage, recordWhatsappSendOutcome, buildVarValues } from "@/lib/wa-send.server";
import { windowState } from "@/lib/inbox-window";
import { extractNamedVars } from "@/lib/whatsapp-templates.functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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
      .select("id,template_id,active,delay_seconds,require_consent,whatsapp_template_id")
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

    // Janela de 24h do WhatsApp (mesma regra do Inbox — src/lib/inbox-window.ts):
    // automação de texto livre só pode ser enviada se o contato já escreveu
    // pra gente nas últimas 24h. Fora da janela a Meta aceita o envio na hora
    // (devolve um wamid) mas rejeita a entrega de verdade de forma assíncrona
    // (erro 131047), então checar aqui evita registrar "sent" indevidamente.
    // Quando a automação tem um template aprovado configurado (whatsapp_template_id),
    // usa ele pra reabrir a conversa fora da janela; sem template configurado,
    // continua pulando o envio como sempre (trySendViaApprovedTemplate abaixo).
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("last_inbound_at")
      .eq("contact_id", contact.id)
      .maybeSingle();
    const inWindow = windowState((conv as { last_inbound_at?: string | null } | null)?.last_inbound_at ?? null).open;

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
      if (!inWindow) {
        const attempted = await trySendViaApprovedTemplate(supabaseAdmin, a, contact);
        if (attempted) continue; // já gravou o resultado (sent/error) em automation_deliveries
        await supabaseAdmin.from("automation_deliveries").upsert({
          automation_id: a.id, contact_id: contact.id, template_id: a.template_id,
          status: "skipped", error: "Fora da janela de 24h do WhatsApp (contato não escreveu recentemente)",
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

/** Substitui {{nome}} pelos valores resolvidos — só pra manter um registro
 * legível em automation_deliveries.rendered_body, não é o que de fato é
 * enviado (a Meta usa os parâmetros nomeados do template aprovado). Mesma
 * lógica de campaign-batch.server.ts::previewTemplateBody. */
function previewTemplateBody(bodyText: string, params: Record<string, string>): string {
  return bodyText.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(params, k) ? params[k] : m,
  );
}

/**
 * Fora da janela de 24h, tenta enviar via template aprovado configurado na
 * automação (a.whatsapp_template_id). Devolve `false` (sem gravar nada) quando
 * não há template configurado ou ele não está mais aprovado/utilizável — o
 * chamador então grava o "skipped" de sempre. Devolve `true` quando de fato
 * tentou enviar (sucesso ou falha), já com o resultado gravado em
 * automation_deliveries — o chamador não deve gravar mais nada nesse caso.
 */
async function trySendViaApprovedTemplate(
  supabaseAdmin: SupabaseClient<Database>,
  a: { id: string; template_id: string; whatsapp_template_id: string | null },
  contact: ContactCtx,
): Promise<boolean> {
  if (!a.whatsapp_template_id) return false;

  const { data: tpl } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("name,language,body_text,header_type,header_text")
    .eq("id", a.whatsapp_template_id)
    .eq("status", "approved")
    .eq("parameter_format", "named")
    .maybeSingle();
  if (!tpl) return false;

  const phone = sendablePhone(contact);
  const values = buildVarValues(contact);
  const bodyVars = extractNamedVars(tpl.body_text);
  const bodyParams: Record<string, string> = {};
  for (const name of bodyVars) bodyParams[name] = values[name] ?? "";
  const rendered = previewTemplateBody(tpl.body_text, bodyParams);
  const headerVar = tpl.header_type === "TEXT" && tpl.header_text ? extractNamedVars(tpl.header_text)[0] : undefined;
  const headerParam = headerVar ? { name: headerVar, value: values[headerVar] ?? "" } : undefined;

  if (!phone) {
    // Não deveria acontecer (telefone já validado antes de chegar aqui), mas
    // sem número não há como enviar — grava erro em vez de tentar mesmo assim.
    await supabaseAdmin.from("automation_deliveries").upsert({
      automation_id: a.id, contact_id: contact.id, template_id: a.template_id,
      status: "error", error: "Sem telefone válido para enviar via template aprovado", rendered_body: rendered,
    }, { onConflict: "automation_id,contact_id" });
    return true;
  }

  try {
    const { whatsappCloud } = await import("@/integrations/whatsapp-cloud/client.server");
    const res = await whatsappCloud.sendTemplate(phone, tpl.name, tpl.language, bodyParams, headerParam);
    await supabaseAdmin.from("automation_deliveries").upsert({
      automation_id: a.id, contact_id: contact.id, template_id: a.template_id,
      status: "sent", error: null, zapi_message_id: res.messageId, rendered_body: rendered,
      sent_at: new Date().toISOString(),
    }, { onConflict: "automation_id,contact_id" });
  } catch (e) {
    const err = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[automations] falha ao enviar via template aprovado", {
      automationId: a.id, contactId: contact.id, whatsappTemplateId: a.whatsapp_template_id, error: err,
    });
    await supabaseAdmin.from("automation_deliveries").upsert({
      automation_id: a.id, contact_id: contact.id, template_id: a.template_id,
      status: "error", error: err, rendered_body: rendered,
    }, { onConflict: "automation_id,contact_id" });
  }
  return true;
}
