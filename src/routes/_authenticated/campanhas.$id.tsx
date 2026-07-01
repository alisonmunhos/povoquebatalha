import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  getCampaign, previewCampaign, prepareCampaign, startCampaign,
  pauseCampaign, cancelCampaign, processCampaignBatch,
} from "@/lib/campaigns.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, Play, Pause, StopCircle, Eye, Package, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/campanhas/$id")({
  head: () => ({ meta: [{ title: "Campanha" }] }),
  component: CampanhaDetail,
});

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  scheduled: "bg-blue-100 text-blue-700",
  running: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  done: "bg-slate-200 text-slate-600",
  canceled: "bg-red-100 text-red-700",
};

function CampanhaDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getCampaign);
  const previewFn = useServerFn(previewCampaign);
  const prepareFn = useServerFn(prepareCampaign);
  const startFn = useServerFn(startCampaign);
  const pauseFn = useServerFn(pauseCampaign);
  const cancelFn = useServerFn(cancelCampaign);
  const batchFn = useServerFn(processCampaignBatch);

  const camp = useSuspenseQuery({
    queryKey: ["campaign", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: 4000,
  });

  const [motivo, setMotivo] = useState("");
  const [autoRun, setAutoRun] = useState(false);
  const autoRef = useRef(false);
  autoRef.current = autoRun;

  const preview = useMutation({
    mutationFn: () => previewFn({ data: { id } }),
    onSuccess: (r) => toast.success(`Prévia: ${r.elegíveis} elegíveis de ${r.totalBruto} no público bruto`),
    onError: (e: Error) => toast.error(e.message),
  });
  const prepare = useMutation({
    mutationFn: () => prepareFn({ data: { id } }),
    onSuccess: (r) => { toast.success(`Fila preparada: ${r.total} destinatários`); qc.invalidateQueries({ queryKey: ["campaign", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const start = useMutation({
    mutationFn: () => startFn({ data: { id } }),
    onSuccess: () => { toast.success("Envio iniciado"); qc.invalidateQueries({ queryKey: ["campaign", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const pause = useMutation({
    mutationFn: () => pauseFn({ data: { id } }),
    onSuccess: () => { toast.info("Envio pausado"); setAutoRun(false); qc.invalidateQueries({ queryKey: ["campaign", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { id, motivo } }),
    onSuccess: () => { toast.success("Campanha cancelada"); setAutoRun(false); qc.invalidateQueries({ queryKey: ["campaign", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const batch = useMutation({
    mutationFn: () => batchFn({ data: { id, batchSize: 5 } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["campaign", id] }); if (r.done) setAutoRun(false); },
    onError: (e: Error) => { toast.error(e.message); setAutoRun(false); },
  });

  // Loop de auto-envio no cliente enquanto autoRun=true e status=running
  useEffect(() => {
    if (!autoRun) return;
    let stopped = false;
    (async () => {
      while (autoRef.current && !stopped) {
        try {
          const r = await batchFn({ data: { id, batchSize: 5 } });
          qc.invalidateQueries({ queryKey: ["campaign", id] });
          if (r.done) { setAutoRun(false); break; }
        } catch (e) {
          toast.error((e as Error).message);
          setAutoRun(false);
          break;
        }
      }
    })();
    return () => { stopped = true; };
  }, [autoRun, batchFn, id, qc]);

  const c = camp.data.campaign;
  if (!c) return null;
  const inSending = c.status === "running";
  const canCancel = ["running", "paused", "scheduled", "draft"].includes(c.status);

  return (
    <div className="p-6 md:p-10 max-w-5xl">
      <Link to="/campanhas" className="text-sm text-muted-foreground flex items-center gap-1 mb-3"><ArrowLeft className="h-3 w-3" /> Voltar</Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{c.nome}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge className={statusColors[c.status] ?? ""}>{c.status}</Badge>
            <span className="text-xs text-muted-foreground">Tipo: {c.tipo}</span>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Público: <b>{c.total_destinatarios ?? 0}</b></div>
          <div>Enviados: <b className="text-emerald-600">{c.total_enviados ?? 0}</b></div>
          <div>Falhas: <b className="text-red-600">{c.total_falhas ?? 0}</b></div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="border rounded-xl p-5 bg-card">
          <h2 className="font-semibold mb-2">Mensagem</h2>
          <div className="text-sm whitespace-pre-wrap border rounded p-3 bg-background">{c.mensagem_template}</div>
          {(c.midia_filename || c.midia_url) && (
            <div className="mt-2 text-xs text-muted-foreground">Anexo: <b>{c.midia_filename ?? c.midia_url}</b> {c.midia_mime ? `(${c.midia_mime})` : ""}</div>
          )}
        </section>

        <section className="border rounded-xl p-5 bg-card">
          <h2 className="font-semibold mb-3">Ações</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => preview.mutate()} disabled={preview.isPending}>
              <Eye className="h-4 w-4 mr-1" /> Prévia
            </Button>
            <Button variant="outline" onClick={() => prepare.mutate()} disabled={prepare.isPending || c.status === "running"}>
              <Package className="h-4 w-4 mr-1" /> Preparar fila
            </Button>
            {c.status !== "running" && c.status !== "done" && c.status !== "canceled" && (
              <Button onClick={() => start.mutate()} disabled={start.isPending}>
                <Play className="h-4 w-4 mr-1" /> Iniciar envio
              </Button>
            )}
            {inSending && (
              <>
                <Button variant="secondary" onClick={() => setAutoRun((v) => !v)}>
                  <Send className="h-4 w-4 mr-1" /> {autoRun ? "Parar auto-envio" : "Auto-processar lotes"}
                </Button>
                <Button variant="outline" onClick={() => batch.mutate()} disabled={batch.isPending}>
                  Processar 1 lote
                </Button>
                <Button variant="outline" onClick={() => pause.mutate()}>
                  <Pause className="h-4 w-4 mr-1" /> Pausar
                </Button>
              </>
            )}
          </div>

          {canCancel && (
            <div className="mt-4 border-t pt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="lg" className="w-full">
                    <StopCircle className="h-5 w-5 mr-2" /> CANCELAR ENVIO
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancelar envio da campanha?</AlertDialogTitle>
                    <AlertDialogDescription>
                      <b className="text-red-600">Envios já realizados não podem ser desfeitos.</b> Destinatários ainda na fila serão marcados como cancelados. Esta ação é definitiva.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <Textarea placeholder="Motivo do cancelamento (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  <AlertDialogFooter>
                    <AlertDialogCancel>Manter envio</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => cancel.mutate()}>
                      Confirmar cancelamento
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {c.canceled_at && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-900">
              Cancelada em {new Date(c.canceled_at).toLocaleString("pt-BR")}. {c.canceled_motivo ? `Motivo: ${c.canceled_motivo}` : ""}
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 border rounded-xl overflow-hidden">
        <div className="p-3 bg-muted/40 text-sm font-semibold">Destinatários ({camp.data.recipients.length})</div>
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Contato</th>
                <th className="text-left p-2">Telefone</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Enviado em</th>
                <th className="text-left p-2">Erro</th>
              </tr>
            </thead>
            <tbody>
              {camp.data.recipients.map((r) => {
                const ct = (r as unknown as { contacts: { nome: string | null; phone_e164: string | null } | null }).contacts;
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{ct?.nome ?? "—"}</td>
                    <td className="p-2">{ct?.phone_e164 ?? "—"}</td>
                    <td className="p-2"><Badge variant="outline">{r.status}</Badge></td>
                    <td className="p-2">{r.sent_at ? new Date(r.sent_at).toLocaleString("pt-BR") : "—"}</td>
                    <td className="p-2 text-red-600">{r.erro ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
