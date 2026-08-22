// SERVER ONLY — normaliza mensagens recebidas (Cloud API e Z-API) para as
// colunas de `inbound_messages`, cobrindo todos os tipos que o WhatsApp entrega.

export type AnyRecord = Record<string, unknown>;

export function safeStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
export function asRecord(v: unknown): AnyRecord | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRecord) : null;
}
export function safeNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Campos derivados que qualquer webhook grava em inbound_messages. */
export type ParsedInbound = {
  tipo: string;
  conteudo: string | null;
  wa_message_id: string | null;
  reply_to_wa_id: string | null;
  reaction_emoji: string | null;
  reaction_target_wa_id: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  shared_contacts: unknown | null;
  is_system_event: boolean;
};

const EMPTY: ParsedInbound = {
  tipo: "text",
  conteudo: null,
  wa_message_id: null,
  reply_to_wa_id: null,
  reaction_emoji: null,
  reaction_target_wa_id: null,
  latitude: null,
  longitude: null,
  location_name: null,
  shared_contacts: null,
  is_system_event: false,
};

/** Rótulo curto guardado em `conteudo` para tipos sem texto (usado na prévia). */
export function mediaPlaceholder(tipo: string): string {
  switch (tipo) {
    case "image": return "[foto]";
    case "video": return "[vídeo]";
    case "audio": return "[áudio]";
    case "sticker": return "[figurinha]";
    case "document": return "[documento]";
    case "location": return "[localização]";
    case "contacts": return "[contato]";
    default: return "";
  }
}

/** WhatsApp Cloud API (Meta): objeto `messages[i]`. */
export function parseCloudMessage(message: AnyRecord): ParsedInbound {
  const tipo = safeStr(message.type) ?? "text";
  const out: ParsedInbound = { ...EMPTY, tipo, wa_message_id: safeStr(message.id) };
  out.reply_to_wa_id = safeStr(asRecord(message.context)?.id);

  if (tipo === "text") {
    out.conteudo = safeStr(asRecord(message.text)?.body);
    return out;
  }
  if (tipo === "reaction") {
    const r = asRecord(message.reaction) ?? {};
    out.reaction_emoji = safeStr(r.emoji);
    out.reaction_target_wa_id = safeStr(r.message_id);
    return out;
  }
  if (tipo === "location") {
    const l = asRecord(message.location) ?? {};
    out.latitude = safeNum(l.latitude);
    out.longitude = safeNum(l.longitude);
    out.location_name = safeStr(l.name) ?? safeStr(l.address);
    out.conteudo = out.location_name ?? mediaPlaceholder("location");
    return out;
  }
  if (tipo === "contacts") {
    out.shared_contacts = message.contacts ?? null;
    out.conteudo = mediaPlaceholder("contacts");
    return out;
  }
  if (tipo === "button") {
    out.conteudo = safeStr(asRecord(message.button)?.text);
    return out;
  }
  if (tipo === "interactive") {
    const i = asRecord(message.interactive) ?? {};
    out.conteudo =
      safeStr(asRecord(i.button_reply)?.title) ?? safeStr(asRecord(i.list_reply)?.title);
    return out;
  }
  if (tipo === "system" || tipo === "unsupported" || tipo === "request_welcome") {
    out.is_system_event = true;
    out.conteudo = safeStr(asRecord(message.system)?.body);
    return out;
  }
  // Mídias: legenda quando houver
  const mediaRec = asRecord(message[tipo]) ?? {};
  out.conteudo = safeStr(mediaRec.caption) ?? (mediaPlaceholder(tipo) || null);
  return out;
}

/** Media ID da Cloud API para tipos com arquivo. */
export function cloudMediaRef(
  message: AnyRecord,
): { id: string; tipo: string; filename: string | null; mime: string | null } | null {
  const tipo = safeStr(message.type) ?? "";
  if (!["image", "video", "audio", "document", "sticker"].includes(tipo)) return null;
  const rec = asRecord(message[tipo]);
  const id = safeStr(rec?.id);
  if (!id) return null;
  return {
    id,
    tipo,
    filename: safeStr(rec?.filename),
    mime: safeStr(rec?.mime_type),
  };
}

/** Z-API: corpo do webhook `on-receive`. */
export function parseZapiMessage(body: AnyRecord): ParsedInbound {
  const out: ParsedInbound = {
    ...EMPTY,
    wa_message_id: safeStr(body.messageId) ?? safeStr(body.id),
  };
  const referenced = asRecord(body.referencedMessage);
  out.reply_to_wa_id = safeStr(body.referenceMessageId) ?? safeStr(referenced?.messageId);

  const reaction = asRecord(body.reaction);
  if (reaction) {
    out.tipo = "reaction";
    out.reaction_emoji = safeStr(reaction.value);
    out.reaction_target_wa_id = safeStr(asRecord(reaction.referencedMessage)?.messageId);
    return out;
  }

  const location = asRecord(body.location);
  if (location) {
    out.tipo = "location";
    out.latitude = safeNum(location.latitude);
    out.longitude = safeNum(location.longitude);
    out.location_name = safeStr(location.name) ?? safeStr(location.address);
    out.conteudo = out.location_name ?? mediaPlaceholder("location");
    return out;
  }

  const contactShared = asRecord(body.contact) ?? asRecord(body.vcard);
  if (contactShared) {
    out.tipo = "contacts";
    out.shared_contacts = [contactShared];
    out.conteudo = safeStr(contactShared.displayName) ?? mediaPlaceholder("contacts");
    return out;
  }

  const sticker = asRecord(body.sticker);
  if (sticker) {
    out.tipo = "sticker";
    out.conteudo = mediaPlaceholder("sticker");
    return out;
  }

  const buttonReply =
    asRecord(body.buttonsResponseMessage) ??
    asRecord(body.listResponseMessage) ??
    asRecord(body.buttonReply);
  if (buttonReply) {
    out.tipo = "button";
    out.conteudo =
      safeStr(buttonReply.buttonText) ??
      safeStr(buttonReply.title) ??
      safeStr(buttonReply.message);
    return out;
  }

  if (body.notification || safeStr(body.type) === "system" || body.callId) {
    out.is_system_event = true;
    out.tipo = "system";
    out.conteudo = safeStr(body.notification);
    return out;
  }

  out.conteudo =
    safeStr(asRecord(body.text)?.message) ??
    safeStr(asRecord(body.message)?.text) ??
    safeStr(body.text) ??
    safeStr(body.message) ??
    null;
  return out;
}
