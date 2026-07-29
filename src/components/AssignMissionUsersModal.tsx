import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { assignMissionUsersFromDetail, listAgitadorUsers } from "@/lib/agitation-missions.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missionId: string;
  taskIds: string[];
  onAssigned: () => void;
};

export function AssignMissionUsersModal({
  open,
  onOpenChange,
  missionId,
  taskIds,
  onAssigned,
}: Props) {
  const usersFn = useServerFn(listAgitadorUsers);
  const assignFn = useServerFn(assignMissionUsersFromDetail);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const usersQ = useQuery({
    queryKey: ["agitator-users"],
    queryFn: () => usersFn(),
    enabled: open,
    staleTime: 60_000,
  });

  function reset() {
    setUserIds([]);
  }

  async function onConfirm() {
    if (!userIds.length) return toast.error("Selecione ao menos um agitador.");
    setSaving(true);
    try {
      const r = await assignFn({
        data: { mission_id: missionId, task_ids: taskIds, user_ids: userIds },
      });
      toast.success(`${r.assigned} contato(s) atribuído(s). Notificações enviadas.`);
      onAssigned();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atribuir.");
    } finally {
      setSaving(false);
    }
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
          <DialogTitle>Atribuir a agitador com conta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {taskIds.length} contato(s) selecionado(s). Se escolher mais de um agitador, os contatos
            serão divididos em lotes sem sobreposição. Cada um recebe notificação no sino.
          </p>
          <div>
            <Label className="text-xs font-medium">Agitadores</Label>
            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border divide-y">
              {(usersQ.data?.users ?? []).map((u) => {
                const checked = userIds.includes(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setUserIds((prev) =>
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
              {!usersQ.data?.users?.length && (
                <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum agitador encontrado.</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={saving || !userIds.length}>
            {saving ? "Atribuindo…" : "Confirmar atribuição"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
