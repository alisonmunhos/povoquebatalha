// Janela para disparar um fluxo de cadastro para quem mandou mensagem nas
// últimas 24h — regra da Meta para texto livre fora de modelo aprovado.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listFlowEligibleRecipients,
  startWhatsappFlowForMany,
} from "@/lib/whatsapp-flows.functions";

type Recipient = {
  phone: string;
  last_message: string | null;
  last_at: string;
  contact_id: string | null;
  nome: string | null;
  cidade: string | null;
  session_status: string | null;
  session_step: number | null;
};

function formatPhone(digits: string): string {
  const d = digits.replace(/\D+/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h}h${min % 60 ? ` ${min % 60}min` : ""}`;
}

function statusLabel(r: Recipient): string | null {
  if (r.session_status === "completed") return "cadastro já concluído";
  if (r.session_status === "running" || r.session_status === "opening")
    return `já está respondendo (pergunta ${(r.session_step ?? 0) + 1})`;
  return null;
}

export function FlowSendDialog({
  flowId,
  flowName,
  open,
  onOpenChange,
}: {
  flowId: string;
  flowName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listFlowEligibleRecipients);
  const sendFn = useServerFn(startWhatsappFlowForMany);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["flow-eligible-recipients"],
    queryFn: () => listFn(),
    enabled: open,
    staleTime: 30_000,
  });

  const recipients = useMemo(() => (data?.recipients ?? []) as Recipient[], [data]);

  // Pré-seleciona só quem ainda não está num fluxo, para evitar reinício sem querer.
  useEffect(() => {
    if (!open) return;
    setSelected(recipients.filter((r) => !statusLabel(r)).map((r) => r.phone));
  }, [open, recipients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipients;
    const digits = q.replace(/\D+/g, "");
    return recipients.filter(
      (r) =>
        (r.nome ?? "").toLowerCase().includes(q) ||
        (digits.length >= 3 && r.phone.includes(digits)),
    );
  }, [recipients, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.includes(r.phone));

  const sendMutation = useMutation({
    mutationFn: (phones: string[]) => sendFn({ data: { flow_id: flowId, phones } }),
    onSuccess: (res) => {
      const { enviados, falhas } = res as { enviados: number; falhas: { phone: string; motivo: string }[] };
      if (enviados > 0) {
        toast.success(
          `Fluxo enviado para ${enviados} ${enviados === 1 ? "pessoa" : "pessoas"}.`,
        );
      }
      if (falhas.length) {
        toast.error(
          `${falhas.length} não receberam: ${falhas
            .slice(0, 3)
            .map((f) => `${formatPhone(f.phone)} (${f.motivo})`)
            .join("; ")}${falhas.length > 3 ? "…" : ""}`,
          { duration: 10_000 },
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-flows"] });
      void queryClient.invalidateQueries({ queryKey: ["flow-eligible-recipients"] });
      if (!falhas.length) onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao enviar o fluxo."),
  });

  const confirmAndSend = () => {
    if (!selected.length) {
      toast.error("Escolha pelo menos uma pessoa.");
      return;
    }
    const ok = window.confirm(
      `Enviar o fluxo “${flowName}” para ${selected.length} ${
        selected.length === 1 ? "pessoa" : "pessoas"
      }? Cada uma recebe a mensagem de abertura e a 1ª pergunta agora. Conversas de fluxo em andamento nesses números serão reiniciadas.`,
    );
    if (ok) sendMutation.mutate(selected);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Enviar “{flowName}” para quem falou nas últimas 24h</DialogTitle>
          <DialogDescription>
            Só aparecem pessoas que mandaram mensagem nas últimas 24 horas — é a única janela em
            que o WhatsApp permite conversa livre. Quem já está respondendo um cadastro vem
            desmarcado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou número"
              className="pl-8"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!filtered.length}
            onClick={() =>
              setSelected((prev) =>
                allFilteredSelected
                  ? prev.filter((p) => !filtered.some((r) => r.phone === p))
                  : [...new Set([...prev, ...filtered.map((r) => r.phone)])],
              )
            }
          >
            {allFilteredSelected ? "Desmarcar todos" : "Selecionar todos"}
          </Button>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando quem está na janela…
          </div>
        ) : recipients.length === 0 ? (
          <div className="text-muted-foreground p-6 text-sm">
            Ninguém mandou mensagem nas últimas 24 horas. Peça para a pessoa escrever qualquer coisa
            para o número da campanha e a janela abre na hora.
          </div>
        ) : (
          <ScrollArea className="max-h-[45dvh] rounded-md border">
            <ul className="divide-y">
              {filtered.map((r) => {
                const label = statusLabel(r);
                const checked = selected.includes(r.phone);
                return (
                  <li key={r.phone} className="flex items-start gap-3 p-3">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        setSelected((prev) =>
                          v ? [...new Set([...prev, r.phone])] : prev.filter((p) => p !== r.phone),
                        )
                      }
                      aria-label={`Selecionar ${r.nome ?? formatPhone(r.phone)}`}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.nome ?? formatPhone(r.phone)}</span>
                        {r.nome ? (
                          <span className="text-muted-foreground text-xs">
                            {formatPhone(r.phone)}
                          </span>
                        ) : (
                          <Badge variant="outline">sem cadastro</Badge>
                        )}
                        {label ? <Badge variant="secondary">{label}</Badge> : null}
                      </div>
                      <p className="text-muted-foreground truncate text-xs">
                        {timeAgo(r.last_at)}
                        {r.last_message ? ` · “${r.last_message}”` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}

        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Enviar para quem não pediu contato aumenta o risco de bloqueio do número. Prefira quem
          acabou de escrever ou veio de anúncio.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={confirmAndSend} disabled={sendMutation.isPending || !selected.length}>
            {sendMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Enviar para {selected.length} {selected.length === 1 ? "pessoa" : "pessoas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
