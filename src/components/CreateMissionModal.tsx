import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import {
  MessageComposer,
  emptyComposerValue,
  COMPOSER_VARIABLES,
} from "@/components/MessageComposer";
import {
  MissionImageUpload,
  emptyMissionMedia,
  type MissionMedia,
} from "@/components/MissionImageUpload";
import {
  createAgitationMission,
  listMissionTemplatesForReuse,
} from "@/lib/agitation-missions.functions";
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
  const templatesFn = useServerFn(listMissionTemplatesForReuse);

  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState(emptyComposerValue());
  const [instructions, setInstructions] = useState("");
  const [media, setMedia] = useState<MissionMedia>(emptyMissionMedia);
  const [verifyWhatsapp, setVerifyWhatsapp] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [saving, setSaving] = useState(false);

  const templatesQ = useQuery({
    queryKey: ["mission-templates-reuse"],
    queryFn: () => templatesFn(),
    enabled: open,
    staleTime: 60_000,
  });

  function applyTemplate(id: string) {
    setTemplateId(id);
    if (!id) return;
    const m = templatesQ.data?.missions.find((t) => t.id === id);
    if (!m) return;
    setComposer({ ...emptyComposerValue(), body: m.message_template });
    setInstructions(m.instructions ?? "");
  }

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
          instructions: instructions.trim() || undefined,
          media_path: media.media_path,
          media_mime: media.media_mime,
          media_filename: media.media_filename,
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Missão de Agitação</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">Público: {labelSelecao}</p>

          <div>
            <Label className="text-xs font-medium">Começar a partir de missão existente (opcional)</Label>
            <select
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Mensagem em branco</option>
              {(templatesQ.data?.missions ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} ({new Date(m.created_at).toLocaleDateString("pt-BR")})
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Copia o texto como ponto de partida — você pode editar livremente antes de criar.
            </p>
          </div>

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

          <div>
            <Label className="text-xs font-medium">Instruções da missão</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder="Explique o contexto, tom e objetivo. Ex.: 'Convide para o encontro de sábado às 15h'"
              className="mt-1"
            />
          </div>

          <MissionImageUpload value={media} onChange={setMedia} />

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={verifyWhatsapp}
              onCheckedChange={(v) => setVerifyWhatsapp(!!v)}
            />
            Verificar WhatsApp antes de criar (mais lento — só entram contatos com WhatsApp
            confirmado)
          </label>

          <p className="text-xs text-muted-foreground rounded-md border bg-muted/30 p-3">
            A missão será criada com o público selecionado. Você decide como distribuir os contatos
            na tela de detalhe — por link, por agitador com conta ou por auto-atribuição.
          </p>
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
