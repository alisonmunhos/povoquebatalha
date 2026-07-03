import { Loader2, FileText, Image as ImageIcon, Music, Link2, AlertTriangle, CheckCircle2, HelpCircle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LinkPreview, LinkPreviewStatus } from "@/lib/link-preview.functions";

export type PlannedEndpoint =
  | "send-text"
  | "send-link"
  | "send-image"
  | "send-document"
  | "send-audio"
  | "wa.me"
  | null;

export type MessagePreviewProps = {
  /** Texto final (já com variáveis renderizadas quando possível). */
  text: string;
  /** Estado da prévia de link. */
  linkPreview?: LinkPreview | null;
  linkLoading?: boolean;
  /** Anexo (nome/mime), quando houver. */
  attachment?: { filename: string; mime: string } | null;
  /** Endpoint que o motor deverá usar. */
  plannedEndpoint?: PlannedEndpoint;
  /** Rótulo do destinatário (ex: "Para Maria — +5551…"). */
  recipientLabel?: string;
  className?: string;
};

const ENDPOINT_LABEL: Record<Exclude<PlannedEndpoint, null>, string> = {
  "send-text": "Envio como texto",
  "send-link": "Envio como link com prévia",
  "send-image": "Envio como imagem",
  "send-document": "Envio como documento",
  "send-audio": "Envio como áudio",
  "wa.me": "Abrirá o WhatsApp pessoal",
};

const STATUS_LABEL: Record<LinkPreviewStatus, string> = {
  preview_confirmada: "Prévia confirmada",
  preview_provavel: "Prévia provável",
  preview_indisponivel: "Sem prévia garantida",
  link_bloqueado: "Link bloqueado",
};

function statusVariant(s: LinkPreviewStatus): "default" | "secondary" | "destructive" | "outline" {
  if (s === "preview_confirmada") return "default";
  if (s === "preview_provavel") return "secondary";
  if (s === "link_bloqueado") return "destructive";
  return "outline";
}

function StatusIcon({ status }: { status: LinkPreviewStatus }) {
  if (status === "preview_confirmada") return <CheckCircle2 className="h-3 w-3" />;
  if (status === "link_bloqueado") return <AlertTriangle className="h-3 w-3" />;
  if (status === "preview_provavel") return <HelpCircle className="h-3 w-3" />;
  return <AlertTriangle className="h-3 w-3" />;
}

/** Balão único simulando WhatsApp com texto + prévia de link + anexo. */
export function MessagePreview({
  text,
  linkPreview,
  linkLoading,
  attachment,
  plannedEndpoint,
  recipientLabel,
  className,
}: MessagePreviewProps) {
  const hasLink = Boolean(linkPreview && !linkPreview.error && (linkPreview.title || linkPreview.image));
  const status: LinkPreviewStatus | null = linkPreview?.status ?? null;

  return (
    <div className={className}>
      {recipientLabel && (
        <div className="text-[11px] text-muted-foreground mb-1">{recipientLabel}</div>
      )}
      <div className="rounded-2xl rounded-tl-sm bg-emerald-50 border border-emerald-200 p-2 max-w-md shadow-sm">
        {attachment && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/70 border border-emerald-100 p-2 text-xs">
            {attachment.mime === "application/pdf" ? (
              <FileText className="h-4 w-4 text-emerald-700" />
            ) : attachment.mime.startsWith("image/") ? (
              <ImageIcon className="h-4 w-4 text-emerald-700" />
            ) : attachment.mime.startsWith("audio/") ? (
              <Music className="h-4 w-4 text-emerald-700" />
            ) : (
              <FileText className="h-4 w-4 text-emerald-700" />
            )}
            <span className="truncate font-medium">{attachment.filename}</span>
            <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
              {attachment.mime}
            </Badge>
          </div>
        )}

        {(linkLoading || hasLink) && (
          <div className="mb-2 overflow-hidden rounded-lg border border-emerald-100 bg-white">
            {linkLoading ? (
              <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando prévia do link…
              </div>
            ) : linkPreview ? (
              <a
                href={linkPreview.url}
                target="_blank"
                rel="noreferrer"
                className="flex hover:bg-muted/40 transition"
              >
                {linkPreview.image && (
                  <img
                    src={linkPreview.image}
                    alt=""
                    className="w-20 h-20 object-cover flex-shrink-0 bg-muted"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <div className="p-2 min-w-0 flex-1">
                  {linkPreview.siteName && (
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
                      {linkPreview.siteName}
                    </div>
                  )}
                  {linkPreview.title && (
                    <div className="text-xs font-medium leading-tight line-clamp-2">
                      {linkPreview.title}
                    </div>
                  )}
                  {linkPreview.description && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {linkPreview.description}
                    </div>
                  )}
                </div>
              </a>
            ) : null}
          </div>
        )}

        <div className="whitespace-pre-wrap break-words text-sm text-foreground">
          {text || <span className="text-muted-foreground italic">Sem texto</span>}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {status && (
          <Badge variant={statusVariant(status)} className="gap-1 text-[10px]">
            <StatusIcon status={status} />
            {STATUS_LABEL[status]}
          </Badge>
        )}
        {plannedEndpoint && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            {plannedEndpoint === "wa.me" ? <ExternalLink className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
            {ENDPOINT_LABEL[plannedEndpoint]}
          </Badge>
        )}
      </div>

      {status === "link_bloqueado" && (
        <p className="text-[11px] text-red-600 mt-1">
          Este link é inválido, privado ou está bloqueado por segurança. Ele não será enviado.
        </p>
      )}
      {status === "preview_provavel" && (
        <p className="text-[11px] text-amber-700 mt-1">
          O WhatsApp pode tentar gerar o card, mas não é garantido. Links do Instagram, Facebook, TikTok, X e páginas privadas podem não gerar prévia.
        </p>
      )}
      {status === "preview_indisponivel" && (
        <p className="text-[11px] text-muted-foreground mt-1">
          Sem prévia disponível. Envie uma imagem/anexo ou teste antes de disparar.
        </p>
      )}
      <p className="text-[10px] text-muted-foreground mt-1">
        A prévia abaixo é uma simulação. A aparência final pode variar conforme o WhatsApp e o site do link.
      </p>
    </div>
  );
}
