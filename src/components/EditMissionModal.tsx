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
  initialMedia?: MissionMedia;
  onUpdated: () => void;
};

export function EditMissionModal({
  open,
  onOpenChange,
  missionId,
  initialTitle,
  initialMessage,
  initialMedia,
  onUpdated,
}: Props) {
  const updateFn = useServerFn(updateAgitationMission);
  const [title, setTitle] = useState(initialTitle);
  const [composer, setComposer] = useState<ComposerValue>({
    ...emptyComposerValue(),
    body: initialMessage,
  });
  const [media, setMedia] = useState<MissionMedia>(initialMedia ?? emptyMissionMedia);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setComposer({ ...emptyComposerValue(), body: initialMessage });
      setMedia(initialMedia ?? emptyMissionMedia);
    }
  }, [open, initialTitle, initialMessage, initialMedia]);

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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Salvando…" : "Salvar mensagem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
