import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Apenas administradores podem desconectar.");
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
    // Verifica papel admin/vrm; RLS já protege, mas mensagem clara ajuda.
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
        .insert({ provider: "zapi", inbound_to_inbox_enabled: data.enabled });
    }
    return { ok: true as const, enabled: data.enabled, actor: context.userId };
  });

