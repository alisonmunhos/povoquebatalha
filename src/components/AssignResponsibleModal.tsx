import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  MultiSelectFilter,
  SingleSelectFilter,
  type MultiOption,
} from "@/components/MultiSelectFilter";
import {
  listAgitadorCandidates,
  assignMissionTaskResponsible,
} from "@/lib/agitation-missions.functions";
import { getCatalogField } from "@/lib/form-field-catalog";

const FORMAS_AJUDA_OPTIONS: MultiOption[] = (getCatalogField("formas_ajuda")?.options ?? []).map(
  (o) => ({
    value: o.value,
    label: o.label,
  }),
);

const SIM_NAO = [
  { value: "sim", label: "Sim" },
  { value: "nao", label: "Não" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missionId: string;
  taskIds: string[];
  onAssigned: () => void;
};

export function AssignResponsibleModal({
  open,
  onOpenChange,
  missionId,
  taskIds,
  onAssigned,
}: Props) {
  const candidatesFn = useServerFn(listAgitadorCandidates);
  const assignFn = useServerFn(assignMissionTaskResponsible);
  const [coletivoAlicerce, setColetivoAlicerce] = useState<boolean | undefined>(undefined);
  const [formasAjuda, setFormasAjuda] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const candidatesQ = useQuery({
    queryKey: ["agitador-candidates", coletivoAlicerce, formasAjuda],
    queryFn: () =>
      candidatesFn({ data: { coletivo_alicerce: coletivoAlicerce, formas_ajuda: formasAjuda } }),
    enabled: open,
  });

  function reset() {
    setColetivoAlicerce(undefined);
    setFormasAjuda([]);
    setSelectedUserId("");
    setLink(null);
  }

  async function onConfirm() {
    if (!selectedUserId) return toast.error("Selecione um responsável.");
    setSaving(true);
    try {
      const r = await assignFn({
        data: { mission_id: missionId, task_ids: taskIds, assigned_user_id: selectedUserId },
      });
      setLink(r.link);
      onAssigned();
      toast.success(`${r.updated} contato(s) atribuído(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atribuir responsável.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(`${window.location.origin}${link}`);
    toast.success("Link copiado.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atribuir Responsável</DialogTitle>
        </DialogHeader>

        {link ? (
          <div className="space-y-3">
            <p className="text-sm">
              Atribuição feita. Envie este link pelo WhatsApp para o responsável executar os envios:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-xs break-all">
                {`${typeof window !== "undefined" ? window.location.origin : ""}${link}`}
              </code>
              <Button size="sm" variant="outline" onClick={copyLink}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copiar Link
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {taskIds.length} contato(s) selecionado(s) para atribuir.
            </p>
            <div>
              <Label className="text-xs font-medium">Faz parte do Coletivo Alicerce</Label>
              <SingleSelectFilter
                options={SIM_NAO}
                value={
                  coletivoAlicerce === undefined ? undefined : coletivoAlicerce ? "sim" : "nao"
                }
                onChange={(v) => setColetivoAlicerce(v === undefined ? undefined : v === "sim")}
                placeholder="Qualquer"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Formas de ajuda</Label>
              <MultiSelectFilter
                options={FORMAS_AJUDA_OPTIONS}
                value={formasAjuda}
                onChange={setFormasAjuda}
                placeholder="Todas"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Responsável (selecione 1)</Label>
              <div className="mt-1 max-h-64 overflow-y-auto rounded-md border divide-y">
                {candidatesQ.isLoading && (
                  <p className="p-3 text-xs text-muted-foreground">Carregando…</p>
                )}
                {!candidatesQ.isLoading && (candidatesQ.data?.candidates.length ?? 0) === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">
                    Nenhum candidato encontrado com esses filtros.
                  </p>
                )}
                {(
                  (candidatesQ.data?.candidates as
                    | Array<{ user_id: string; nome: string | null }>
                    | undefined) ?? []
                ).map((c) => (
                  <label
                    key={c.user_id}
                    className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-muted/40"
                  >
                    <input
                      type="radio"
                      name="agitador"
                      checked={selectedUserId === c.user_id}
                      onChange={() => setSelectedUserId(c.user_id)}
                    />
                    {selectedUserId === c.user_id && <Check className="h-3.5 w-3.5 text-primary" />}
                    <span>{c.nome ?? "(sem nome)"}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {link ? (
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={onConfirm} disabled={saving || !selectedUserId}>
                {saving ? "Atribuindo…" : "Confirmar atribuição"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
