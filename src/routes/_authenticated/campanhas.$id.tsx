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

  const [previewData, setPreviewData] = useState<{
    janelaAberta: number; janelaFechadaComTemplate: number; janelaFechadaSemTemplate: number; elegíveis: number;
  } | null>(null);

  const preview = useMutation({
    mutationFn: () => previewFn({ data: { id } }),
    onSuccess: (r) => {
      const detalhes: string[] = [];
      if (r.semConsent) detalhes.push(`${r.semConsent} sem consentimento`);
      if (r.optOut) detalhes.push(`${r.optOut} opt-out`);
      if (r.arquivados) detalhes.push(`${r.arquivados} arquivados`);
      if (r.semTelefone) detalhes.push(`${r.semTelefone} sem telefone`);
      setPreviewData({
        elegíveis: r.elegíveis,
        janelaAberta: r.janelaAberta,
        janelaFechadaComTemplate: r.janelaFechadaComTemplate,
        janelaFechadaSemTemplate: r.janelaFechadaSemTemplate,
      });
      toast.success(`Prévia: ${r.elegíveis} aptos de ${r.totalBruto}${detalhes.length ? ` · ${detalhes.join(" · ")}` : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const prepare = useMutation({
    mutationFn: () => prepareFn({ data: { id } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Fila preparada: ${r.total} destinatários${r.ignorados ? ` · ${r.ignorados} ignorados` : ""}`);
        qc.invalidateQueries({ queryKey: ["campaign", id] });
      } else {
        toast.error(r.message ?? "Não foi possível preparar.");
      }
    },
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

  const statusLabel: Record<string, string> = {
    draft: "Rascunho",
    scheduled: "Agendada",
    running: "Em envio",
    paused: "Pausada",
    done: "Concluída",
    canceled: "Cancelada",
  };
  const total = c.total_destinatarios ?? 0;
  const enviados = c.total_enviados ?? 0;
  const falhas = c.total_falhas ?? 0;
  const restantes = Math.max(0, total - enviados - falhas);
  const progresso = total > 0 ? Math.round(((enviados + falhas) / total) * 100) : 0;

  return (
    <div className="p-6 md:p-10 max-w-5xl">
      <Link to="/campanhas" className="text-sm text-muted-foreground flex items-center gap-1 mb-3"><ArrowLeft className="h-3 w-3" /> Voltar</Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{c.nome}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge className={statusColors[c.status] ?? ""}>{statusLabel[c.status] ?? c.status}</Badge>
            <span className="text-xs text-muted-foreground">Tipo: {c.tipo}</span>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Público: <b>{total}</b></div>
          <div>Enviados: <b className="text-emerald-600">{enviados}</b></div>
          <div>Falhas: <b className="text-red-600">{falhas}</b></div>
          <div>Faltam: <b>{restantes}</b></div>
        </div>
      </div>

      {total > 0 && (
        <div className="mb-6">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progresso}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{progresso}% concluído · {enviados} enviados de {total}</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <section className="border rounded-xl p-5 bg-card">
          <h2 className="font-semibold mb-2">Mensagem</h2>
          <div className="text-sm whitespace-pre-wrap border rounded p-3 bg-background">{c.mensagem_template}</div>
          {(c as unknown as { link_url?: string | null }).link_url && (
            <div className="mt-3 border rounded p-3 bg-muted/30 text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Link anexado:</span>
                <a href={(c as unknown as { link_url: string }).link_url} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">
                  {(c as unknown as { link_url: string }).link_url}
                </a>
              </div>
              {(c as unknown as { link_title?: string | null }).link_title && (
                <div><b>Título:</b> {(c as unknown as { link_title: string }).link_title}</div>
              )}
              <div className="text-muted-foreground">O link é enviado ao final da mensagem. A prévia é gerada pelo WhatsApp do destinatário quando o site permitir.</div>
            </div>
          )}
          {(c.midia_filename || c.midia_url) && (
            <div className="mt-2 text-xs text-muted-foreground">Anexo: <b>{c.midia_filename ?? c.midia_url}</b> {c.midia_mime ? `(${c.midia_mime})` : ""}</div>
          )}
        </section>

        <section className="border rounded-xl p-5 bg-card">
          <h2 className="font-semibold mb-1">Ações</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Fluxo: <b>1)</b> Preparar destinatários → <b>2)</b> Iniciar envio. Depois o sistema envia sozinho a cada minuto.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => preview.mutate()} disabled={preview.isPending} title="Simula a lista final aplicando filtros e opt-out, sem enviar nada.">
              <Eye className="h-4 w-4 mr-1" /> Ver prévia
            </Button>
            <Button variant="outline" onClick={() => prepare.mutate()} disabled={prepare.isPending || c.status === "running"} title="Monta a fila de destinatários. Faça isso antes de iniciar o envio.">
              <Package className="h-4 w-4 mr-1" /> 1. Preparar destinatários
            </Button>
            {c.status !== "running" && c.status !== "done" && c.status !== "canceled" && (
              <Button onClick={() => start.mutate()} disabled={start.isPending} title="Inicia o envio. O sistema processa lotes automaticamente a cada minuto.">
                <Play className="h-4 w-4 mr-1" /> 2. Iniciar envio
              </Button>
            )}
            {inSending && (
              <>
                <Button variant="secondary" onClick={() => batch.mutate()} disabled={batch.isPending} title="Força o envio do próximo lote agora, sem esperar o próximo minuto.">
                  <Send className="h-4 w-4 mr-1" /> Enviar próximo lote agora
                </Button>
                <Button variant="outline" onClick={() => setAutoRun((v) => !v)} title="Envia lotes seguidos direto do seu navegador. Deixe desligado — o servidor já processa sozinho.">
                  {autoRun ? "Parar auto-envio (navegador)" : "Auto-envio (navegador)"}
                </Button>
                <Button variant="outline" onClick={() => pause.mutate()} title="Pausa o envio. Nenhuma nova mensagem sai até você retomar.">
                  <Pause className="h-4 w-4 mr-1" /> Pausar envio
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
                <th className="text-left p-2">Como foi enviado</th>
                <th className="text-left p-2">Prévia do link</th>
                <th className="text-left p-2">Enviado em</th>
                <th className="text-left p-2">Observação</th>
              </tr>
            </thead>
            <tbody>
              {camp.data.recipients.map((r) => {
                const ct = (r as unknown as { contacts: { nome: string | null; phone_e164: string | null } | null }).contacts;
                const ep = (r as unknown as { endpoint_used: string | null }).endpoint_used;
                const ps = (r as unknown as { preview_status: string | null }).preview_status;
                const epLabel: Record<string, string> = {
                  "send-text": "Texto (prévia automática)",
                  "send-link": "Link com prévia forçada",
                  "send-image": "Imagem",
                  "send-document": "Documento",
                  "send-template": "Template oficial (fora da janela de 24h)",
                };
                const psLabel: Record<string, { txt: string; cls: string }> = {
                  "preview_confirmada": { txt: "Confirmada", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
                  "preview_provavel": { txt: "Provável", cls: "bg-amber-100 text-amber-800 border-amber-300" },
                  "preview_indisponivel": { txt: "Indisponível", cls: "bg-red-100 text-red-800 border-red-300" },
                  "link_bloqueado": { txt: "Bloqueado", cls: "bg-red-100 text-red-800 border-red-300" },
                  "sem_link": { txt: "Sem link", cls: "bg-muted text-muted-foreground" },
                };
                const ps2 = ps ? psLabel[ps] : null;
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{ct?.nome ?? "—"}</td>
                    <td className="p-2">{ct?.phone_e164 ?? "—"}</td>
                    <td className="p-2"><Badge variant="outline">{r.status}</Badge></td>
                    <td className="p-2">{ep ? (epLabel[ep] ?? ep) : "—"}</td>
                    <td className="p-2">{ps2 ? <span className={`px-2 py-0.5 rounded border text-[11px] ${ps2.cls}`}>{ps2.txt}</span> : "—"}</td>
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
