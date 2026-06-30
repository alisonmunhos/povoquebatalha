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
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores podem desconectar.");
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
