// SERVER-ONLY: motor único de envio de WhatsApp.
// Centraliza render de variáveis, detecção de link, escolha de endpoint Z-API,
// validações de opt-out/consentimento/telefone, e retorno padronizado com
// endpoint_used / preview_status / fallback_reason.
//
// IMPORTANTE: disparos automáticos (campanhas, automações) usam SEMPRE o
// telefone principal (`phone_whatsapp_candidate` → `phone_e164`). O campo
// `phone_secundario_e164` é apenas informativo/manual e para reconhecimento
// de mensagens recebidas (ver src/routes/api/public/zapi/$evento.ts).
//
// Nunca importar deste arquivo fora de handlers de server-fn / server routes.
// Import típico:  const { sendMessage } = await import("@/lib/wa-send.server");

type ContactCtx = {
  id?: string;
  nome?: string | null;
  nome_social?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  uf?: string | null;
  phone_e164?: string | null;
  phone_whatsapp_candidate?: string | null;
  opt_out_at?: string | null;
  arquivado_at?: string | null;
  lifecycle_status?: string | null;
  consentimento_whatsapp?: boolean | null;
  whatsapp_status?: string | null;
  recad_token?: string | null;
};


export type SendOrigin =
  | "campaign"
  | "inbox"
  | "map"
  | "contact_profile"
  | "automation"
  | "template_test"
  | "whatsapp_test"
  | "territory_wa_me"
  | "auto_reply_trigger";

export type PreviewStatus =
  | "preview_confirmada"
  | "preview_provavel"
  | "preview_indisponivel"
  | "link_bloqueado"
  | "sem_link";

export type SendAttachment = {
  // Assinado no chamador (bucket campaign-media). Assinatura curta é OK: o Z-API
  // só precisa acessar durante o POST — não precisa persistir.
  signedUrl: string;
  mime: string;
  filename: string;
};

export type SendLinkMeta = {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  status: PreviewStatus;
};

export type SendInput = {
  contact: ContactCtx;
  /** Texto já renderizado ou template com {{variaveis}}. */
  text: string;
  /** Se o chamador já resolveu as variáveis, marcar true para pular render. */
  textAlreadyRendered?: boolean;
  /** Opções de render (origin usado para montar link_atualizacao/recadastro/inscricao). */
  renderOptions?: RenderOptions;
  /** Link estruturado (com metadados OG opcionais). Se omitido, motor detecta URL no texto. */
  link?: SendLinkMeta | null;
  attachment?: SendAttachment | null;
  origin: SendOrigin;
  /** Feature flag por instância. Se false, nunca usa POST /send-link. */
  useSendLink?: boolean;
  /**
   * Se true, sendMessage NÃO executa as validações internas de opt-out/consentimento/whatsapp_status
   * (usado quando o chamador já fez pré-check e não quer duplicidade). A checagem de telefone
   * continua sendo feita — sem telefone não há como enviar.
   */
  skipValidations?: boolean;
  /** Delay (em segundos, 1-15) repassado ao campo `delayMessage` da Z-API. */
  delayMessage?: number;
};

export type SendResult = {
  ok: boolean;
  endpoint_used: "send-text" | "send-link" | "send-image" | "send-document" | "send-audio" | "wa.me" | "skipped";
  preview_status: PreviewStatus;
  link_url: string | null;
  link_title: string | null;
  link_description: string | null;
  link_image: string | null;
  fallback_reason: string | null;
  message_id: string | null;
  zaap_id: string | null;
  rendered_text: string;
  error: string | null;
  /** true quando o erro bate com os padrões conhecidos de shadowban da Z-API. */
  shadowban_suspected: boolean;
};

/** Erros documentados pela Z-API como indicativos de shadowban/restrição temporária de envio. */
const SHADOWBAN_PATTERNS = [/likely shadow ban/i, /whatsapp rejected sending this message/i];

export function isShadowbanError(message: string): boolean {
  return SHADOWBAN_PATTERNS.some((re) => re.test(message));
}

import { renderMessageVars, type MessageVarOptions } from "@/lib/message-vars";
import { BLOCK_LABELS, messageBlockReason, sendablePhone } from "@/lib/contact-rules";


const URL_RE = /\bhttps?:\/\/[^\s<>"]+/i;

export function detectUrl(text: string): string | null {
  const m = text.match(URL_RE);
  return m ? m[0] : null;
}

export type RenderOptions = MessageVarOptions;

/**
 * Base URL pública usada para expandir {{link_atualizacao}}, {{link_inscricao}}, etc.
 * Ordem: PUBLIC_BASE_URL (env) → header Origin da request atual → fallback fixo.
 * Fallback é o domínio publicado, para que envios disparados por webhooks/cron
 * (sem header Origin) ainda gerem links válidos.
 */
export function getPublicOrigin(): string {
  const env = (process.env.PUBLIC_BASE_URL ?? "").trim();
  if (env) return env.replace(/\/$/, "");
  try {
    // getRequestHeader só funciona dentro de um request server-side; se falhar, ignora.
    // Import dinâmico para evitar acoplamento a AsyncLocalStorage fora de request.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRequestHeader } = require("@tanstack/react-start/server") as {
      getRequestHeader: (n: string) => string | undefined;
    };
    const h = getRequestHeader("origin") ?? getRequestHeader("x-forwarded-origin");
    if (h) return h.replace(/\/$/, "");
  } catch {
    // fora de request
  }
  return "https://povoquebatalha.lovable.app";
}

export function renderVars(body: string, c: ContactCtx, opts: RenderOptions = {}): string {
  const merged: RenderOptions = { ...opts, origin: opts.origin ?? getPublicOrigin() };
  return renderMessageVars(body, c, merged);
}


/**
 * Decide o endpoint que será usado, sem enviar. Útil para preview na UI.
 */
export function planEndpoint(input: {
  hasAttachment: boolean;
  attachmentMime?: string | null;
  link?: SendLinkMeta | null;
  text: string;
  useSendLink?: boolean;
  origin: SendOrigin;
}): { endpoint: SendResult["endpoint_used"]; preview_status: PreviewStatus } {
  if (input.origin === "territory_wa_me") {
    return {
      endpoint: "wa.me",
      preview_status: input.link || detectUrl(input.text) ? "preview_provavel" : "sem_link",
    };
  }
  if (input.hasAttachment) {
    const mime = (input.attachmentMime ?? "").toLowerCase();
    if (mime === "application/pdf" || mime.startsWith("application/")) {
      return { endpoint: "send-document", preview_status: "sem_link" };
    }
    if (mime.startsWith("image/")) return { endpoint: "send-image", preview_status: "sem_link" };
    if (mime.startsWith("audio/")) return { endpoint: "send-audio", preview_status: "sem_link" };
    return { endpoint: "send-document", preview_status: "sem_link" };
  }
  const linkUrl = input.link?.url ?? detectUrl(input.text);
  if (!linkUrl) return { endpoint: "send-text", preview_status: "sem_link" };
  const ogOk = Boolean(input.link && (input.link.title || input.link.image));
  if (ogOk && input.useSendLink) {
    return { endpoint: "send-link", preview_status: "preview_confirmada" };
  }
  return {
    endpoint: "send-text",
    preview_status: ogOk ? "preview_confirmada" : "preview_provavel",
  };
}

/** Garante que o link apareça no corpo (para send-text). Não duplica se já estiver. */
function ensureLinkInBody(text: string, linkUrl: string | null): string {
  if (!linkUrl) return text;
  if (text.includes(linkUrl)) return text;
  const sep = text.trim().length > 0 ? "\n\n" : "";
  return `${text}${sep}${linkUrl}`;
}

/**
 * Envia mensagem usando o endpoint mais adequado.
 * Não grava histórico — o chamador escolhe onde persistir (campaign_recipients,
 * direct_messages, etc). Retorna metadados padronizados para persistência.
 */
export async function sendMessage(input: SendInput): Promise<SendResult> {
  const c = input.contact;
  const rendered = input.textAlreadyRendered
    ? input.text
    : renderVars(input.text ?? "", c, input.renderOptions);

  // Validações comuns (não aplicam a wa.me — Território é apenas montagem de texto).
  // Quando skipValidations=true, o chamador já checou opt-out/consentimento/whatsapp_status
  // e não queremos duplicar a decisão aqui — apenas checamos telefone (sem ele não há envio).
  if (input.origin !== "territory_wa_me") {
    // C2 — decisão única de elegibilidade (src/lib/contact-rules.ts).
    // Bloqueios de sistema (arquivado / "não enviar") valem SEMPRE; os demais
    // são pulados quando o chamador já decidiu (skipValidations).
    const systemBlock = messageBlockReason(c, { requireConsent: false });
    if (systemBlock === "arquivado" || systemBlock === "nao_enviar") {
      return baseSkip(rendered, BLOCK_LABELS[systemBlock]);
    }
    if (!input.skipValidations) {
      const block = messageBlockReason(c, { requireConsent: input.origin === "campaign" });
      if (block) return baseSkip(rendered, BLOCK_LABELS[block]);
    } else if (!sendablePhone(c)) {
      return baseSkip(rendered, BLOCK_LABELS.sem_telefone);
    }
  }

  const phone = (sendablePhone(c) ?? "").replace(/\D+/g, "");
  const hasAttachment = Boolean(input.attachment);
  const plan = planEndpoint({
    hasAttachment,
    attachmentMime: input.attachment?.mime ?? null,
    link: input.link ?? null,
    text: rendered,
    useSendLink: input.useSendLink ?? false,
    origin: input.origin,
  });

  const linkUrlFinal = input.link?.url ?? detectUrl(rendered) ?? null;

  if (input.origin === "territory_wa_me") {
    return {
      ok: true,
      endpoint_used: "wa.me",
      preview_status: plan.preview_status,
      link_url: linkUrlFinal,
      link_title: input.link?.title ?? null,
      link_description: input.link?.description ?? null,
      link_image: input.link?.image ?? null,
      fallback_reason: null,
      message_id: null,
      zaap_id: null,
      rendered_text: rendered,
      error: null,
      shadowban_suspected: false,
    };
  }

  // Motor oficial: WhatsApp Cloud API (Meta). Nesta etapa só texto — mídia
  // (imagem/documento/áudio) e templates entram numa etapa separada.
  // O código da Z-API segue no repo (src/integrations/zapi/**) mas não é mais chamado aqui.
  const { whatsappCloud } = await import("@/integrations/whatsapp-cloud/client.server");
  let fallbackReason: string | null = null;
  let endpointUsed: SendResult["endpoint_used"] = plan.endpoint;
  let previewStatus: PreviewStatus = plan.preview_status;

  try {
    if (input.attachment) {
      throw new Error(
        "Envio de mídia ainda não disponível no WhatsApp oficial (Cloud API). Envie como texto/link por enquanto.",
      );
    }

    // A Cloud API não tem endpoint de link com prévia customizada: o texto vai
    // com preview_url e o próprio WhatsApp busca o OG do link.
    if (plan.endpoint === "send-link") {
      endpointUsed = "send-text";
      previewStatus = "preview_provavel";
      fallbackReason = "Cloud API: prévia gerada pelo WhatsApp a partir do link";
    }

    const body = ensureLinkInBody(rendered, linkUrlFinal);
    const result = await whatsappCloud.sendText(phone, body, Boolean(linkUrlFinal));

    return {
      ok: true,
      endpoint_used: endpointUsed,
      preview_status: previewStatus,
      link_url: linkUrlFinal,
      link_title: input.link?.title ?? null,
      link_description: input.link?.description ?? null,
      link_image: input.link?.image ?? null,
      fallback_reason: fallbackReason,
      message_id: result.messageId,
      // Envios novos não têm zaap_id (campo era exclusivo da Z-API).
      zaap_id: null,
      rendered_text: rendered,
      error: null,
      shadowban_suspected: false,
    };

  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "erro desconhecido";
    return {
      ok: false,
      endpoint_used: endpointUsed,
      preview_status: previewStatus,
      link_url: linkUrlFinal,
      link_title: input.link?.title ?? null,
      link_description: input.link?.description ?? null,
      link_image: input.link?.image ?? null,
      fallback_reason: fallbackReason,
      message_id: null,
      zaap_id: null,
      rendered_text: rendered,
      error: errorMsg,
      shadowban_suspected: isShadowbanError(errorMsg),
    };
  }
}

function baseSkip(rendered: string, reason: string): SendResult {
  return {
    ok: false,
    endpoint_used: "skipped",
    preview_status: "sem_link",
    link_url: null,
    link_title: null,
    link_description: null,
    link_image: null,
    fallback_reason: reason,
    message_id: null,
    zaap_id: null,
    rendered_text: rendered,
    error: reason,
    shadowban_suspected: false,
  };
}

/** Erros da Z-API que indicam número inexistente/sem WhatsApp. */
const INVALID_NUMBER_PATTERNS = [
  /not\s*exists?/i,
  /n[aã]o\s*(existe|possui|tem)\s*whatsapp/i,
  /invalid\s*(phone|number)/i,
  /phone\s*not\s*found/i,
];

/**
 * Alimenta `contacts.whatsapp_status` a partir do resultado real de um envio.
 * Nunca sobrescreve `opt_out` (decisão da pessoa). Chamada best-effort:
 * qualquer falha aqui é silenciosa e não afeta o envio.
 */
export async function recordWhatsappSendOutcome(
  contactId: string | null | undefined,
  result: Pick<SendResult, "ok" | "endpoint_used" | "error">,
): Promise<void> {
  if (!contactId) return;
  if (result.endpoint_used === "skipped" || result.endpoint_used === "wa.me") return;

  const err = result.error ?? "";
  let next: "confirmado" | "invalido" | "erro_envio";
  if (result.ok) next = "confirmado";
  else if (INVALID_NUMBER_PATTERNS.some((re) => re.test(err))) next = "invalido";
  else next = "erro_envio";

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("contacts")
      .update({ whatsapp_status: next, whatsapp_checked_at: new Date().toISOString() } as never)
      .eq("id", contactId)
      .neq("whatsapp_status", "opt_out");
  } catch {
    // best-effort
  }
}


/**
 * Lê a feature flag `use_send_link` do `whatsapp_instances.config` (jsonb).
 * Padrão: false — segue usando send-text com linkPreview:true.
 */
export async function readUseSendLinkFlag(): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("config")
      .eq("provider", "zapi")
      .maybeSingle();
    const cfg = (data?.config ?? {}) as Record<string, unknown>;
    return cfg.use_send_link === true;
  } catch {
    return false;
  }
}
