import { createFileRoute, Link } from "@tanstack/react-router";
import { CommunicationTabs } from "@/components/CommunicationTabs";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listCampaigns, upsertCampaign, deleteCampaign } from "@/lib/campaigns.functions";
import { listSegments } from "@/lib/segments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Send, Info, Users } from "lucide-react";
import { MessageComposer, emptyComposerValue, type ComposerValue } from "@/components/MessageComposer";

export const Route = createFileRoute("/_authenticated/campanhas/")({
  head: () => ({ meta: [{ title: "Campanhas" }] }),
  component: CampanhasPage,
});

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  scheduled: "bg-blue-100 text-blue-700",
  running: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  done: "bg-slate-200 text-slate-600",
  canceled: "bg-red-100 text-red-700",
};

type FormMeta = {
  nome: string;
  segment_id: string;
  agendado_para: string;
  delay_min_ms: number;
  delay_max_ms: number;
};

const emptyMeta = (): FormMeta => ({
  nome: "",
  segment_id: "",
  agendado_para: "",
  delay_min_ms: 3000,
  delay_max_ms: 8000,
});

function CampanhasPage() {
  const listFn = useServerFn(listCampaigns);
  const segFn = useServerFn(listSegments);
  const upsertFn = useServerFn(upsertCampaign);
  const delFn = useServerFn(deleteCampaign);
  const qc = useQueryClient();

  const list = useSuspenseQuery({ queryKey: ["campaigns"], queryFn: () => listFn() });
  const segs = useSuspenseQuery({ queryKey: ["segments"], queryFn: () => segFn() });

  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<FormMeta>(emptyMeta);
  const [composer, setComposer] = useState<ComposerValue>(emptyComposerValue);

  const selectedSegment = useMemo(
    () => segs.data.rows.find((s) => s.id === meta.segment_id) ?? null,
    [segs.data.rows, meta.segment_id],
  );

  const segmentCountLabel = useMemo(() => {
    if (!selectedSegment) return null;
    const seg = selectedSegment as { tipo: string; member_ids?: string[] | null };
    if (seg.tipo === "estatico") {
      const n = Array.isArray(seg.member_ids) ? seg.member_ids.length : 0;
      return `${n} contato${n === 1 ? "" : "s"} no segmento`;
    }
    return "Contagem calculada ao preparar destinatários";
  }, [selectedSegment]);

  const create = useMutation({
    mutationFn: () => {
      const tipo: "text" | "image" | "document" | "link" =
        composer.media_mime?.startsWith("image/") ? "image"
        : composer.media_mime === "application/pdf" ? "document"
        : composer.link_url ? "link"
        : "text";
      return upsertFn({
        data: {
          nome: meta.nome,
          tipo,
          mensagem_template: composer.body,
          segment_id: meta.segment_id || null,
          agendado_para: meta.agendado_para ? new Date(meta.agendado_para).toISOString() : null,
          delay_min_ms: meta.delay_min_ms,
          delay_max_ms: meta.delay_max_ms,
          midia_path: composer.media_path,
          midia_mime: composer.media_mime,
          midia_filename: composer.media_filename,
          link_url: composer.link_url,
          link_title: composer.link_title,
          link_description: composer.link_description,
          link_image: composer.link_image,
        },
      });
    },
    onSuccess: () => {
      toast.success("Campanha criada como rascunho");
      setOpen(false);
      setMeta(emptyMeta());
      setComposer(emptyComposerValue());
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Excluída"); qc.invalidateQueries({ queryKey: ["campaigns"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    meta.nome.trim().length > 0 &&
    composer.body.trim().length > 0 &&
    meta.segment_id.length > 0 &&
    !create.isPending;

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <div className="-mx-6 md:-mx-10 -mt-6 md:-mt-10 mb-6"><CommunicationTabs /></div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Send className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Campanhas</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nova campanha</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>

            <div className="rounded-md border bg-primary/5 text-primary/90 text-xs p-3 flex gap-2 mb-3">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Mensagem e campanha usam o mesmo editor. Uma <b>mensagem salva</b> vira modelo reutilizável
                (usada em automações e no Inbox). Uma <b>campanha</b> dispara essa mensagem para um
                público-alvo, agora ou agendada.
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium">Nome da campanha</label>
                <Input
                  placeholder="Ex.: Aviso de reunião — Zona Norte"
                  value={meta.nome}
                  onChange={(e) => setMeta({ ...meta, nome: e.target.value })}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Uso interno — não aparece para os contatos.</p>
              </div>

              <div>
                <label className="text-xs font-medium flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Público-alvo (obrigatório)
                </label>
                <select
                  className="mt-1 w-full border rounded-md px-2 h-9 text-sm bg-background"
                  value={meta.segment_id}
                  onChange={(e) => setMeta({ ...meta, segment_id: e.target.value })}
                >
                  <option value="">— Selecione um segmento —</option>
                  {segs.data.rows.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {segmentCountLabel
                    ? `Selecionado: ${segmentCountLabel}.`
                    : "Escolha o grupo de contatos que receberá esta mensagem. Para criar campanhas a partir de contatos filtrados, use a tela Contatos."}
                </p>
              </div>

              <MessageComposer value={composer} onChange={setComposer} />

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Agendado para</label>
                  <Input
                    type="datetime-local"
                    value={meta.agendado_para}
                    onChange={(e) => setMeta({ ...meta, agendado_para: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Delay mín. (ms)</label>
                  <Input
                    type="number"
                    value={meta.delay_min_ms}
                    onChange={(e) => setMeta({ ...meta, delay_min_ms: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Delay máx. (ms)</label>
                  <Input
                    type="number"
                    value={meta.delay_max_ms}
                    onChange={(e) => setMeta({ ...meta, delay_max_ms: Number(e.target.value) })}
                  />
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => create.mutate()}
                disabled={!canSubmit}
                title={
                  !meta.segment_id ? "Selecione um público-alvo"
                  : !meta.nome.trim() ? "Informe o nome"
                  : !composer.body.trim() ? "Escreva a mensagem"
                  : ""
                }
              >
                {create.isPending ? "Criando..." : "Criar como rascunho"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        Uma campanha é uma ação de envio para um público. Ela pode usar uma mensagem salva, ser enviada agora ou ser agendada.
      </p>

      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase">
            <tr>
              <th className="text-left p-3">Nome</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Público</th>
              <th className="text-right p-3">Enviados</th>
              <th className="text-right p-3">Falhas</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.data.rows.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-3">
                  <Link to="/campanhas/$id" params={{ id: c.id }} className="font-medium text-primary hover:underline">{c.nome}</Link>
                  <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("pt-BR")}</div>
                </td>
                <td className="p-3"><Badge className={statusColors[c.status] ?? ""}>{c.status}</Badge></td>
                <td className="p-3 text-right tabular-nums">{c.total_destinatarios ?? 0}</td>
                <td className="p-3 text-right tabular-nums">{c.total_enviados ?? 0}</td>
                <td className="p-3 text-right tabular-nums text-red-600">{c.total_falhas ?? 0}</td>
                <td className="p-3 text-right">
                  {(c.status === "draft" || c.status === "canceled") && (
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir campanha?")) del.mutate(c.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!list.data.rows.length && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhuma campanha ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
