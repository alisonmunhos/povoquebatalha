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

/**
 * Flow genérico e reutilizável de múltipla escolha (componente CheckboxGroup),
 * publicado manualmente no WhatsApp Manager — ver docs/whatsapp-flow-checkbox-setup.md.
 * Ausente = o motor de fluxos cai automaticamente no método antigo (lista tocável).
 */
export function getCheckboxFlowId(): string | null {
  const id = process.env.WHATSAPP_CHECKBOX_FLOW_ID;
  return id && id.trim() ? id.trim() : null;
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
   * WhatsApp Flow de múltipla escolha (componente CheckboxGroup) — abre uma
   * tela com todas as opções da pergunta, marcáveis de uma vez só, em vez da
   * lista tocável item a item. `flowId` é o Flow genérico publicado no
   * WhatsApp Manager (ver docs/whatsapp-flow-checkbox-setup.md);
   * `flowToken` identifica a sessão/etapa que gerou o envio, pra conferir a
   * resposta depois. `question`/`options` viram o dado inicial da tela.
   */
  sendFlowCheckbox: (
    phone: string,
    body: string,
    args: {
      flowId: string;
      flowToken: string;
      question: string;
      options: Array<{ id: string; title: string }>;
      cta?: string;
      screenId?: string;
    },
  ) =>
    graphPost({
      recipient_type: "individual",
      to: normalizeCloudPhone(phone),
      type: "interactive",
      interactive: {
        type: "flow",
        body: { text: body },
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_token: args.flowToken,
            flow_id: args.flowId,
            flow_cta: (args.cta ?? "Continuar").slice(0, 30),
            flow_action: "navigate",
            flow_action_payload: {
              screen: args.screenId ?? "CHECKBOX",
              data: {
                question: args.question,
                options: args.options,
              },
            },
          },
        },
      },
    }),

  /**
   * Reação com emoji a uma mensagem (Cloud API oficial, `type: "reaction"`).
   * `messageId` é o wa_id da mensagem ALVO (ex.: wamid.HBg...). Passar emoji
   * vazio ("") REMOVE a reação anterior. Só funciona enquanto a janela de
   * conversa estiver aberta — mensagens de texto livre/reação fora da janela
   * de 24h são rejeitadas pela Meta.
   */
  sendReaction: (phone: string, messageId: string, emoji: string) =>
    graphPost({
      recipient_type: "individual",
      to: normalizeCloudPhone(phone),
      type: "reaction",
      reaction: {
        message_id: messageId,
        emoji,
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
type CloudMediaFile = { bytes: Uint8Array; mime: string | null; size: number | null };

/** Uma tentativa de download. A URL de mídia da Meta (meta.url) expira rápido
 * — por isso cada tentativa refaz os dois passos (metadata + binário) do
 * zero, em vez de reaproveitar uma URL de uma tentativa anterior. */
async function downloadCloudMediaOnce(mediaId: string): Promise<CloudMediaFile | null> {
  const env = readEnv();
  const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.token}` },
  });
  if (!metaRes.ok) throw new Error(`Meta respondeu HTTP ${metaRes.status} ao consultar metadata da mídia`);
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!meta.url) throw new Error("Meta não devolveu URL de download pra essa mídia");
  const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${env.token}` } });
  if (!binRes.ok) throw new Error(`Meta respondeu HTTP ${binRes.status} ao baixar o binário da mídia`);
  const buf = new Uint8Array(await binRes.arrayBuffer());
  return { bytes: buf, mime: meta.mime_type ?? null, size: meta.file_size ?? buf.byteLength };
}

const MEDIA_DOWNLOAD_MAX_ATTEMPTS = 3;
const MEDIA_DOWNLOAD_RETRY_DELAY_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Baixa uma mídia recebida (imagem/áudio/vídeo/documento) da Meta, com retry
 * automático — falha intermitente de rede/timeout no download não deve
 * significar perder a mídia pra sempre (o link de origem da Meta expira
 * rápido, então não dá pra tentar de novo depois). Devolve null só depois de
 * esgotar todas as tentativas; o chamador decide como registrar essa falha.
 */
export async function downloadCloudMedia(mediaId: string): Promise<CloudMediaFile | null> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MEDIA_DOWNLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      return await downloadCloudMediaOnce(mediaId);
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt < MEDIA_DOWNLOAD_MAX_ATTEMPTS) {
        console.warn(
          `[whatsapp-cloud] tentativa ${attempt}/${MEDIA_DOWNLOAD_MAX_ATTEMPTS} de baixar mídia ${mediaId} falhou, tentando de novo`,
          msg,
        );
        await sleep(MEDIA_DOWNLOAD_RETRY_DELAY_MS);
      }
    }
  }
  console.error(
    `[whatsapp-cloud] falha definitiva ao baixar mídia ${mediaId} após ${MEDIA_DOWNLOAD_MAX_ATTEMPTS} tentativas`,
    lastError instanceof Error ? lastError.message : String(lastError),
  );
  return null;
}


