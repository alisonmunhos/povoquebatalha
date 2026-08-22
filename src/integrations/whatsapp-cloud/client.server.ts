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

  /** Imagem por URL pública (a Meta baixa o arquivo). Caption opcional. */
  sendImage: (phone: string, url: string, caption?: string | null) =>
    graphPost({
      recipient_type: "individual",
      to: normalizeCloudPhone(phone),
      type: "image",
      image: caption ? { link: url, caption } : { link: url },
    }),

  /** Documento por URL pública. `filename` é o nome exibido no WhatsApp. */
  sendDocument: (phone: string, url: string, filename: string, caption?: string | null) =>
    graphPost({
      recipient_type: "individual",
      to: normalizeCloudPhone(phone),
      type: "document",
      document: caption ? { link: url, filename, caption } : { link: url, filename },
    }),

  /** Áudio por URL pública. A Cloud API não aceita caption em áudio. */
  sendAudio: (phone: string, url: string) =>
    graphPost({
      recipient_type: "individual",
      to: normalizeCloudPhone(phone),
      type: "audio",
      audio: { link: url },
    }),

  /**
   * Botões de resposta rápida (máx. 3, título até 20 caracteres cada).
   * Só funciona dentro da janela de 24h — mesma regra do texto livre.
   */
  sendButtons: (
    phone: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
  ) =>
    graphPost({
      recipient_type: "individual",
      to: normalizeCloudPhone(phone),
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: "reply",
            reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
          })),
        },
      },
    }),

  /**
   * Lista clicável (máx. 10 itens no total, distribuídos em seções).
   * `buttonText` é o rótulo do botão que abre a lista (até 20 caracteres).
   */
  sendList: (
    phone: string,
    body: string,
    buttonText: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
  ) =>
    graphPost({
      recipient_type: "individual",
      to: normalizeCloudPhone(phone),
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        action: {
          button: buttonText.slice(0, 20),
          sections: sections.map((s) => ({
            title: s.title.slice(0, 24),
            rows: s.rows.map((r) => ({
              id: r.id.slice(0, 200),
              title: r.title.slice(0, 24),
              ...(r.description ? { description: r.description.slice(0, 72) } : {}),
            })),
          })),
        },
      },
    }),

  /**
   * Template aprovado pela Meta, formato nomeado (`parameter_format: "named"`,
   * mesmo padrão usado em whatsapp-templates.functions.ts). Único jeito de
   * iniciar/reabrir conversa com um contato fora da janela de 24h — texto livre
   * (sendText) é rejeitado pela Meta nesse caso.
   *
   * NOTA: o formato exato do envio de template nomeado (`parameter_name` dentro
   * de cada parâmetro) não está documentado na especificação local
   * (business-messaging-api_v23.0.yaml) — confirmado via SDKs/documentação viva
   * da Meta, não do repositório.
   *
   * `headerParam` carrega nome+valor (não só o valor) porque a Meta exige o
   * `parameter_name` também no parâmetro do cabeçalho — só o texto não é
   * suficiente para montar o payload corretamente.
   */
  sendTemplate: (
    phone: string,
    templateName: string,
    languageCode: string,
    bodyParams: Record<string, string>,
    headerParam?: { name: string; value: string },
  ) =>
    graphPost({
      recipient_type: "individual",
      to: normalizeCloudPhone(phone),
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          ...(headerParam
            ? [
                {
                  type: "header",
                  parameters: [
                    { type: "text", text: headerParam.value, parameter_name: headerParam.name },
                  ],
                },
              ]
            : []),
          {
            type: "body",
            parameters: Object.entries(bodyParams).map(([name, value]) => ({
              type: "text",
              text: value,
              parameter_name: name,
            })),
          },
        ],
      },
    }),
};

/**
 * Baixa uma mídia recebida (a Cloud API entrega só um media ID).
 * Passo 1: consulta a URL temporária; passo 2: baixa o binário com o token.
 */
export async function downloadCloudMedia(mediaId: string): Promise<{
  bytes: Uint8Array;
  mime: string | null;
  size: number | null;
} | null> {
  const env = readEnv();
  const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.token}` },
  });
  if (!metaRes.ok) return null;
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!meta.url) return null;
  const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${env.token}` } });
  if (!binRes.ok) return null;
  const buf = new Uint8Array(await binRes.arrayBuffer());
  return { bytes: buf, mime: meta.mime_type ?? null, size: meta.file_size ?? buf.byteLength };
}


