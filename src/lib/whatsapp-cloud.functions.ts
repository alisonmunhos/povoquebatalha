import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH_VERSION = "v23.0";

const FIELDS = [
  "display_phone_number",
  "verified_name",
  "quality_rating",
  "code_verification_status",
  "name_status",
  "messaging_limit_tier",
  "account_mode",
].join(",");

export type CloudPhoneStatus =
  | {
      ok: true;
      phone_number_id: string;
      display_phone_number: string | null;
      verified_name: string | null;
      quality_rating: string | null;
      code_verification_status: string | null;
      name_status: string | null;
      messaging_limit_tier: string | null;
      account_mode: string | null;
    }
  | { ok: false; error: string };

/**
 * Saúde do número oficial na WhatsApp Cloud API (Meta).
 * Lê WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID dentro do handler (server-only).
 * Nunca lança: erros voltam como { ok: false, error } para não quebrar a página.
 */
export const getCloudPhoneStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<CloudPhoneStatus> => {
    const token = process.env["WHATSAPP_TOKEN"];
    const phoneNumberId = process.env["WHATSAPP_PHONE_NUMBER_ID"];

    if (!token || !phoneNumberId) {
      return {
        ok: false,
        error:
          "WhatsApp oficial não configurado: faltam os segredos WHATSAPP_TOKEN e/ou WHATSAPP_PHONE_NUMBER_ID.",
      };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}?fields=${FIELDS}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try {
        json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        json = null;
      }

      const err = json?.["error"] as { message?: string; code?: number } | undefined;
      if (!res.ok || err) {
        const msg = err?.message ?? `Meta respondeu HTTP ${res.status}`;
        return { ok: false, error: msg };
      }

      const str = (k: string) => {
        const v = json?.[k];
        return typeof v === "string" ? v : null;
      };

      return {
        ok: true,
        phone_number_id: phoneNumberId,
        display_phone_number: str("display_phone_number"),
        verified_name: str("verified_name"),
        quality_rating: str("quality_rating"),
        code_verification_status: str("code_verification_status"),
        name_status: str("name_status"),
        messaging_limit_tier: str("messaging_limit_tier"),
        account_mode: str("account_mode"),
      };
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof Error
            ? `Não foi possível falar com a Meta: ${e.message}`
            : "Não foi possível falar com a Meta.",
      };
    }
  });
