import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  listContactTerritoryLogs,
  setTerritoryLogFollowUp,
  setTerritoryLogHidden,
  type ContactTerritoryLogRow,
} from "@/lib/territory-logs.functions";
import {
  MessageCircle,
  CheckCircle2,
  UserX,
  StickyNote,
  Clock3,
  MoreHorizontal,
  Eye,
  EyeOff,
  CircleDot,
  CircleCheck,
  Loader2,
  Inbox,
} from "lucide-react";

type Contact = {
  id: string;
  nome: string | null;
  phone_e164: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
};

type Props = {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const ACTION_LABEL: Record<string, string> = {
  contato_realizado: "Contato feito",
  nao_encontrado: "Não encontrado",
  observacao: "Observação",
  whatsapp_aberto: "WhatsApp aberto",
  pediu_atualizacao: "Pediu atualização",
};

function actionIcon(action: string) {
  switch (action) {
    case "contato_realizado":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "nao_encontrado":
      return <UserX className="h-4 w-4 text-amber-600" />;
    case "observacao":
      return <StickyNote className="h-4 w-4 text-sky-600" />;
    case "whatsapp_aberto":
      return <MessageCircle className="h-4 w-4 text-emerald-600" />;
    case "pediu_atualizacao":
      return <Clock3 className="h-4 w-4 text-violet-600" />;
    default:
      return <CircleDot className="h-4 w-4 text-muted-foreground" />;
  }
}

function canFollowUp(action: string) {
  return action === "observacao" || action === "pediu_atualizacao";
}

export function TerritoryContactLogDrawer({ contact, open, onOpenChange }: Props) {
  const listFn = useServerFn(listContactTerritoryLogs);
  const followFn = useServerFn(setTerritoryLogFollowUp);
  const hideFn = useServerFn(setTerritoryLogHidden);
  const qc = useQueryClient();

  const [showHidden, setShowHidden] = useState(false);

  const query = useQuery({
    queryKey: ["territory-contact-logs", contact?.id, { showHidden }],
    queryFn: () =>
      listFn({
        data: { contactId: contact!.id, includeHidden: showHidden, limit: 200 },
      }),
    enabled: !!contact?.id && open,
  });

  const invalidate = () => {
    if (contact?.id) {
      qc.invalidateQueries({ queryKey: ["territory-contact-logs", contact.id] });
    }
    qc.invalidateQueries({ queryKey: ["territory-contacts"] });
  };

  const followMut = useMutation({
    mutationFn: (v: { logId: string; status: "pendente" | "concluido" | null }) =>
      followFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(
        v.status === "concluido"
          ? "Marcado como concluído"
          : v.status === "pendente"
            ? "Marcado como pendente"
            : "Status removido",
      );
      invalidate();
    },
    onError: (e) =>
      toast.error("Não foi possível atualizar", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const hideMut = useMutation({
    mutationFn: (v: { logId: string; hidden: boolean }) => hideFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.hidden ? "Registro ocultado" : "Registro reexibido");
      invalidate();
    },
    onError: (e) =>
      toast.error("Não foi possível atualizar", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const rows = query.data?.rows ?? [];
  const pendingCount = query.data?.pendingCount ?? 0;

  const location = useMemo(
    () => [contact?.bairro, contact?.cidade, contact?.uf].filter(Boolean).join(" • "),
    [contact],
  );

  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay
          className="fixed inset-0 z-[1200] bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <SheetPrimitive.Content
          className="fixed inset-y-0 right-0 z-[1201] h-full w-full sm:max-w-md border-l bg-background shadow-2xl p-0 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[state=closed]:duration-300 data-[state=open]:duration-300"
        >
          <SheetPrimitive.Close
            className="absolute right-3 top-3 rounded-md p-1.5 opacity-70 hover:opacity-100 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring z-10"
            aria-label="Fechar histórico"
          >
            <span className="sr-only">Fechar</span>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </SheetPrimitive.Close>
          <div className="px-4 pt-5 pb-3 border-b space-y-1">
            <SheetPrimitive.Title className="text-base font-semibold pr-8">
              {contact?.nome ?? "Contato"}
            </SheetPrimitive.Title>
            <SheetPrimitive.Description className="text-xs text-muted-foreground">
              {location || "Sem endereço"}
              {contact?.phone_e164 ? ` · ${contact.phone_e164}` : ""}
            </SheetPrimitive.Description>
            <div className="flex items-center justify-between pt-2">
              <div className="text-[11px] text-muted-foreground">
                {rows.length} {rows.length === 1 ? "registro" : "registros"}
                {pendingCount > 0 && (
                  <>
                    {" · "}
                    <span className="text-amber-700 font-medium">{pendingCount} pendente{pendingCount === 1 ? "" : "s"}</span>
                  </>
                )}
              </div>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={showHidden}
                  onChange={(e) => setShowHidden(e.target.checked)}
                  className="h-3 w-3"
                />
                Mostrar ocultas
              </label>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {query.isLoading && (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
              </div>
            )}
            {query.isError && (
              <div className="text-sm text-destructive p-3 border border-destructive/30 rounded bg-destructive/5">
                Não foi possível carregar o histórico.
              </div>
            )}
            {!query.isLoading && rows.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
                <Inbox className="h-8 w-8" />
                <div className="text-sm">Nenhum registro ainda</div>
                <div className="text-[11px]">
                  As ações e observações que você registrar neste contato aparecerão aqui.
                </div>
              </div>
            )}
            {rows.map((row) => (
              <LogCard
                key={row.id}
                row={row}
                onSetFollowUp={(status) => followMut.mutate({ logId: row.id, status })}
                onSetHidden={(hidden) => hideMut.mutate({ logId: row.id, hidden })}
                busy={
                  (followMut.isPending && followMut.variables?.logId === row.id) ||
                  (hideMut.isPending && hideMut.variables?.logId === row.id)
                }
              />
            ))}
          </div>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}

function LogCard({
  row,
  onSetFollowUp,
  onSetHidden,
  busy,
}: {
  row: ContactTerritoryLogRow;
  onSetFollowUp: (status: "pendente" | "concluido" | null) => void;
  onSetHidden: (hidden: boolean) => void;
  busy: boolean;
}) {
  const label = ACTION_LABEL[row.action] ?? row.action;
  const isHidden = !!row.hidden_at;
  const followable = canFollowUp(row.action);
  const status = row.follow_up_status;

  const relative = (() => {
    try {
      return formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: ptBR });
    } catch {
      return "";
    }
  })();
  const absolute = (() => {
    try {
      return new Date(row.created_at).toLocaleString("pt-BR");
    } catch {
      return "";
    }
  })();

  return (
    <div
      className={`rounded-lg border bg-card p-3 space-y-1.5 transition ${isHidden ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{actionIcon(row.action)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{label}</span>
            {status === "pendente" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                pendente
              </span>
            )}
            {status === "concluido" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                concluído
              </span>
            )}
            {isHidden && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                oculto
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground" title={absolute}>
            {relative}
            {row.author_name ? ` · ${row.author_name}` : ""}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={busy}
            className="h-7 w-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            aria-label="Ações"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {followable && status !== "pendente" && (
              <DropdownMenuItem onClick={() => onSetFollowUp("pendente")}>
                <CircleDot className="h-4 w-4 mr-2 text-amber-600" /> Marcar como pendente
              </DropdownMenuItem>
            )}
            {followable && status !== "concluido" && (
              <DropdownMenuItem onClick={() => onSetFollowUp("concluido")}>
                <CircleCheck className="h-4 w-4 mr-2 text-emerald-600" /> Marcar como concluído
              </DropdownMenuItem>
            )}
            {followable && status !== null && (
              <DropdownMenuItem onClick={() => onSetFollowUp(null)}>
                <CircleDot className="h-4 w-4 mr-2 text-muted-foreground" /> Remover status
              </DropdownMenuItem>
            )}
            {followable && <DropdownMenuSeparator />}
            {isHidden ? (
              <DropdownMenuItem onClick={() => onSetHidden(false)}>
                <Eye className="h-4 w-4 mr-2" /> Reexibir
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onSetHidden(true)}>
                <EyeOff className="h-4 w-4 mr-2" /> Ocultar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {row.note && (
        <div className="text-sm text-foreground bg-muted/40 rounded px-2 py-1.5 border whitespace-pre-wrap ml-6">
          {row.note}
        </div>
      )}
    </div>
  );
}
