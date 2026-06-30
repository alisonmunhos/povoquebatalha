import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Copy, GitMerge } from "lucide-react";
import { listPendingDuplicates, resolveDuplicate, getDuplicatePair, mergeContacts } from "@/lib/duplicates.functions";
import { formatPhoneBR } from "@/lib/phone";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/duplicidades")({
  head: () => ({ meta: [{ title: "Possíveis Duplicidades" }] }),
  component: DupPage,
});

const FIELDS: Array<{ key: string; label: string }> = [
  { key: "nome", label: "Nome" },
  { key: "nome_social", label: "Nome social" },
  { key: "email", label: "E-mail" },
  { key: "phone_raw", label: "Telefone" },
  { key: "cep", label: "CEP" },
  { key: "endereco", label: "Endereço" },
  { key: "numero", label: "Número" },
  { key: "complemento", label: "Complemento" },
  { key: "bairro", label: "Bairro" },
  { key: "cidade", label: "Cidade" },
  { key: "uf", label: "UF" },
  { key: "profissao", label: "Profissão" },
  { key: "tipo_contato", label: "Tipo contato" },
  { key: "origem_detalhe", label: "Origem detalhe" },
  { key: "observacoes", label: "Observações" },
];

function DupPage() {
  const listFn = useServerFn(listPendingDuplicates);
  const resolveFn = useServerFn(resolveDuplicate);
  const pairFn = useServerFn(getDuplicatePair);
  const mergeFn = useServerFn(mergeContacts);
  const q = useQuery({ queryKey: ["dups"], queryFn: () => listFn() });
  const [merging, setMerging] = useState<{ duplicate_id: string } | null>(null);
  const pair = useQuery({
    queryKey: ["dup-pair", merging?.duplicate_id],
    queryFn: () => merging ? pairFn({ data: { id: merging.duplicate_id } }) : null,
    enabled: !!merging,
  });
  const [survivor, setSurvivor] = useState<"a" | "b">("a");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [confirmText, setConfirmText] = useState("");
  const [motivo, setMotivo] = useState("");

  async function act(id: string, action: "ignorar" | "separados") {
    await resolveFn({ data: { id, action } });
    q.refetch();
  }

  function openMerge(id: string) {
    setMerging({ duplicate_id: id }); setSurvivor("a"); setOverrides({}); setConfirmText(""); setMotivo("");
  }

  const survivorContact = pair.data ? (survivor === "a" ? pair.data.a : pair.data.b) : null;
  const otherContact = pair.data ? (survivor === "a" ? pair.data.b : pair.data.a) : null;
  const confianca = useMemo<"forte" | "provavel" | "possivel">(() => {
    const mt = pair.data?.dup?.match_type;
    if (mt === "forte") return "forte"; if (mt === "possivel") return "possivel"; return "provavel";
  }, [pair.data]);

  async function doMerge() {
    if (!pair.data || !survivorContact || !otherContact) return;
    if (confirmText.trim() !== "MESCLAR CONTATOS") return toast.error('Digite "MESCLAR CONTATOS" para confirmar');
    try {
      await mergeFn({ data: {
        duplicate_id: merging?.duplicate_id,
        survivor_id: survivorContact.id,
        merged_id: otherContact.id,
        field_overrides: overrides,
        motivo: motivo || undefined,
        confianca,
      } });
      toast.success("Contatos mesclados");
      setMerging(null); q.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao mesclar"); }
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Copy className="h-5 w-5 text-primary" /> Possíveis Duplicidades</h1>
        <p className="text-sm text-muted-foreground mt-1">Revise os pares marcados pela importação ou pelo recadastro. Mesclar é uma operação de admin que preserva tags, observações e histórico.</p>
      </header>

      <div className="border rounded-xl bg-card overflow-hidden">
        {q.isLoading && <div className="p-6 text-sm text-muted-foreground">Carregando…</div>}
        {(q.data?.rows.length ?? 0) === 0 && !q.isLoading && <div className="p-6 text-sm text-muted-foreground">Nenhuma duplicidade pendente. 🎉</div>}
        <ul className="divide-y">
          {q.data?.rows.map((d) => (
            <li key={d.id} className="p-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-center">
              <CardC label="Contato A" c={d.a} />
              <CardC label="Contato B" c={d.b} />
              <div className="flex flex-col gap-2 text-xs">
                <span className="text-center px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wide">{d.match_type}</span>
                <Button size="sm" onClick={() => openMerge(d.id)}><GitMerge className="h-3.5 w-3.5 mr-1" /> Mesclar</Button>
                <Button size="sm" variant="outline" onClick={() => act(d.id, "separados")}>Manter separados</Button>
                <Button size="sm" variant="ghost" onClick={() => act(d.id, "ignorar")}>Ignorar</Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={!!merging} onOpenChange={(o) => !o && setMerging(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Mesclar contatos</DialogTitle></DialogHeader>
          {pair.isLoading && <div className="text-sm">Carregando…</div>}
          {pair.data && survivorContact && otherContact && (
            <div className="space-y-4">
              <div className="text-sm bg-muted/40 border rounded-md p-3">
                <div><strong>Motivo do match:</strong> {pair.data.dup.reason ?? "—"} ({pair.data.dup.match_type})</div>
                <div><strong>Confiança:</strong> {confianca}</div>
              </div>
              <div>
                <Label>Qual contato sobrevive?</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button onClick={() => setSurvivor("a")} className={`text-left border rounded-md p-3 text-sm ${survivor === "a" ? "border-primary bg-primary/5" : ""}`}>
                    <div className="font-medium">{pair.data.a?.nome}</div>
                    <div className="text-xs text-muted-foreground">{formatPhoneBR(pair.data.a?.phone_e164)}</div>
                  </button>
                  <button onClick={() => setSurvivor("b")} className={`text-left border rounded-md p-3 text-sm ${survivor === "b" ? "border-primary bg-primary/5" : ""}`}>
                    <div className="font-medium">{pair.data.b?.nome}</div>
                    <div className="text-xs text-muted-foreground">{formatPhoneBR(pair.data.b?.phone_e164)}</div>
                  </button>
                </div>
              </div>

              <div className="border rounded-md">
                <div className="grid grid-cols-[120px_1fr_1fr] text-xs font-medium bg-muted/40 px-3 py-2 border-b">
                  <div>Campo</div><div>Sobrevivente</div><div>Outro / escolher</div>
                </div>
                {FIELDS.map((f) => {
                  const sv = (survivorContact as Record<string, unknown>)[f.key] as string | null | undefined;
                  const ov = (otherContact as Record<string, unknown>)[f.key] as string | null | undefined;
                  const isConflict = (sv ?? "") !== (ov ?? "") && (sv || ov);
                  const choice = overrides[f.key];
                  return (
                    <div key={f.key} className="grid grid-cols-[120px_1fr_1fr] text-xs px-3 py-2 border-b last:border-b-0 items-center">
                      <div className="text-muted-foreground">{f.label}</div>
                      <div className={`truncate ${isConflict ? "" : "text-muted-foreground"}`}>{sv ?? "—"}</div>
                      <div className="flex items-center gap-2 truncate">
                        <span className="truncate">{ov ?? "—"}</span>
                        {isConflict && (
                          <button
                            onClick={() => setOverrides((o) => choice ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== f.key)) : { ...o, [f.key]: String(ov ?? "") })}
                            className={`text-[10px] px-2 py-0.5 rounded ${choice ? "bg-primary text-primary-foreground" : "border"}`}
                          >
                            {choice ? "↑ Usar este" : "Usar este"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 text-amber-900 rounded-md p-3">
                ✓ Tags dos dois contatos serão preservadas<br />
                ✓ Observações serão combinadas<br />
                ✓ Histórico, mensagens e auditoria do contato perdedor serão transferidos<br />
                ✓ Contato perdedor será arquivado e marcado como "duplicado_mesclado"
              </div>

              <div><Label>Motivo (opcional)</Label><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: mesmo telefone e mesma cidade" /></div>
              <div>
                <Label>Digite <code className="bg-muted px-1">MESCLAR CONTATOS</code> para confirmar</Label>
                <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMerging(null)}>Cancelar</Button>
            <Button onClick={doMerge} disabled={confirmText.trim() !== "MESCLAR CONTATOS"}><GitMerge className="h-4 w-4 mr-1" /> Mesclar agora</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CardC({ label, c }: { label: string; c: { id: string; nome: string; phone_e164: string | null; email: string | null; origem: string } | null }) {
  if (!c) return <div className="text-xs text-muted-foreground">{label}: contato removido</div>;
  return (
    <div className="rounded-md border p-3 bg-background">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{c.nome}</div>
      <div className="text-xs text-muted-foreground tabular-nums">{formatPhoneBR(c.phone_e164)}</div>
      {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
      <div className="text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded bg-muted">{c.origem}</div>
    </div>
  );
}
