// SERVER-ONLY: motor único de envio de WhatsApp.
// Centraliza render de variáveis, detecção de link, escolha de endpoint Z-API,
// validações de opt-out/consentimento/telefone, e retorno padronizado com
// endpoint_used / preview_status / fallback_reason.
//
// Nunca importar deste arquivo fora de handlers de server-fn / server routes.
// Import típico:  const { sendMessage } = await import("@/lib/wa-send.server");

type ContactCtx = {
  id: string;
  nome?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  uf?: string | null;
  phone_e164?: string | null;
  phone_whatsapp_candidate?: string | null;
  opt_out_at?: string | null;
  consentimento_whatsapp?: boolean | null;
  whatsapp_status?: string | null;
};

export type SendOrigin =
  | "campaign"
  | "inbox"
  | "map"
  | "contact_profile"
  | "automation"
  | "template_test"
  | "whatsapp_test"
  | "territory_wa_me";

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
  /** Link estruturado (com metadados OG opcionais). Se omitido, motor detecta URL no texto. */
  link?: SendLinkMeta | null;
  attachment?: SendAttachment | null;
  origin: SendOrigin;
  /** Feature flag por instância. Se false, nunca usa POST /send-link. */
  useSendLink?: boolean;
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
};

const URL_RE = /\bhttps?:\/\/[^\s<>"]+/i;

export function detectUrl(text: string): string | null {
  const m = text.match(URL_RE);
  return m ? m[0] : null;
}

function saudacaoAgora(): string {
  const h = new Date(Date.now() - 3 * 3600 * 1000).getUTCHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

export function renderVars(body: string, c: ContactCtx): string {
  const primeiro = (c.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const values: Record<string, string> = {
    nome: c.nome ?? "",
    primeiro_nome: primeiro,
    primeiro_nome_ou_ola: primeiro || "Olá",
    cidade: c.cidade ?? "",
    bairro: c.bairro ?? "",
    uf: c.uf ?? "",
    saudacao: saudacaoAgora(),
  };
  return body.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(values, k) ? values[k] : m,
  );
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
  const rendered = input.textAlreadyRendered ? input.text : renderVars(input.text ?? "", c);

  // Validações comuns (não aplicam a wa.me — Território é apenas montagem de texto)
  if (input.origin !== "territory_wa_me") {
    if (c.opt_out_at) {
      return baseSkip(rendered, "opt-out");
    }
    if (input.origin === "campaign" && c.consentimento_whatsapp === false) {
      return baseSkip(rendered, "sem consentimento");
    }
    const phoneRaw = c.phone_whatsapp_candidate ?? c.phone_e164;
    if (!phoneRaw) return baseSkip(rendered, "sem telefone");
    if (
      c.whatsapp_status === "invalido" ||
      c.whatsapp_status === "erro_envio" ||
      c.whatsapp_status === "opt_out"
    ) {
      return baseSkip(rendered, "whatsapp indisponível");
    }
  }

  const phone = (c.phone_whatsapp_candidate ?? c.phone_e164 ?? "").replace(/\D+/g, "");
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
    };
  }

  const { zapi } = await import("@/integrations/zapi/client.server");
  let fallbackReason: string | null = null;
  let endpointUsed: SendResult["endpoint_used"] = plan.endpoint;
  let previewStatus: PreviewStatus = plan.preview_status;

  try {
    let result: { messageId?: string; zaapId?: string; id?: string } = {};

    if (plan.endpoint === "send-document" && input.attachment) {
      const ext = (input.attachment.filename.split(".").pop() ?? "pdf").toLowerCase();
      result = await zapi.sendDocument(phone, input.attachment.signedUrl, input.attachment.filename, ext);
      if (rendered.trim()) await zapi.sendText(phone, rendered);
    } else if (plan.endpoint === "send-image" && input.attachment) {
      result = await zapi.sendImage(phone, input.attachment.signedUrl, rendered || undefined);
    } else if (plan.endpoint === "send-audio" && input.attachment) {
      result = await zapi.sendAudio(phone, input.attachment.signedUrl);
      if (rendered.trim()) await zapi.sendText(phone, rendered);
    } else if (plan.endpoint === "send-link" && linkUrlFinal) {
      try {
        result = await zapi.sendLink({
          phone,
          message: ensureLinkInBody(rendered, linkUrlFinal),
          linkUrl: linkUrlFinal,
          title: input.link?.title ?? "",
          linkDescription: input.link?.description ?? "",
          image: input.link?.image ?? "",
        });
      } catch (e) {
        fallbackReason = `send-link falhou: ${e instanceof Error ? e.message : "erro"}`;
        endpointUsed = "send-text";
        previewStatus = "preview_provavel";
        result = await zapi.sendText(phone, ensureLinkInBody(rendered, linkUrlFinal));
      }
    } else {
      // send-text (com link no corpo quando aplicável)
      const body = ensureLinkInBody(rendered, linkUrlFinal);
      result = await zapi.sendText(phone, body);
    }

    return {
      ok: true,
      endpoint_used: endpointUsed,
      preview_status: previewStatus,
      link_url: linkUrlFinal,
      link_title: input.link?.title ?? null,
      link_description: input.link?.description ?? null,
      link_image: input.link?.image ?? null,
      fallback_reason: fallbackReason,
      message_id: result.messageId ?? result.id ?? null,
      zaap_id: result.zaapId ?? null,
      rendered_text: rendered,
      error: null,
    };
  } catch (e) {
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
      error: e instanceof Error ? e.message : "erro desconhecido",
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
  };
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
