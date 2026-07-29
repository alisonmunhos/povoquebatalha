import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idsByFilter, listContactsRich } from "@/lib/crm-bulk.functions";
import { fixContactsPhoneDdd } from "@/lib/contacts-phone.functions";
import { ALL_DDDS, suggestDddFor } from "@/lib/phone-labels";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
};

export function PhoneReviewDialog({ open, onOpenChange, onDone }: Props) {
  const listFn = useServerFn(listContactsRich);
  const idsFn = useServerFn(idsByFilter);
  const fixFn = useServerFn(fixContactsPhoneDdd);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ddd, setDdd] = useState<string>("");
  const [applying, setApplying] = useState(false);

  const filters = useMemo(
    () => ({
      archived: "nao" as const,
      phone_statuses: ["precisa_revisao", "sem_ddd", "sem_nono_digito"],
    }),
    [],
  );

  const q = useQuery({
    queryKey: ["phone-review", open],
    queryFn: () => listFn({ data: { filters, page: 1, pageSize: 100, sort: "name" } }),
    enabled: open,
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  function togglePage() {
    if (rows.every((r) => selected.has(r.id))) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  async function selectAllFiltered() {
    const r = await idsFn({ data: { filters, max: 5000 } });
    setSelected(new Set(r.ids));
    if (r.truncated) {
      toast.warning(
        `Selecionamos ${r.ids.length} de ${r.total} contatos do filtro. ` +
        `As ações em massa vão afetar apenas esses ${r.ids.length}. ` +
        `Refine o filtro para tratar o restante.`,
        { duration: 10000 },
      );
    } else {
      toast.success(`${r.ids.length} contato(s) selecionados`);
    }
  }

  async function apply() {
    if (!ddd || !/^\d{2}$/.test(ddd)) return toast.error("Escolha um DDD de 2 dígitos");
    if (!selected.size) return toast.error("Selecione ao menos 1 contato");
    if (!confirm(`Aplicar DDD ${ddd} em ${selected.size} contato(s)?\n\nO campo telefone será reconstruído. A ação fica registrada no histórico do contato para permitir revisão.`)) return;
    try {
      setApplying(true);
      const r = await fixFn({ data: { contact_ids: [...selected], ddd } });
      toast.success(`${r.updated} atualizado(s) · ${r.stillInvalid} continuam inválidos · ${r.skipped} ignorados`);
      setSelected(new Set());
      await q.refetch();
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao aplicar DDD");
    } finally {
      setApplying(false);
    }
  }

  // DDD sugerido a partir do 1º contato selecionado (se houver)
  const sugestao = useMemo(() => {
    if (!selected.size) return null;
    const first = rows.find((r) => selected.has(r.id));
    if (!first) return null;
    return suggestDddFor(first.cidade ?? null, first.uf ?? null);
  }, [selected, rows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Revisão de números — Falta DDD</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {total} contato(s) com telefone só de 8-9 dígitos (sem código de área). Selecione, escolha o DDD e aplique.
            A ação é registrada no histórico de cada contato.
          </p>

          <div className="flex flex-wrap items-end gap-3 border rounded-lg p-3 bg-muted/40">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs">DDD a aplicar</Label>
              <div className="flex gap-2">
                <select
                  value={ddd}
                  onChange={(e) => setDdd(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">— escolher —</option>
                  {ALL_DDDS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <Input
                  value={ddd}
                  onChange={(e) => setDdd(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="ou digite"
                  className="w-24"
                />
                {sugestao && sugestao !== ddd && (
                  <Button size="sm" variant="outline" onClick={() => setDdd(sugestao)}>
                    Usar sugestão {sugestao}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={selectAllFiltered}>Selecionar todos ({total})</Button>
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
            </div>
            <div>
              <Button size="sm" onClick={apply} disabled={applying || !ddd || !selected.size}>
                {applying ? "Aplicando…" : `Aplicar em ${selected.size}`}
              </Button>
            </div>
          </div>

          <div className="border rounded-lg max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0">
                <tr>
                  <th className="px-2 py-2 w-8">
                    <Checkbox
                      checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                      onCheckedChange={togglePage}
                    />
                  </th>
                  <th className="text-left px-2 py-2">Nome</th>
                  <th className="text-left px-2 py-2">Telefone</th>
                  <th className="text-left px-2 py-2">Cidade / UF</th>
                  <th className="text-left px-2 py-2">DDD sugerido</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading && (
                  <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Carregando…</td></tr>
                )}
                {!q.isLoading && rows.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Nenhum contato para revisar.</td></tr>
                )}
                {rows.map((c) => {
                  const s = suggestDddFor(c.cidade ?? null, c.uf ?? null);
                  return (
                    <tr key={c.id} className="border-t">
                      <td className="px-2 py-2"><Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} /></td>
                      <td className="px-2 py-2 font-medium">{c.nome}</td>
                      <td className="px-2 py-2 tabular-nums text-muted-foreground">{c.phone_e164 || "—"}</td>
                      <td className="px-2 py-2 text-muted-foreground">{[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}</td>
                      <td className="px-2 py-2">{s ? <span className="text-emerald-700 font-medium">{s}</span> : <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
