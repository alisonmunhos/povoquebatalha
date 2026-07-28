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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  MessageComposer,
  emptyComposerValue,
  COMPOSER_VARIABLES,
} from "@/components/MessageComposer";
import {
  createAgitationMission,
  listAgitadorUsers,
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
  const usersFn = useServerFn(listAgitadorUsers);

  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState(emptyComposerValue());
  const [verifyWhatsapp, setVerifyWhatsapp] = useState(false);
  const [mode, setMode] = useState<"open" | "direct">("open");
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);
  const [batchSize, setBatchSize] = useState(10);
  const [cooldownMinutes, setCooldownMinutes] = useState(60);
  const [instructions, setInstructions] = useState("");
  const [coordinatorPhone, setCoordinatorPhone] = useState("");
  const [completionMessage, setCompletionMessage] = useState(
    "Terminei minha leva da missão. Bora pra próxima!",
  );
  const [saving, setSaving] = useState(false);

  const usersQ = useQuery({
    queryKey: ["agitator-users"],
    queryFn: () => usersFn(),
    enabled: open,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  async function onSubmit() {
    if (title.trim().length < 2) return toast.error("Informe um título para a missão.");
    if (!composer.body.trim()) return toast.error("Escreva a mensagem da missão.");
    if (mode === "direct" && assigneeUserIds.length === 0)
      return toast.error("Escolha ao menos uma pessoa responsável.");
    setSaving(true);
    try {
      const r = await createFn({
        data: {
          title: title.trim(),
          message_template: composer.body,
          verify_whatsapp: verifyWhatsapp,
          mode,
          assignee_user_ids: mode === "direct" ? assigneeUserIds : undefined,
          batch_size: batchSize,
          cooldown_minutes: cooldownMinutes,
          instructions: instructions.trim() || undefined,
          coordinator_phone: coordinatorPhone.trim() || undefined,
          whatsapp_message_template: completionMessage.trim() || undefined,
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

          <div className="rounded-lg border p-3 space-y-3">
            <Label className="text-xs font-semibold">Modo de atribuição</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "open" | "direct")}>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="open" className="mt-0.5" />
                <div>
                  <div className="font-medium">Atribuir para agitação (aberta)</div>
                  <div className="text-xs text-muted-foreground">
                    Qualquer agitador pode pegar um lote de contatos por vez.
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="direct" className="mt-0.5" />
                <div>
                  <div className="font-medium">Atribuir para pessoa(s) específica(s)</div>
                  <div className="text-xs text-muted-foreground">
                    Escolha um ou mais responsáveis; cada um recebe sua própria leva.
                  </div>
                </div>
              </label>
            </RadioGroup>
            {mode === "direct" && (
              <div>
                <Label className="text-xs font-medium">Responsáveis</Label>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border divide-y">
                  {(usersQ.data?.users ?? []).map((u) => {
                    const checked = assigneeUserIds.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setAssigneeUserIds((prev) =>
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
            )}
          </div>

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
              <p className="text-[10px] text-muted-foreground mt-1">
                Quantidade que o agitador recebe por vez.
              </p>
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
              <p className="text-[10px] text-muted-foreground mt-1">
                Tempo até poder pegar outra leva.
              </p>
            </div>
          </div>

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

          <div className="rounded-lg border p-3 space-y-3">
            <Label className="text-xs font-semibold">Ao concluir a leva</Label>
            <div>
              <Label className="text-xs font-medium">
                Número do coordenador (WhatsApp de aviso)
              </Label>
              <Input
                value={coordinatorPhone}
                onChange={(e) => setCoordinatorPhone(e.target.value)}
                placeholder="+5551..."
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                O agitador vai clicar em &quot;Avisar que concluí&quot; e cair no WhatsApp desse
                número.
              </p>
            </div>
            <div>
              <Label className="text-xs font-medium">Mensagem que ele(a) vai enviar</Label>
              <Textarea
                value={completionMessage}
                onChange={(e) => setCompletionMessage(e.target.value)}
                rows={2}
                className="mt-1"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={verifyWhatsapp}
              onCheckedChange={(v) => setVerifyWhatsapp(!!v)}
            />
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
