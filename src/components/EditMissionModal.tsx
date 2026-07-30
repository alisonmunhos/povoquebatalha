import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  MessageComposer,
  emptyComposerValue,
  COMPOSER_VARIABLES,
  type ComposerValue,
} from "@/components/MessageComposer";
import {
  MissionImageUpload,
  emptyMissionMedia,
  type MissionMedia,
} from "@/components/MissionImageUpload";
import { updateAgitationMission } from "@/lib/agitation-missions.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missionId: string;
  initialTitle: string;
  initialMessage: string;
  initialInstructions?: string | null;
  initialMedia?: MissionMedia;
  initialBatchSize?: number;
  initialCooldown?: number;
  onUpdated: () => void;
};

export function EditMissionModal({
  open,
  onOpenChange,
  missionId,
  initialTitle,
  initialMessage,
  initialInstructions,
  initialMedia,
  initialBatchSize = 10,
  initialCooldown = 60,
  onUpdated,
}: Props) {
  const updateFn = useServerFn(updateAgitationMission);
  const [title, setTitle] = useState(initialTitle);
  const [composer, setComposer] = useState<ComposerValue>({
    ...emptyComposerValue(),
    body: initialMessage,
  });
  const [media, setMedia] = useState<MissionMedia>(initialMedia ?? emptyMissionMedia);
  const [batchSize, setBatchSize] = useState(initialBatchSize);
  const [cooldownMinutes, setCooldownMinutes] = useState(initialCooldown);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setComposer({ ...emptyComposerValue(), body: initialMessage });
      setMedia(initialMedia ?? emptyMissionMedia);
      setBatchSize(initialBatchSize);
      setCooldownMinutes(initialCooldown);
    }
  }, [open, initialTitle, initialMessage, initialMedia, initialBatchSize, initialCooldown]);

  async function onSubmit() {
    if (title.trim().length < 2) return toast.error("Informe um título para a missão.");
    if (!composer.body.trim()) return toast.error("Escreva a mensagem da missão.");
    setSaving(true);
    try {
      await updateFn({
        data: {
          mission_id: missionId,
          title: title.trim(),
          message_template: composer.body,
          media_path: media.media_path,
          media_mime: media.media_mime,
          media_filename: media.media_filename,
          batch_size: batchSize,
          cooldown_minutes: cooldownMinutes,
        },
      });
      toast.success("Missão atualizada. O texto novo já vale pra todos os links ativos.");
      onOpenChange(false);
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao editar missão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Missão</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium">Título da missão</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
          <MessageComposer
            value={composer}
            onChange={setComposer}
            showLink={false}
            showAttachment={false}
            variables={COMPOSER_VARIABLES}
            bodyPlaceholder="Escreva a mensagem que os responsáveis vão enviar. Use as variáveis abaixo para personalizar."
          />

          <MissionImageUpload value={media} onChange={setMedia} />

          <div className="rounded-lg border p-3 space-y-3">
            <div>
              <Label className="text-xs font-semibold">Ritmo da missão</Label>
              <p className="text-[11px] text-muted-foreground">
                Usado quando a missão está aberta para auto-atribuição.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Contatos por leva</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={batchSize}
                  onChange={(e) => setBatchSize(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Cooldown entre levas (minutos)</Label>
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  value={cooldownMinutes}
                  onChange={(e) =>
                    setCooldownMinutes(Math.min(1440, Math.max(0, Number(e.target.value) || 0)))
                  }
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Salvando…" : "Salvar missão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
