import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, GitMerge, ShieldAlert, Star } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMergeCandidates, mergeContactsBulk } from "@/lib/duplicates.functions";
import { formatPhoneBR } from "@/lib/phone";
import {
  CONFIANCA_LABEL,
  suggestSurvivor,
  survivorReason,
  type MergeCandidate,
} from "@/lib/merge-suggestion";

const TEXT_FIELDS: Array<{ key: string; label: string }> = [
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
  { key: "tipo_contato", label: "Tipo de contato" },
  { key: "origem_detalhe", label: "Origem" },
  { key: "observacoes", label: "Observações" },
];

const BOOL_FIELDS: Array<{ key: string; label: string }> = [
  { key: "consentimento_whatsapp", label: "Aceita WhatsApp" },
  { key: "consentimento_lgpd", label: "Consentimento LGPD" },
  { key: "consentimento_dados_sensiveis", label: "Dados sensíveis" },
];

function val(c: MergeCandidate | null, key: string): string {
  if (!c) return "—";
  const v = c[key];
  if (v === true) return "Sim";
  if (v === false) return "Não";
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

export function MergeContactsModal({
  ids,
  matchType,
  onClose,
  onMerged,
}: {
  ids: string[];
  /** Confiança do agrupamento, quando vem da tela de Duplicidades. */
  matchType?: string | null;
  onClose: () => void;
  onMerged: () => void;
}) {
  const fetchFn = useServerFn(getMergeCandidates);
  const mergeFn = useServerFn(mergeContactsBulk);
  const open = ids.length >= 2;

  const q = useQuery({
    queryKey: ["merge-candidates", ids.join(",")],
    queryFn: () => fetchFn({ data: { ids } }),
    enabled: open,
  });

  const rows = useMemo(() => (q.data?.rows ?? []) as unknown as MergeCandidate[], [q.data]);
  const [survivorId, setSurvivorId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suggested = useMemo(() => suggestSurvivor(rows), [rows]);
  useEffect(() => {
    if (suggested && !survivorId) setSurvivorId(suggested.id);
  }, [suggested, survivorId]);
  useEffect(() => {
    setOverrides({});
  }, [survivorId]);

  const survivor = rows.find((r) => r.id === survivorId) ?? null;
  const others = rows.filter((r) => r.id !== survivorId);
  const canMerge = !!survivor && others.length > 0;

  /** Campos com valor diferente nos dois lados — só esses exigem decisão. */
  const conflitos = useMemo(() => {
    if (!survivor) return [];
    return [...TEXT_FIELDS, ...BOOL_FIELDS]
      .map((f) => {
        const sv = val(survivor, f.key);
        const alt = [...new Set(others.map((o) => val(o, f.key)).filter((v) => v !== "—" && v !== sv))];
        return { ...f, sv, alt };
      })
      .filter((f) => f.sv !== "—" && f.alt.length > 0);
  }, [survivor, others]);

  /** Campos vazios no sobrevivente que serão preenchidos sozinhos. */
  const herdados = useMemo(() => {
    if (!survivor) return [];
    return [...TEXT_FIELDS, ...BOOL_FIELDS]
      .filter((f) => {
        const sv = val(survivor, f.key);
        return sv === "—" && others.some((o) => val(o, f.key) !== "—");
      })
      .map((f) => f.label);
  }, [survivor, others]);

  async function doMerge() {
    if (!survivor) return;
    setSaving(true);
    setErro(null);
    try {
      const res = await mergeFn({
        data: {
          survivor_id: survivor.id,
          merged_ids: others.map((o) => o.id),
          field_overrides: overrides,
          motivo: motivo || undefined,
          confianca: (matchType as "forte" | "provavel" | "possivel") ?? "provavel",
        },
      });
      if (res.ok) {
        toast.success(`${res.merged.length} contato(s) unificado(s) com sucesso.`);
        onMerged();
        onClose();
        return;
      }
      // Falha parcial ou total: mantém a tela aberta e mostra o motivo real.
      setErro(res.falhas.map((f) => f.erro).join(" · "));
      if (res.merged.length > 0) onMerged();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível unificar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" /> Unificar contatos
          </DialogTitle>
        </DialogHeader>

        {q.isLoading && <div className="text-sm text-muted-foreground">Carregando contatos…</div>}

        {!q.isLoading && rows.length >= 2 && (
          <div className="space-y-5">
            {matchType && (
              <div className="text-sm rounded-md border bg-muted/40 px-3 py-2">
                Confiança da sugestão: <strong>{CONFIANCA_LABEL[matchType] ?? matchType}</strong>
              </div>
            )}

            <div>
              <Label className="text-base font-semibold">1. Qual cadastro deve permanecer?</Label>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                O escolhido guarda o histórico de todos. Os demais saem da base, mas nada é apagado: mensagens, tags,
                missões e observações passam para o cadastro que fica.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {rows.map((c) => {
                  const isSel = c.id === survivorId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSurvivorId(c.id)}
                      className={`text-left rounded-lg border-2 p-4 transition ${
                        isSel ? "border-primary bg-primary/5" : "border-muted hover:border-input"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {isSel ? (
                          <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                        ) : (
                          <span className="h-4 w-4 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{c.nome ?? "Sem nome"}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {formatPhoneBR(c.phone_e164 ?? null) || c.phone_raw || "sem telefone"}
                          </div>
                          {c.email && <div className="text-xs text-muted-foreground truncate">{c.email}</div>}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {suggested?.id === c.id && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-primary/15 text-primary font-medium">
                                <Star className="h-3 w-3" /> Sugerido — {survivorReason(c)}
                              </span>
                            )}
                            {c.is_system_user && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                                Usuário do sistema
                              </span>
                            )}
                            {c.arquivado_at && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                Fora da base
                              </span>
                            )}
                            {c.origem && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                                {c.origem}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {rows.some((r) => r.is_system_user) && survivor && !survivor.is_system_user && (
                <div className="mt-3 text-xs flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-3">
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                  Um dos cadastros é usuário do sistema. O acesso será transferido para o cadastro escolhido — a pessoa
                  continua entrando normalmente.
                </div>
              )}
            </div>

            {survivor && (
              <div>
                <Label className="text-base font-semibold">2. Confira as informações</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Aqui aparecem apenas as informações que estão diferentes entre os cadastros. Escolha qual valor manter.
                </p>

                {conflitos.length === 0 ? (
                  <div className="border rounded-lg px-3 py-4 text-xs text-muted-foreground bg-muted/30">
                    Nenhuma divergência entre os cadastros — não há nada para decidir.
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[130px_1fr_1fr] text-xs font-semibold bg-muted/50 px-3 py-2 border-b">
                      <div>Campo</div>
                      <div className="truncate">Fica: {survivor.nome}</div>
                      <div className="truncate">Outros cadastros</div>
                    </div>
                    <div className="divide-y max-h-80 overflow-y-auto">
                      {conflitos.map((f) => {
                        const chosen = overrides[f.key];
                        return (
                          <div key={f.key} className="grid grid-cols-[130px_1fr_1fr] text-xs px-3 py-2 items-center">
                            <div className="text-muted-foreground font-medium">{f.label}</div>
                            <div className={`truncate ${chosen ? "line-through opacity-50" : ""}`}>{f.sv}</div>
                            <div className="flex flex-wrap items-center gap-1">
                              {f.alt.map((v) => {
                                const norm = v === "Sim" ? "true" : v === "Não" ? "false" : v;
                                const active = chosen === norm;
                                return (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() =>
                                      setOverrides((o) =>
                                        active
                                          ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== f.key))
                                          : { ...o, [f.key]: norm },
                                      )
                                    }
                                    className={`px-2 py-1 rounded text-[11px] max-w-full truncate transition ${
                                      active
                                        ? "bg-primary text-primary-foreground"
                                        : "border border-input bg-background hover:bg-muted"
                                    }`}
                                    title={v}
                                  >
                                    {active ? "✓ " : ""}
                                    {v}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {herdados.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Preenchidos automaticamente no cadastro que fica: {herdados.join(", ")}.
                  </p>
                )}
              </div>
            )}

            <div>
              <Label>Motivo (opcional)</Label>
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: mesma pessoa, cadastro repetido na importação"
                className="mt-1"
              />
            </div>

            {erro && (
              <div className="text-xs rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2">
                <strong>Não foi possível unificar.</strong> {erro}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={doMerge} disabled={!canMerge || saving}>
            <GitMerge className="h-4 w-4 mr-2" />
            {saving ? "Unificando…" : `Unificar ${others.length + (survivor ? 1 : 0)} cadastros`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
