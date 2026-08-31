import { Star, User, Check, CheckCheck } from "lucide-react";
import { InboxAvatar, initialsFromName, stringToHslColor } from "@/components/inbox/InboxAvatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { windowState } from "@/lib/inbox-window";

export type ConvListItem = {
  id: string;
  contact_id: string | null;
  nome: string | null;
  phone: string | null;
  cidade: string | null;
  uf: string | null;
  status: "aberta" | "aguardando" | "resolvida";
  assignee: { id: string; nome: string | null } | null;
  last_at: string | null;
  last_inbound_at: string | null;
  last_preview: string | null;
  last_dir: "in" | "out" | null;
  unread: number;
  flagged: boolean;
};

/** Selo da janela de 24h: verde "faltam Xh" (âmbar quando expirando) ou cinza "fora da janela". */
export function WindowBadge({ lastInboundAt }: { lastInboundAt: string | null }) {
  const w = windowState(lastInboundAt);
  const cls = !w.open
    ? "bg-muted text-muted-foreground border-border/60"
    : w.expiring
      ? "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400"
      : "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
          {w.open ? `24h · ${w.label}` : "fora da janela"}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>
          {w.open
            ? "Dentro da janela de 24h do WhatsApp: dá pra responder com texto livre."
            : "Fora da janela de 24h: texto livre não chega, só template aprovado ou fluxo."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function isLidPhone(v?: string | null): boolean {
  return Boolean(v && /@lid$/i.test(v));
}
export function displayPhone(v?: string | null): string {
  if (!v) return "—";
  if (isLidPhone(v)) return "Contato anônimo (WhatsApp)";
  return v;
}

export function fmtRel(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return `${d}d`;
  }
}

export function AssigneeChip({ assignee }: { assignee: { id: string; nome: string | null; avatar_url?: string | null } | null }) {
  if (!assignee) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground/80">
        <User className="h-2.5 w-2.5" />
        Sem responsável
      </span>
    );
  }
  const nome = assignee.nome ?? "Usuário";
  const bg = stringToHslColor(assignee.id + (assignee.nome ?? ""));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default items-center gap-1 rounded-full border border-border/60 bg-muted/40 py-0.5 pl-0.5 pr-1.5 text-[10px]">
          <Avatar className="h-4 w-4 rounded-full" style={{ backgroundColor: bg }}>
            {assignee.avatar_url && <AvatarImage src={assignee.avatar_url} alt={nome} className="h-4 w-4" />}
            <AvatarFallback className="h-4 w-4 text-[8px] font-semibold text-white" style={{ backgroundColor: bg }}>
              {initialsFromName(assignee.nome)}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-[5rem] truncate">{nome}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>Responsável: {nome}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function ConversationRow({
  c,
  selected,
  onOpen,
}: {
  c: ConvListItem;
  selected: boolean;
  onOpen: () => void;
}) {
  const unread = c.unread > 0;
  const title = c.nome ?? (isLidPhone(c.phone) ? "Sem contato vinculado" : (c.phone ?? "Sem nome"));
  return (
    <button
      onClick={onOpen}
      className={`flex w-full gap-3 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/40 ${
        selected ? "bg-muted/60" : unread ? "bg-primary/[0.04]" : ""
      }`}
    >
      <InboxAvatar name={c.nome ?? c.phone} seed={c.contact_id ?? c.id} size={40} className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {c.flagged && <Star className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500" />}
            <span className={`truncate text-sm ${unread ? "font-bold" : "font-medium"}`}>{title}</span>
          </div>
          <span className={`shrink-0 text-[10px] ${unread ? "font-semibold text-primary" : "text-muted-foreground"}`}>
            {fmtRel(c.last_at)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {c.last_dir === "out" && <Check className="h-3 w-3 shrink-0 opacity-70" aria-label="última mensagem sua" />}
          <span className={`truncate ${unread ? "font-medium text-foreground/80" : ""}`}>
            {c.last_preview || "(sem prévia)"}
          </span>
          {unread && (
            <span className="ml-auto inline-flex min-w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
              {c.unread}
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/70">
          <span className={`truncate ${isLidPhone(c.phone) ? "font-mono" : ""}`}>{displayPhone(c.phone)}</span>
          {c.cidade && <span className="truncate">· {c.cidade}/{c.uf ?? ""}</span>}
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <WindowBadge lastInboundAt={c.last_inbound_at} />
            <AssigneeChip assignee={c.assignee} />
          </span>
        </div>
      </div>
    </button>
  );
}

export function ConversationSkeleton() {
  return (
    <div className="flex gap-3 border-b px-3 py-3">
      <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-2 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

/** Ícone duplo usado no cabeçalho de "lida" (reexport para consistência visual). */
export { CheckCheck };
