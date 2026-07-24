import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Copy, GitMerge, Check, X as XIcon } from "lucide-react";
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

const BOOL_FIELDS: Array<{ key: string; label: string }> = [
  { key: "consentimento_whatsapp", label: "Consentimento WhatsApp" },
  { key: "consentimento_lgpd", label: "Consentimento LGPD" },
  { key: "consentimento_dados_sensiveis", label: "Dados Sensíveis" },
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

  async function act(id: string, action: "nao_duplicado" | "postergar") {
    try {
      await resolveFn({ data: { id, action } });
      const msg = action === "nao_duplicado" 
        ? "Marcado como não-duplicado. Contatos mantidos separados." 
        : "Duplicidade adiada para revisão posterior.";
      toast.success(msg);
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao processar");
    }
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
      toast.success("Contatos mesclados com sucesso");
      setMerging(null); q.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao mesclar"); }
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Copy className="h-5 w-5 text-primary" /> Possíveis Duplicidades</h1>
        <p className="text-sm text-muted-foreground mt-1">Revise os pares marcados pela importação ou pelo recadastro. Mesclar é uma operação de admin que preserva tags, observações e histórico de ambos os contatos.</p>
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
                <span className="text-center px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wide font-medium">{d.match_type}</span>
                <Button size="sm" onClick={() => openMerge(d.id)}><GitMerge className="h-3.5 w-3.5 mr-1" /> Mesclar</Button>
                <Button size="sm" variant="outline" onClick={() => act(d.id, "nao_duplicado")}>Não são duplicados</Button>
                <Button size="sm" variant="ghost" onClick={() => act(d.id, "postergar")}>Postergar</Button>
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
                <Label className="text-base font-semibold">Qual contato vai sobreviver?</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  O contato sobrevivente mantém seu ID e dados. O outro será arquivado mas todo histórico, mensagens, tags e observações serão preservados.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setSurvivor("a")} 
                    className={`text-left border-2 rounded-lg p-4 text-sm transition ${
                      survivor === "a" 
                        ? "border-emerald-500 bg-emerald-50" 
                        : "border-muted bg-background hover:border-input"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {survivor === "a" && <Check className="h-4 w-4 text-emerald-600" />}
                      <div>
                        <div className="font-semibold">{pair.data.a?.nome}</div>
                        <div className="text-xs text-muted-foreground">{formatPhoneBR(pair.data.a?.phone_e164)}</div>
                        {survivor === "a" && <div className="text-xs text-emerald-700 font-medium mt-2">✓ Sobrevivente</div>}
                      </div>
                    </div>
                  </button>
                  <button 
                    onClick={() => setSurvivor("b")} 
                    className={`text-left border-2 rounded-lg p-4 text-sm transition ${
                      survivor === "b" 
                        ? "border-emerald-500 bg-emerald-50" 
                        : "border-muted bg-background hover:border-input"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {survivor === "b" && <Check className="h-4 w-4 text-emerald-600" />}
                      <div>
                        <div className="font-semibold">{pair.data.b?.nome}</div>
                        <div className="text-xs text-muted-foreground">{formatPhoneBR(pair.data.b?.phone_e164)}</div>
                        {survivor === "b" && <div className="text-xs text-emerald-700 font-medium mt-2">✓ Sobrevivente</div>}
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-[120px_1fr_1fr] text-xs font-semibold bg-gradient-to-r from-emerald-50 to-transparent px-4 py-3 border-b">
                  <div>Campo</div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    Sobrevivente: {survivor === "a" ? pair.data.a?.nome : pair.data.b?.nome}
                  </div>
                  <div className="flex items-center gap-2">
                    <XIcon className="h-4 w-4 text-red-600" />
                    Será arquivado: {survivor === "a" ? pair.data.b?.nome : pair.data.a?.nome}
                  </div>
                </div>
                <div className="divide-y max-h-96 overflow-y-auto">
                  {FIELDS.map((f) => {
                    const sv = (survivorContact as Record<string, unknown>)[f.key] as string | null | undefined;
                    const ov = (otherContact as Record<string, unknown>)[f.key] as string | null | undefined;
                    const isConflict = (sv ?? "") !== (ov ?? "") && (sv || ov);
                    const choice = overrides[f.key];
                    return (
                      <div key={f.key} className="grid grid-cols-[120px_1fr_1fr] text-xs px-4 py-3 items-center hover:bg-muted/40 transition">
                        <div className="text-muted-foreground font-medium">{f.label}</div>
                        <div className={`truncate ${isConflict ? "font-medium" : "text-muted-foreground"}`}>
                          {sv ?? "—"}
                        </div>
                        <div className="flex items-center gap-2 truncate">
                          <span className="truncate">{ov ?? "—"}</span>
                          {isConflict && (
                            <button
                              onClick={() => setOverrides((o) => choice ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== f.key)) : { ...o, [f.key]: String(ov ?? "") })}
                              className={`text-[10px] px-2 py-1 rounded font-medium transition whitespace-nowrap ${
                                choice 
                                  ? "bg-primary text-primary-foreground" 
                                  : "border border-input bg-background hover:bg-muted"
                              }`}
                            >
                              {choice ? "↑ Usar este" : "Usar este"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {BOOL_FIELDS.map((f) => {
                    const sv = (survivorContact as Record<string, unknown>)[f.key] as boolean | null | undefined;
                    const ov = (otherContact as Record<string, unknown>)[f.key] as boolean | null | undefined;
                    const svLabel = sv === true ? "Sim" : sv === false ? "Não" : "—";
                    const ovLabel = ov === true ? "Sim" : ov === false ? "Não" : "—";
                    const isConflict = sv !== ov;
                    const choice = overrides[f.key];
                    return (
                      <div key={f.key} className="grid grid-cols-[120px_1fr_1fr] text-xs px-4 py-3 items-center hover:bg-muted/40 transition">
                        <div className="text-muted-foreground font-medium">{f.label}</div>
                        <div className={`truncate ${isConflict ? "font-medium" : "text-muted-foreground"}`}>{svLabel}</div>
                        <div className="flex items-center gap-2 truncate">
                          <span className="truncate">{ovLabel}</span>
                          {isConflict && ov !== undefined && ov !== null && (
                            <button
                              onClick={() => setOverrides((o) => choice ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== f.key)) : { ...o, [f.key]: String(ov) })}
                              className={`text-[10px] px-2 py-1 rounded font-medium transition whitespace-nowrap ${
                                choice ? "bg-primary text-primary-foreground" : "border border-input bg-background hover:bg-muted"
                              }`}
                            >
                              {choice ? "↑ Usar este" : "Usar este"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg p-4 space-y-1.5">
                <div className="font-semibold flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  O que será preservado:
                </div>
                <ul className="text-xs space-y-1 ml-6">
                  <li>✓ Tags dos dois contatos serão unificadas</li>
                  <li>✓ Observações serão combinadas</li>
                  <li>✓ Histórico, mensagens e auditoria do contato perdedor serão transferidos</li>
                  <li>✓ Contato perdedor será arquivado e vinculado como "duplicado_mesclado"</li>
                </ul>
              </div>

              <div><Label>Motivo (opcional)</Label><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: mesmo telefone e mesma cidade" /></div>
              <div>
                <Label>Digite <code className="bg-muted px-1.5 py-0.5 rounded text-sm">MESCLAR CONTATOS</code> para confirmar</Label>
                <Input 
                  value={confirmText} 
                  onChange={(e) => setConfirmText(e.target.value)} 
                  placeholder="MESCLAR CONTATOS"
                  className="mt-2"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMerging(null)}>Cancelar</Button>
            <Button onClick={doMerge} disabled={confirmText.trim() !== "MESCLAR CONTATOS"}><GitMerge className="h-4 w-4 mr-2" /> Mesclar agora</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CardC({ label, c }: { label: string; c: { id: string; nome: string; phone_e164: string | null; email: string | null; origem: string } | null }) {
  if (!c) return <div className="text-xs text-muted-foreground">{label}: contato removido</div>;
  return (
    <div className="rounded-lg border p-4 bg-background hover:border-primary/50 transition">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
      <div className="font-semibold text-sm mt-1">{c.nome}</div>
      <div className="text-xs text-muted-foreground tabular-nums mt-1">{formatPhoneBR(c.phone_e164)}</div>
      {c.email && <div className="text-xs text-muted-foreground mt-1">{c.email}</div>}
      <div className="text-[10px] mt-2 inline-block px-2 py-1 rounded bg-amber-100 text-amber-800">{c.origem}</div>
    </div>
  );
}
