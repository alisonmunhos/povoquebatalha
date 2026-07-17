import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
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
import {
  MessageComposer,
  emptyComposerValue,
  COMPOSER_VARIABLES,
} from "@/components/MessageComposer";
import { createAgitationMission } from "@/lib/agitation-missions.functions";
import type { CrmFilters } from "@/lib/crm-filters";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: { ids: string[] } | { filters: CrmFilters };
  labelSelecao: string;
};

export function CreateMissionModal({ open, onOpenChange, source, labelSelecao }: Props) {
  const navigate = useNavigate();
  const createFn = useServerFn(createAgitationMission);
  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState(emptyComposerValue());
  const [verifyWhatsapp, setVerifyWhatsapp] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit() {
    if (title.trim().length < 2) return toast.error("Informe um título para a missão.");
    if (!composer.body.trim()) return toast.error("Escreva a mensagem da missão.");
    setSaving(true);
    try {
      const r = await createFn({
        data: {
          title: title.trim(),
          message_template: composer.body,
          verify_whatsapp: verifyWhatsapp,
          ...("ids" in source ? { ids: source.ids } : { filters: source.filters }),
        },
      });
      const partes = [`Missão criada com ${r.total} contato(s).`];
      if (r.ignorados_sem_telefone)
        partes.push(`${r.ignorados_sem_telefone} ignorado(s) sem telefone.`);
      if (r.ignorados_sem_whatsapp)
        partes.push(`${r.ignorados_sem_whatsapp} ignorado(s) sem WhatsApp.`);
      toast.success(partes.join(" "));
      onOpenChange(false);
      navigate({ to: "/missoes-agitacao/$missionId", params: { missionId: r.mission_id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar missão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Missão de Agitação</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">Público: {labelSelecao}</p>
          <div>
            <Label className="text-xs font-medium">Título da missão</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Divulgação do evento de sábado"
              className="mt-1"
            />
          </div>
          <MessageComposer
            value={composer}
            onChange={setComposer}
            showLink={false}
            showAttachment={false}
            variables={COMPOSER_VARIABLES}
            bodyPlaceholder="Escreva a mensagem que os responsáveis vão enviar. Use as variáveis abaixo para personalizar."
          />
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={verifyWhatsapp} onCheckedChange={(v) => setVerifyWhatsapp(!!v)} />
            Verificar WhatsApp antes de criar (mais lento — só entram contatos com WhatsApp
            confirmado)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Criando…" : "Criar missão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
