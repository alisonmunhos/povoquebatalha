import { useState } from "react";
import {
  Check, CheckCheck, AlertTriangle, Clock, MapPin, UserRound, ExternalLink, Reply, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { linkify } from "@/lib/linkify";
import { fmtTime, type InboxMsg } from "@/lib/inbox-timeline";
import { MediaView, SignedMedia } from "@/components/inbox/MessageMedia";

const LONG_TEXT = 700;

function ReceiptIcon({ msg }: { msg: InboxMsg }) {
  if (msg.kind !== "out" || !msg.receipt) return null;
  const cls = "h-3.5 w-3.5 shrink-0";
  switch (msg.receipt) {
    case "pending":
      return <Clock className={`${cls} opacity-60`} aria-label="enviando" />;
    case "sent":
      return <Check className={`${cls} opacity-70`} aria-label="enviada" />;
    case "delivered":
      return <CheckCheck className={`${cls} opacity-70`} aria-label="entregue" />;
    case "read":
      return <CheckCheck className={`${cls} text-sky-500`} aria-label="lida" />;
    case "failed":
      return <AlertTriangle className={`${cls} text-destructive`} aria-label="falhou" />;
    default:
      return null;
  }
}

export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-2">
      <span className="rounded-full border bg-background/80 px-3 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function UnreadDivider() {
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="h-px flex-1 bg-primary/40" />
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
        Mensagens não lidas
      </span>
      <span className="h-px flex-1 bg-primary/40" />
    </div>
  );
}

export function SystemMessage({ text, at }: { text: string; at: string }) {
  return (
    <div className="flex justify-center">
      <div className="max-w-[85%] rounded-md border bg-background/70 px-3 py-1 text-center text-[11px] text-muted-foreground">
        {text} · {fmtTime(at)}
      </div>
    </div>
  );
}

export function MessageBubble({
  msg,
  groupStart,
  groupEnd,
  onQuoteClick,
  onReply,
}: {
  msg: InboxMsg;
  groupStart: boolean;
  groupEnd: boolean;
  onQuoteClick?: (id: string) => void;
  onReply?: (msg: InboxMsg) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const out = msg.kind === "out";
  const isSticker = (msg.tipo ?? "").toLowerCase() === "sticker";
  const long = msg.text.length > LONG_TEXT;
  const shownText = long && !expanded ? `${msg.text.slice(0, LONG_TEXT)}…` : msg.text;

  const corner = out
    ? groupEnd ? "rounded-br-sm" : "rounded-br-2xl"
    : groupEnd ? "rounded-bl-sm" : "rounded-bl-2xl";

  return (
    <div
      id={`msg-${msg.id}`}
      className={`group flex items-end gap-1 ${out ? "justify-end" : "justify-start"} ${groupStart ? "mt-2" : "mt-0.5"}`}
    >
      {out && onReply && (
        <button
          type="button"
          onClick={() => onReply(msg)}
          className="mb-1 hidden rounded-full p-1 text-muted-foreground hover:bg-muted group-hover:md:block"
          aria-label="Responder citando esta mensagem"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>
      )}

      <div
        className={`relative max-w-[85%] md:max-w-[62%] text-sm ${
          isSticker
            ? ""
            : `rounded-2xl px-3 py-2 shadow-sm ${corner} ${out ? "wa-bubble-out" : "wa-bubble-in border"}`
        }`}
      >
        {msg.isTemplate && (
          <div className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${out ? "opacity-70" : "text-muted-foreground"}`}>
            Template oficial
          </div>
        )}

        {msg.reply && (
          <button
            type="button"
            onClick={() => onQuoteClick?.(msg.reply!.id)}
            className={`mb-1.5 block w-full rounded-md border-l-4 px-2 py-1 text-left text-[11px] ${
              out ? "border-primary-foreground/50 bg-primary-foreground/10" : "border-primary/60 bg-primary/5"
            }`}
          >
            <span className="block font-semibold opacity-80">
              {msg.reply.kind === "out" ? "Você" : "Contato"}
            </span>
            <span className="line-clamp-2 opacity-80">{msg.reply.text || "(mídia)"}</span>
          </button>
        )}

        {msg.header_type === "TEXT" && msg.header_text && (
          <div className="mb-1 whitespace-pre-wrap break-words font-semibold">{msg.header_text}</div>
        )}

        {msg.media_path ? (
          <SignedMedia
            bucket={msg.media_bucket ?? "campaign-media"}
            path={msg.media_path}
            mime={msg.media_mime ?? ""}
            filename={msg.media_filename ?? "arquivo"}
            size={msg.media_size}
            tipo={msg.tipo}
          />
        ) : msg.media_url ? (
          <MediaView
            url={msg.media_url}
            mime={msg.media_mime ?? ""}
            filename={msg.media_filename ?? "arquivo"}
            size={msg.media_size}
            tipo={msg.tipo}
          />
        ) : null}

        {!msg.media_path && !msg.media_url && msg.link_url && (msg.link_title || msg.link_image) && (
          <a
            href={msg.link_url}
            target="_blank"
            rel="noreferrer"
            className={`mb-1 flex overflow-hidden rounded-lg border transition ${
              out ? "border-primary-foreground/15 hover:bg-primary-foreground/10" : "border-current/10 hover:bg-black/5"
            }`}
          >
            {msg.link_image && (
              <img
                src={msg.link_image}
                alt=""
                className="h-20 w-20 shrink-0 object-cover bg-black/10"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="min-w-0 flex-1 p-2">
              {msg.link_title && <div className="text-xs font-semibold leading-tight line-clamp-2">{msg.link_title}</div>}
              {msg.link_description && (
                <div className="mt-0.5 text-[11px] opacity-70 line-clamp-2">{msg.link_description}</div>
              )}
            </div>
          </a>
        )}

        {msg.text && (
          <div className="whitespace-pre-wrap break-words">
            {linkify(shownText)}
            {long && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="ml-1 font-semibold underline underline-offset-2"
              >
                {expanded ? "Ler menos" : "Ler mais"}
              </button>
            )}
          </div>
        )}

        {msg.location && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${msg.location.lat},${msg.location.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 flex items-center gap-2 rounded-md bg-black/5 px-2 py-1.5"
          >
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{msg.location.name ?? "Localização enviada"}</span>
              <span className="block text-[11px] opacity-70">abrir no mapa</span>
            </span>
          </a>
        )}

        {msg.shared_contacts && msg.shared_contacts.length > 0 && (
          <div className="mt-1 space-y-1">
            {msg.shared_contacts.map((sc, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md bg-black/5 px-2 py-1.5">
                <UserRound className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">
                  {sc.nome ?? "Contato"}
                  {sc.phone ? ` · ${sc.phone}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        {msg.buttons && msg.buttons.length > 0 && (
          <>
            <div className={`my-2 h-px w-full ${out ? "bg-primary-foreground/20" : "bg-border"}`} />
            <div className="-mx-3 -mb-2 flex flex-col overflow-hidden rounded-b-2xl">
              {msg.buttons.map((b, idx) => {
                const label = b.text.toUpperCase();
                const baseClass = `w-full py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide transition-colors border-t first:border-t-0 ${
                  out
                    ? "text-primary-foreground hover:bg-primary-foreground/10 border-primary-foreground/15"
                    : "text-primary hover:bg-primary/5 border-border"
                }`;
                const icon = b.type === "URL" ? <ExternalLink className="h-3.5 w-3.5" /> : null;
                if (b.type === "URL") {
                  return (
                    <a key={idx} href={b.url} target="_blank" rel="noopener noreferrer" className={baseClass}>
                      {icon}
                      <span>{label}</span>
                    </a>
                  );
                }
                if (b.type === "PHONE_NUMBER") {
                  return (
                    <a key={idx} href={`tel:${b.phone_number}`} className={baseClass}>
                      {icon}
                      <span>{label}</span>
                    </a>
                  );
                }
                return (
                  <div key={idx} className={baseClass}>
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!isSticker && (
          <div className={`mt-1 flex items-center gap-1 text-[10px] opacity-70 ${out ? "justify-end" : ""}`}>
            {msg.meta && groupEnd && <span className="truncate max-w-[14rem]">{msg.meta} ·</span>}
            <span>{fmtTime(msg.at)}</span>
            <ReceiptIcon msg={msg} />
          </div>
        )}

        {msg.reactions && msg.reactions.length > 0 && (
          <div
            className={`absolute -bottom-3 ${out ? "right-3" : "left-3"} rounded-full border bg-background px-1.5 py-0.5 text-xs shadow-sm`}
          >
            {msg.reactions.join(" ")}
          </div>
        )}
      </div>

      {!out && (
        <div className="mb-1 hidden gap-0.5 group-hover:md:flex">
          {onReply && (
            <button
              type="button"
              onClick={() => onReply(msg)}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label="Responder citando esta mensagem"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
          )}
          {msg.text && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(msg.text).then(
                  () => toast.success("Texto copiado"),
                  () => toast.error("Não foi possível copiar"),
                );
              }}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label="Copiar texto da mensagem"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
