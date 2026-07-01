import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listCampaigns, upsertCampaign, deleteCampaign } from "@/lib/campaigns.functions";
import { listSegments } from "@/lib/segments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Send } from "lucide-react";

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

function CampanhasPage() {
  const listFn = useServerFn(listCampaigns);
  const segFn = useServerFn(listSegments);
  const upsertFn = useServerFn(upsertCampaign);
  const delFn = useServerFn(deleteCampaign);
  const qc = useQueryClient();

  const list = useSuspenseQuery({ queryKey: ["campaigns"], queryFn: () => listFn() });
  const segs = useSuspenseQuery({ queryKey: ["segments"], queryFn: () => segFn() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nome: "", tipo: "text" as "text" | "image", mensagem_template: "",
    midia_url: "", segment_id: "", agendado_para: "",
    delay_min_ms: 3000, delay_max_ms: 8000,
  });

  const create = useMutation({
    mutationFn: (payload: typeof form) => upsertFn({
      data: {
        nome: payload.nome,
        tipo: payload.tipo,
        mensagem_template: payload.mensagem_template,
        midia_url: payload.midia_url || null,
        segment_id: payload.segment_id || null,
        agendado_para: payload.agendado_para ? new Date(payload.agendado_para).toISOString() : null,
        delay_min_ms: payload.delay_min_ms,
        delay_max_ms: payload.delay_max_ms,
      },
    }),
    onSuccess: () => {
      toast.success("Campanha criada");
      setOpen(false);
      setForm({ nome: "", tipo: "text", mensagem_template: "", midia_url: "", segment_id: "", agendado_para: "", delay_min_ms: 3000, delay_max_ms: 8000 });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Excluída"); qc.invalidateQueries({ queryKey: ["campaigns"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Send className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Campanhas</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nova campanha</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Nome da campanha" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <select className="border rounded-md px-2 h-9 text-sm bg-background" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as "text" | "image" })}>
                  <option value="text">Texto</option>
                  <option value="image">Imagem</option>
                </select>
                <select className="border rounded-md px-2 h-9 text-sm bg-background" value={form.segment_id} onChange={(e) => setForm({ ...form, segment_id: e.target.value })}>
                  <option value="">— Selecione um segmento —</option>
                  {segs.data.rows.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </div>
              {form.tipo === "image" && (
                <Input placeholder="URL da imagem (https://...)" value={form.midia_url} onChange={(e) => setForm({ ...form, midia_url: e.target.value })} />
              )}
              <Textarea rows={6} placeholder="Mensagem. Use {{nome}}, {{primeiro_nome}}, {{cidade}}, {{bairro}}." value={form.mensagem_template} onChange={(e) => setForm({ ...form, mensagem_template: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Agendado para</label>
                  <Input type="datetime-local" value={form.agendado_para} onChange={(e) => setForm({ ...form, agendado_para: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Delay mín. (ms)</label>
                  <Input type="number" value={form.delay_min_ms} onChange={(e) => setForm({ ...form, delay_min_ms: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Delay máx. (ms)</label>
                  <Input type="number" value={form.delay_max_ms} onChange={(e) => setForm({ ...form, delay_max_ms: Number(e.target.value) })} />
                </div>
              </div>
              <Button className="w-full" onClick={() => create.mutate(form)} disabled={!form.nome || !form.mensagem_template || create.isPending}>
                {create.isPending ? "Criando..." : "Criar como rascunho"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
