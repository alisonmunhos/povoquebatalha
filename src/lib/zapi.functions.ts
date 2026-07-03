import { createServerFn } from "@tanstack/react-start";

import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/authz";


export const getZapiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { zapi, hasZapiEnv } = await import("@/integrations/zapi/client.server");
    if (!hasZapiEnv()) {
      return { configured: false as const };
    }
    try {
      const status = await zapi.status();
      return { configured: true as const, ok: true as const, status };
    } catch (e) {
      return {
        configured: true as const,
        ok: false as const,
        error: e instanceof Error ? e.message : "Erro desconhecido",
      };
    }
  });

export const getZapiQr = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { zapi } = await import("@/integrations/zapi/client.server");
    try {
      const r = await zapi.qrCodeImage();
      return { ok: true as const, image: r.value ?? null };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Erro ao buscar QR Code",
      };
    }
  });

export const disconnectZapi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { zapi } = await import("@/integrations/zapi/client.server");

    await zapi.disconnect();
    return { ok: true as const };
  });

const testSendSchema = z.object({
  phone: z.string().min(10),
  message: z.string().min(1).max(1000),
});

export const testSendWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => testSendSchema.parse(d))
  .handler(async ({ data }) => {
    const { zapi } = await import("@/integrations/zapi/client.server");
    const phone = data.phone.replace(/\D+/g, "");
    const r = await zapi.sendText(phone, data.message);
    return { ok: true as const, result: r };
  });

// Retorna configuração da instância (flag inbound_to_inbox_enabled).
export const getInstanceSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("whatsapp_instances")
      .select("inbound_to_inbox_enabled, numero_conectado, status")
      .eq("provider", "zapi")
      .maybeSingle();
    return {
      inbound_to_inbox_enabled: data?.inbound_to_inbox_enabled ?? false,
      numero_conectado: data?.numero_conectado ?? null,
      status: data?.status ?? null,
    };
  });

export const setInstanceInboundEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId)
      .eq("role", "admin").maybeSingle();
    if (!role) throw new Error("Apenas administradores podem alterar esta configuração.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id")
      .eq("provider", "zapi")
      .maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ inbound_to_inbox_enabled: data.enabled })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin
        .from("whatsapp_instances")
        .insert({ provider: "zapi", nome: "Instância principal", inbound_to_inbox_enabled: data.enabled });
    }
    return { ok: true as const, enabled: data.enabled, actor: context.userId };
  });

// Diagnóstico do webhook: mostra último evento recebido, último on-receive
// e URLs prontas para colar no painel Z-API (com token embutido).
export const getWebhookDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: role } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId)
      .eq("role", "admin").maybeSingle();
    if (!role) throw new Error("Apenas administradores podem ver o token de webhook.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: last }, { data: lastReceive }, { data: lastErr }, { data: inst }] = await Promise.all([
      supabaseAdmin.from("webhook_log").select("evento, received_at").order("received_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("webhook_log").select("evento, received_at").eq("evento", "on-receive").order("received_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("webhook_log").select("evento, erro, received_at").not("erro", "is", null).order("received_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("whatsapp_instances").select("status, numero_conectado, last_ping").eq("provider", "zapi").maybeSingle(),
    ]);

    const secret = process.env.ZAPI_WEBHOOK_SECRET ?? "";
    // SEMPRE usa a URL estável de produção — nunca a de preview (que muda a cada build).
    // Fallback: domínio project--<id> (imutável mesmo se o projeto for renomeado).
    const base = "https://povoquebatalha.lovable.app";

    const events = ["on-connect", "on-disconnect", "on-send", "on-delivery", "on-read", "on-receive", "on-message-status"];
    const urls = events.map((ev) => ({
      event: ev,
      url: secret ? `${base}/api/public/zapi/${ev}?token=${secret}` : `${base}/api/public/zapi/${ev}?token=<ZAPI_WEBHOOK_SECRET>`,
    }));

    return {
      base_url: base,
      has_secret: Boolean(secret),
      last_event: last ?? null,
      last_receive: lastReceive ?? null,
      last_error: lastErr ?? null,
      instance: inst ?? null,
      urls,
    };
  });

