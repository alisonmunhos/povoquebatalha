import type { TemplateButton } from "@/lib/whatsapp-templates.functions";

/** Estado do "tiquinho" de uma mensagem enviada. */
export type Receipt = "pending" | "sent" | "delivered" | "read" | "failed" | null;

export type InboxMsg = {
  id: string;
  kind: "in" | "out" | "system";
  text: string;
  at: string;
  meta?: string;
  tipo?: string | null;
  media_path?: string | null;
  /** Bucket do media_path (padrão: campaign-media, anexos enviados). */
  media_bucket?: string | null;

  media_url?: string | null;
  media_mime?: string | null;
  media_filename?: string | null;
  media_size?: number | null;
  header_type?: string | null;
  header_text?: string | null;
  buttons?: TemplateButton[];
  link_url?: string | null;
  link_title?: string | null;
  link_description?: string | null;
  link_image?: string | null;
  wa_id?: string | null;
  reactions?: string[];
  /** Nosso emoji ativo nesta mensagem (vazio/ausente = não reagimos), pra
   * destacar o atalho selecionado e decidir o toggle (reagir de novo remove). */
  myReactionEmoji?: string | null;
  location?: { lat: number; lng: number; name: string | null } | null;
  shared_contacts?: { nome?: string | null; phone?: string | null }[] | null;
  receipt?: Receipt;
  error?: string | null;
  isTemplate?: boolean;
  reply?: { text: string; kind: "in" | "out"; id: string } | null;
};

export type TimelineItem =
  | { type: "day"; id: string; label: string }
  | { type: "unread"; id: string }
  | { type: "msg"; id: string; msg: InboxMsg; groupStart: boolean; groupEnd: boolean };

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Hoje", "Ontem" ou "22 de agosto de 2026". */
export function dayLabel(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = startOfDay(new Date());
  const day = startOfDay(d);
  const diffDays = Math.round((today - day) / 86_400_000);
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString("pt-BR", { weekday: "long" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function fmtTime(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Recibo a partir dos campos já gravados em direct_messages. */
export function receiptFrom(row: {
  status?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  failed_at?: string | null;
}): Receipt {
  if (row.failed_at || row.status === "erro" || row.status === "failed") return "failed";
  if (row.read_at) return "read";
  if (row.delivered_at) return "delivered";
  if (row.status === "enviado" || row.status === "sent" || row.status === "delivered") return "sent";
  if (row.status === "fila" || row.status === "queued" || row.status === "sending") return "pending";
  return "sent";
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Monta a lista de renderização: separadores de data, divisor de não lidas e
 * agrupamento de bolhas consecutivas do mesmo autor dentro de 5 minutos.
 */
export function buildTimelineItems(
  msgs: InboxMsg[],
  opts?: { unreadBeforeId?: string | null },
): TimelineItem[] {
  const items: TimelineItem[] = [];
  let lastDay = "";
  let unreadInserted = false;

  msgs.forEach((msg, i) => {
    const label = dayLabel(msg.at);
    if (label && label !== lastDay) {
      items.push({ type: "day", id: `day-${label}-${msg.id}`, label });
      lastDay = label;
    }
    if (!unreadInserted && opts?.unreadBeforeId && msg.id === opts.unreadBeforeId) {
      items.push({ type: "unread", id: "unread-divider" });
      unreadInserted = true;
    }

    const prev = msgs[i - 1];
    const next = msgs[i + 1];
    const sameGroup = (a?: InboxMsg, b?: InboxMsg) => {
      if (!a || !b) return false;
      if (a.kind !== b.kind || a.kind === "system") return false;
      if ((a.meta ?? "") !== (b.meta ?? "")) return false;
      const ta = new Date(a.at).getTime();
      const tb = new Date(b.at).getTime();
      if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
      if (dayLabel(a.at) !== dayLabel(b.at)) return false;
      return Math.abs(tb - ta) <= GROUP_WINDOW_MS;
    };

    const groupStart = !sameGroup(prev, msg);
    const groupEnd = !sameGroup(msg, next);
    items.push({ type: "msg", id: msg.id, msg, groupStart, groupEnd });
  });

  return items;
}

export function fmtBytes(size?: number | null): string {
  if (!size || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Ícone/rótulo curto do tipo da mensagem, para a prévia na lista. */
export function previewPrefix(tipo?: string | null, mime?: string | null): string {
  const t = (tipo ?? "").toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (t === "image" || m.startsWith("image/")) return "📷";
  if (t === "sticker") return "🩹";
  if (t === "video" || m.startsWith("video/")) return "🎥";
  if (t === "audio" || t === "ptt" || m.startsWith("audio/")) return "🎤";
  if (t === "document" || m === "application/pdf") return "📄";
  if (t === "location") return "📍";
  if (t === "contacts" || t === "contact") return "👤";
  return "";
}
