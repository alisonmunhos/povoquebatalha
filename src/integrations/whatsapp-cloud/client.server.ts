// WhatsApp Cloud API (Meta) — SERVER ONLY.
// Lê WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID do ambiente em tempo de chamada.
// Nunca importar deste arquivo no client: usar
//   const { whatsappCloud } = await import("@/integrations/whatsapp-cloud/client.server");
// dentro de um handler de server-fn / server route.

const GRAPH_VERSION = "v23.0";

type CloudEnv = { token: string; phoneNumberId: string };

function readEnv(): CloudEnv {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error(
      "WhatsApp Cloud API não configurada: defina WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID.",
    );
  }
  return { token, phoneNumberId };
}

export function hasWhatsappCloudEnv(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export type CloudSendResponse = {
  /** wamid.* devolvido pela Meta. */
  messageId: string | null;
  /** Número normalizado pela Meta (wa_id), quando disponível. */
  waId: string | null;
  raw: unknown;
};

type GraphMessagesResponse = {
  messages?: Array<{ id?: string }>;
  contacts?: Array<{ wa_id?: string; input?: string }>;
  error?: { message?: string; code?: number; error_subcode?: number; type?: string };
};

async function graphPost(body: Record<string, unknown>): Promise<CloudSendResponse> {
  const env = readEnv();
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${env.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });

  const text = await res.text();
  let json: GraphMessagesResponse | null = null;
  if (text) {
    try {
      json = JSON.parse(text) as GraphMessagesResponse;
    } catch {
      json = null;
    }
  }

  if (!res.ok || json?.error) {
    const msg = json?.error?.message ?? `WhatsApp Cloud API HTTP ${res.status}`;
    const code = json?.error?.code != null ? ` (code ${json.error.code})` : "";
    throw new Error(`${msg}${code}`);
  }

  return {
    messageId: json?.messages?.[0]?.id ?? null,
    waId: json?.contacts?.[0]?.wa_id ?? null,
    raw: json,
  };
}

/** Meta espera o número em formato E.164 apenas dígitos, sem "+". */
export function normalizeCloudPhone(phone: string): string {
  return (phone ?? "").replace(/\D+/g, "");
}

export const whatsappCloud = {
  /**
   * Mensagem de texto livre (só válida dentro da janela de 24h de atendimento).
   * `previewUrl` liga a prévia do primeiro link do corpo.
   */
  sendText: (phone: string, body: string, previewUrl = true) =>
    graphPost({
      recipient_type: "individual",
      to: normalizeCloudPhone(phone),
      type: "text",
      text: { preview_url: previewUrl, body },
    }),
};
