import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  createNotification,
  listNotificationBatches,
  getNotificationBatchDetail,
  cancelNotificationBatch,
} from "@/lib/notifications.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useCurrentUserRole } from "@/hooks/use-current-role";
import fistAsset from "@/assets/fist-alert.png.asset.json";

export const Route = createFileRoute("/_authenticated/agitacao-notificacoes")({
  head: () => ({ meta: [{ title: "Central de Notificações — Povo que Batalha" }] }),
  component: NotificacoesAdminPage,
});

type CtaKind = "none" | "wa_me" | "link" | "calendar";

function NotificacoesAdminPage() {
  const role = useCurrentUserRole();
  const createFn = useServerFn(createNotification);
  const listBatchesFn = useServerFn(listNotificationBatches);
  const detailFn = useServerFn(getNotificationBatchDetail);
  const cancelBatchFn = useServerFn(cancelNotificationBatch);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ctaKind, setCtaKind] = useState<CtaKind>("none");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaPhone, setCtaPhone] = useState("");
  const [ctaMessage, setCtaMessage] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [calTitle, setCalTitle] = useState("");
  const [calStart, setCalStart] = useState("");
  const [calEnd, setCalEnd] = useState("");
  const [calLocation, setCalLocation] = useState("");
  const [targetMode, setTargetMode] = useState<"all_staff" | "role">("all_staff");
  const [targetRole, setTargetRole] = useState<"admin" | "operador" | "agitador" | "comunicacao">("agitador");

  const [kindFilter, setKindFilter] = useState<"all" | "mission" | "general">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "cancelled">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedBatchKey, setSelectedBatchKey] = useState<string | null>(null);

  const historyQ = useQuery({
    queryKey: ["notif-admin-batches", kindFilter, statusFilter, dateFrom, dateTo],
    queryFn: () =>
      listBatchesFn({
        data: {
          kind: kindFilter,
          status: statusFilter,
          date_from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
          date_to: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
        },
      }),
  });

  const detailQ = useQuery({
    queryKey: ["notif-batch-detail", selectedBatchKey],
    queryFn: () => detailFn({ data: { batch_key: selectedBatchKey! } }),
    enabled: !!selectedBatchKey,
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      if (ctaKind === "wa_me") {
        payload.phone = ctaPhone.replace(/\D/g, "");
        payload.message = ctaMessage;
      } else if (ctaKind === "link") {
        payload.url = ctaUrl;
      } else if (ctaKind === "calendar") {
        payload.title = calTitle || title;
        payload.start = calStart ? new Date(calStart).toISOString() : new Date().toISOString();
        payload.end = calEnd ? new Date(calEnd).toISOString() : new Date(Date.now() + 3600_000).toISOString();
        payload.location = calLocation;
      }
      return createFn({
        data: {
          title,
          body: body || null,
          image_url: imageUrl || null,
          kind: "custom",
          cta_kind: ctaKind === "none" ? null : ctaKind,
          cta_label: ctaKind === "none" ? null : ctaLabel || "Abrir",
          cta_payload: payload,
          target:
            targetMode === "all_staff"
              ? { mode: "all_staff" }
              : { mode: "role", role: targetRole },
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Notificação enviada para ${res.inserted} pessoa(s).`);
      setTitle("");
      setBody("");
      setImageUrl("");
      setCtaLabel("");
      setCtaPhone("");
      setCtaMessage("");
      setCtaUrl("");
      setCalTitle("");
      setCalStart("");
      setCalEnd("");
      setCalLocation("");
      historyQ.refetch();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function onCancelBatch(batchKey: string) {
    if (!confirm("Cancelar este envio inteiro? Ele some da lista de todos os destinatários.")) return;
    try {
      const res = await cancelBatchFn({ data: { batch_key: batchKey } });
      toast.success(`${res.cancelled} notificação(ões) cancelada(s).`);
      historyQ.refetch();
      if (selectedBatchKey === batchKey) detailQ.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cancelar.");
    }
  }

  if (role !== "admin" && role !== "operador") {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-sm text-muted-foreground">Acesso restrito a admin/moderador.</p>
      </div>
    );
  }

  const canSubmit = title.trim().length > 0 && !sendMut.isPending;
  const batches = historyQ.data?.batches ?? [];
  const detail = detailQ.data;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl">Central de Notificações</h1>
        <p className="text-sm text-muted-foreground">
          Envie avisos direto pro sino da equipe. Aparecem em tempo real.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="space-y-2">
          <Label>Título *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex: Missão nova disponível" />
        </div>
        <div className="space-y-2">
          <Label>Mensagem</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} />
        </div>
        <div className="space-y-2">
          <Label>Imagem (URL, opcional)</Label>
          <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
        </div>

        <div className="space-y-2">
          <Label>Ação do botão</Label>
          <Select value={ctaKind} onValueChange={(v) => setCtaKind(v as CtaKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem botão</SelectItem>
              <SelectItem value="wa_me">Abrir WhatsApp (wa.me)</SelectItem>
              <SelectItem value="link">Abrir link</SelectItem>
              <SelectItem value="calendar">Adicionar à agenda (.ics)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {ctaKind !== "none" && (
          <div className="space-y-2">
            <Label>Texto do botão</Label>
            <Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Abrir" />
          </div>
        )}

        {ctaKind === "wa_me" && (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Telefone (com DDI)</Label>
              <Input value={ctaPhone} onChange={(e) => setCtaPhone(e.target.value)} placeholder="+5551..." />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Mensagem pré-preenchida</Label>
              <Textarea value={ctaMessage} onChange={(e) => setCtaMessage(e.target.value)} rows={3} />
            </div>
          </div>
        )}

        {ctaKind === "link" && (
          <div className="space-y-2">
            <Label>URL de destino</Label>
            <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." />
          </div>
        )}

        {ctaKind === "calendar" && (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Título do evento</Label>
              <Input value={calTitle} onChange={(e) => setCalTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Início</Label>
              <Input type="datetime-local" value={calStart} onChange={(e) => setCalStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input type="datetime-local" value={calEnd} onChange={(e) => setCalEnd(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Local</Label>
              <Input value={calLocation} onChange={(e) => setCalLocation(e.target.value)} />
            </div>
          </div>
        )}

        <div className="border-t pt-4 space-y-2">
          <Label>Enviar para</Label>
          <Select value={targetMode} onValueChange={(v) => setTargetMode(v as "all_staff" | "role")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all_staff">Todo mundo (equipe inteira)</SelectItem>
              <SelectItem value="role">Papel específico</SelectItem>
            </SelectContent>
          </Select>
          {targetMode === "role" && (
            <Select value={targetRole} onValueChange={(v) => setTargetRole(v as typeof targetRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="agitador">Agitadores</SelectItem>
                <SelectItem value="operador">Operadores</SelectItem>
                <SelectItem value="comunicacao">Comunicação</SelectItem>
                <SelectItem value="admin">Administradores</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <Button onClick={() => sendMut.mutate()} disabled={!canSubmit} className="w-full">
          {sendMut.isPending ? "Enviando…" : "Enviar notificação"}
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <h2 className="font-semibold">Envios recentes</h2>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="mission">Missão</SelectItem>
                <SelectItem value="general">Aviso geral</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-1">
            <Label className="text-xs">Período</Label>
            <div className="flex gap-1">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-xs" />
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-xs" />
            </div>
          </div>
        </div>

        {historyQ.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {batches.length === 0 && !historyQ.isLoading && (
          <p className="text-sm text-muted-foreground">Nenhum envio encontrado.</p>
        )}

        <div className="rounded-md border divide-y">
          {batches.map((b) => (
            <button
              key={b.batch_key}
              type="button"
              onClick={() => setSelectedBatchKey(b.batch_key)}
              className="w-full text-left px-3 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate flex items-center gap-2">
                    {b.title}
                    {b.kind === "mission" && (
                      <span className="text-[10px] rounded-full bg-primary/10 text-primary px-1.5 py-0.5 shrink-0">
                        Missão
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(b.sent_at).toLocaleString("pt-BR")} · {b.recipient_count} destinatário(s) · {b.read_count} abriram
                  </div>
                </div>
                <span
                  className={`text-[10px] rounded-full px-2 py-0.5 shrink-0 ${
                    b.status === "cancelled"
                      ? "bg-rose-100 text-rose-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {b.status === "cancelled" ? "Cancelada" : "Ativa"}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <Dialog open={!!selectedBatchKey} onOpenChange={(v) => !v && setSelectedBatchKey(null)}>
        <DialogContent className="p-0 gap-0 max-w-lg w-[calc(100vw-1rem)] max-h-[90dvh] overflow-hidden flex flex-col">
          {detail && (
            <>
              <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 pr-12 border-b bg-card">
                {detail.preview.kind === "mission" && (
                  <span className="text-[10px] font-bold tracking-wide rounded-full bg-primary/10 text-primary px-2 py-0.5">
                    MISSÃO
                  </span>
                )}
                <div className="font-semibold text-sm truncate">{detail.preview.title}</div>
              </div>
              <div className="overflow-y-auto flex-1 p-4 space-y-4">
                <div className="rounded-lg border p-3 bg-muted/30">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Prévia</div>
                  <div className="flex items-start gap-2">
                    {detail.preview.image_url ? (
                      <img src={detail.preview.image_url} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <img src={fistAsset.url} alt="" className="h-6 w-6" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{detail.preview.title}</div>
                      {detail.preview.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{detail.preview.body}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Enviado em {new Date(detail.preview.sent_at).toLocaleString("pt-BR")} · {detail.recipient_count} destinatário(s) · {detail.read_count} abriram ·{" "}
                  <span className={detail.status === "cancelled" ? "text-rose-700" : "text-emerald-700"}>
                    {detail.status === "cancelled" ? "Cancelada" : "Ativa"}
                  </span>
                </div>

                <div>
                  <div className="text-sm font-semibold mb-2">Destinatários</div>
                  <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                    {detail.recipients.map((r) => (
                      <div key={r.id} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
                        <span className="font-medium">{r.name}</span>
                        <span className="text-xs text-muted-foreground text-right">
                          {r.read_at
                            ? `Abriu em ${new Date(r.read_at).toLocaleString("pt-BR")}`
                            : "Não abriu"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {detail.mission_activity.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold mb-2">Atividade da missão</div>
                    <div className="rounded-md border divide-y">
                      {detail.mission_activity.map((a, i) => (
                        <div key={`${a.user_id}-${a.claimed_at}-${i}`} className="px-3 py-2 text-sm">
                          <div className="font-medium">{a.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Pegou {a.task_count} contato(s) em {new Date(a.claimed_at).toLocaleString("pt-BR")}
                            {a.completed_at && ` · concluiu em ${new Date(a.completed_at).toLocaleString("pt-BR")}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detail.status === "active" && (
                  <Button variant="outline" className="w-full text-rose-700" onClick={() => onCancelBatch(detail.batch_key)}>
                    Cancelar envio inteiro
                  </Button>
                )}
              </div>
            </>
          )}
          {detailQ.isLoading && (
            <div className="p-6 text-sm text-muted-foreground">Carregando detalhe…</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
