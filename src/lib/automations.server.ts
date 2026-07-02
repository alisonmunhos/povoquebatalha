// SERVER-ONLY: dispara automações após um evento e registra em automation_deliveries.
// Chamado a partir dos handlers de rotas públicas (POST /api/public/forms/*).
// Nunca importar de rotas ou *.functions.ts em módulo top-level; use await import(...).

type ContactCtx = {
  id: string;
  nome: string | null;
  phone_e164: string | null;
  cidade?: string | null;
  bairro?: string | null;
  recad_token?: string | null;
  consentimento_whatsapp: boolean | null;
  opt_out_at: string | null;
  arquivado_at?: string | null;
};

function firstName(nome: string | null | undefined): string {
  if (!nome) return "";
  const t = nome.trim().split(/\s+/)[0] ?? "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function renderTemplate(
  body: string,
  ctx: { contact: ContactCtx; origin?: string | null },
): string {
  const c = ctx.contact;
  const origin = ctx.origin ?? "";
  const linkAtual = c.recad_token && origin
    ? `${origin}/atualizacao?t=${c.recad_token}`
    : origin
      ? `${origin}/atualizacao`
      : "";
  const linkInscr = origin ? `${origin}/inscrever` : "";
  const values: Record<string, string> = {
    nome: c.nome ?? "",
    primeiro_nome: firstName(c.nome),
    cidade: c.cidade ?? "",
    bairro: c.bairro ?? "",
    link_atualizacao: linkAtual,
    link_recadastro: linkAtual,
    link_inscricao: linkInscr,
  };
  return body.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, k: string) => {
    return values[k] ?? "";
  });
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

      // Consentimento / opt-out / arquivado
      if (a.require_consent && !contact.consentimento_whatsapp) {
        await supabaseAdmin.from("automation_deliveries").upsert({
          automation_id: a.id, contact_id: contact.id, template_id: a.template_id,
          status: "skipped", error: "Sem consentimento WhatsApp",
        }, { onConflict: "automation_id,contact_id" });
        continue;
      }
      if (contact.opt_out_at || contact.arquivado_at) {
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

      let rendered = renderTemplate(tpl.body, { contact, origin });
      // Anexa o link do template ao corpo (se ainda não estiver presente)
      // para que o WhatsApp gere a prévia da postagem no cliente do contato.
      if (tpl.link && !rendered.includes(tpl.link)) {
        rendered = `${rendered}\n\n${tpl.link}`;
      }

      // Envia via Z-API
      try {
        const { zapi } = await import("@/integrations/zapi/client.server");
        const phone = contact.phone_e164.replace(/^\+/, "");
        const res = await zapi.sendText(phone, rendered);
        const msgId = res.messageId ?? res.zaapId ?? res.id ?? null;
        await supabaseAdmin.from("automation_deliveries").upsert({
          automation_id: a.id, contact_id: contact.id, template_id: tpl.id,
          status: "sent", error: null, zapi_message_id: msgId,
          rendered_body: rendered, sent_at: new Date().toISOString(),
        }, { onConflict: "automation_id,contact_id" });
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        console.error("[automations] falha ao enviar Z-API", {
          eventKey, contactId: contact.id, automationId: a.id, error: err,
        });
        await supabaseAdmin.from("automation_deliveries").upsert({
          automation_id: a.id, contact_id: contact.id, template_id: tpl.id,
          status: "error", error: err, rendered_body: rendered,
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
