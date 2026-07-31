import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { openMissionForSelfAssign, listAgitadorUsers } from "@/lib/agitation-missions.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missionId: string;
  availableCount: number;
  defaultBatchSize?: number;
  defaultCooldown?: number;
  onOpened: () => void;
};

export function OpenMissionModal({
  open,
  onOpenChange,
  missionId,
  availableCount,
  defaultBatchSize = 10,
  defaultCooldown = 60,
  onOpened,
}: Props) {
  const openFn = useServerFn(openMissionForSelfAssign);
  const usersFn = useServerFn(listAgitadorUsers);
  const [batchSize, setBatchSize] = useState(defaultBatchSize);
  const [cooldownMinutes, setCooldownMinutes] = useState(defaultCooldown);
  // Padrão da coordenação — editável em cada missão.
  const [coordinatorPhone, setCoordinatorPhone] = useState("+5551995131811");
  const [completionMessage, setCompletionMessage] = useState(
    "Terminei minha leva da missão. Bora pra próxima!",
  );
  const [restrictEligible, setRestrictEligible] = useState(false);
  const [eligibleUserIds, setEligibleUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const usersQ = useQuery({
    queryKey: ["agitator-users"],
    queryFn: () => usersFn(),
    enabled: open,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    setBatchSize(defaultBatchSize);
    setCooldownMinutes(defaultCooldown);
  }, [open, defaultBatchSize, defaultCooldown]);

  useEffect(() => {
    if (!open || !usersQ.data?.users?.length) return;
    if (!restrictEligible && eligibleUserIds.length === 0) {
      setEligibleUserIds(usersQ.data.users.map((u) => u.id));
    }
  }, [open, usersQ.data, restrictEligible, eligibleUserIds.length]);

  async function onConfirm() {
    if (availableCount <= 0) return toast.error("Não há contatos disponíveis para abrir.");
    if (restrictEligible && eligibleUserIds.length === 0) {
      return toast.error("Selecione ao menos um agitador elegível.");
    }
    setSaving(true);
    try {
      const r = await openFn({
        data: {
          mission_id: missionId,
          batch_size: batchSize,
          cooldown_minutes: cooldownMinutes,
          coordinator_phone: coordinatorPhone.trim() || undefined,
          whatsapp_message_template: completionMessage.trim() || undefined,
          eligible_user_ids: restrictEligible ? eligibleUserIds : undefined,
        },
      });
      toast.success(`Missão aberta. ${r.notified} agitador(es) notificado(s).`);
      onOpened();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao abrir missão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Abrir para auto-atribuição</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {availableCount} contato(s) disponíveis no pool. Agitadores elegíveis receberão convite no
            sino e poderão pegar lotes em &quot;Minhas missões&quot;.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium">Contatos por leva</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Cooldown (minutos)</Label>
              <Input
                type="number"
                min={0}
                max={1440}
                value={cooldownMinutes}
                onChange={(e) => setCooldownMinutes(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={restrictEligible}
              onCheckedChange={(v) => {
                const on = !!v;
                setRestrictEligible(on);
                if (!on && usersQ.data?.users) {
                  setEligibleUserIds(usersQ.data.users.map((u) => u.id));
                }
              }}
            />
            Restringir lista de elegíveis (padrão: todos agitadores/admin/operador)
          </label>

          {restrictEligible && (
            <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
              {(usersQ.data?.users ?? []).map((u) => {
                const checked = eligibleUserIds.includes(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setEligibleUserIds((prev) =>
                          v ? [...prev, u.id] : prev.filter((id) => id !== u.id),
                        );
                      }}
                    />
                    <span>
                      {u.name} {u.email ? `· ${u.email}` : ""}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="rounded-lg border p-3 space-y-3">
            <Label className="text-xs font-semibold">Ao concluir a leva</Label>
            <div>
              <Label className="text-xs font-medium">Número do coordenador (WhatsApp)</Label>
              <Input
                value={coordinatorPhone}
                onChange={(e) => setCoordinatorPhone(e.target.value)}
                placeholder="+5551..."
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Mensagem que o agitador envia ao concluir</Label>
              <Textarea
                value={completionMessage}
                onChange={(e) => setCompletionMessage(e.target.value)}
                rows={2}
                className="mt-1"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={saving || availableCount <= 0}>
            {saving ? "Abrindo…" : "Abrir e notificar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
