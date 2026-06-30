import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Tags as TagsIcon, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listTagsWithUsage, upsertTag, deleteTag } from "@/lib/tags.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/tags")({
  head: () => ({ meta: [{ title: "Tags" }] }),
  component: TagsPage,
});

const CATEGORIAS = ["origem", "perfil", "interesse", "prioridade", "restricao", "acao", "territorio", "campanha", "interno"] as const;
type Cat = (typeof CATEGORIAS)[number];

type TagRow = { id: string; nome: string; cor: string; categoria: Cat; descricao: string | null; usage: number };

function TagsPage() {
  const listFn = useServerFn(listTagsWithUsage);
  const upsertFn = useServerFn(upsertTag);
  const delFn = useServerFn(deleteTag);
  const q = useQuery({ queryKey: ["tags-all"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<TagRow | null>(null);
  const [open, setOpen] = useState(false);

  function startNew() {
    setEditing({ id: "", nome: "", cor: "#64748b", categoria: "perfil", descricao: "", usage: 0 });
    setOpen(true);
  }
  function startEdit(t: TagRow) { setEditing({ ...t }); setOpen(true); }

  async function save() {
    if (!editing) return;
    try {
      await upsertFn({ data: {
        id: editing.id || undefined,
        nome: editing.nome.trim(),
        cor: editing.cor,
        categoria: editing.categoria,
        descricao: editing.descricao?.trim() || null,
      } });
      toast.success("Tag salva");
      setOpen(false); q.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar"); }
  }

  async function remove(t: TagRow) {
    if (t.usage > 0) {
      if (!confirm(`Tag "${t.nome}" tem ${t.usage} contato(s) vinculado(s). Forçar exclusão (remove as associações)?`)) return;
      try { await delFn({ data: { id: t.id, force: true } }); toast.success("Tag excluída"); q.refetch(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    } else {
      if (!confirm(`Excluir tag "${t.nome}"?`)) return;
      try { await delFn({ data: { id: t.id, force: false } }); toast.success("Tag excluída"); q.refetch(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    }
  }

  const grouped = (q.data?.tags ?? []).reduce<Record<string, TagRow[]>>((acc, t) => {
    (acc[t.categoria] ??= []).push(t as TagRow);
    return acc;
  }, {});

  return (
    <div className="p-6 md:p-10 max-w-5xl space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><TagsIcon className="h-5 w-5 text-primary" /> Tags</h1>
        <Button onClick={startNew}><Plus className="h-4 w-4 mr-1" /> Nova tag</Button>
      </header>

      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {CATEGORIAS.map((cat) => grouped[cat]?.length ? (
        <section key={cat} className="border rounded-xl bg-card">
          <div className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">{cat}</div>
          <ul className="divide-y">
            {grouped[cat].map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: `${t.cor}22`, color: t.cor, border: `1px solid ${t.cor}55` }}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.cor }} /> {t.nome}
                </span>
                <span className="text-xs text-muted-foreground flex-1 truncate">{t.descricao || "—"}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{t.usage} contato(s)</span>
                <button onClick={() => startEdit(t)} className="p-1.5 hover:bg-accent rounded" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(t)} className="p-1.5 hover:bg-accent rounded text-red-600" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        </section>
      ) : null)}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar tag" : "Nova tag"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cor</Label><Input type="color" value={editing.cor} onChange={(e) => setEditing({ ...editing, cor: e.target.value })} /></div>
                <div>
                  <Label>Categoria</Label>
                  <select value={editing.categoria} onChange={(e) => setEditing({ ...editing, categoria: e.target.value as Cat })} className="w-full h-9 rounded-md border bg-background px-2 text-sm">
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div><Label>Descrição</Label><Textarea rows={3} value={editing.descricao ?? ""} onChange={(e) => setEditing({ ...editing, descricao: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
