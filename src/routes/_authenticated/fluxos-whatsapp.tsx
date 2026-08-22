// Tela de configuração dos Fluxos de cadastro pelo chat do WhatsApp.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Loader2,
  MessageSquarePlus,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  deleteWhatsappFlow,
  listWhatsappFlows,
  saveWhatsappFlow,
  setWhatsappFlowActive,
  startWhatsappFlowManually,
} from "@/lib/whatsapp-flows.functions";
import {
  DEFAULT_FLOW_STEPS,
  FLOW_AVAILABLE_FIELDS,
  FLOW_RESPONSE_KIND_LABELS,
  FLOW_SESSION_STATUS_LABELS,
  suggestedResponseKind,
  type FlowResponseKind,
  type FlowSessionStatus,
} from "@/lib/whatsapp-flow-shared";
import { getCatalogField } from "@/lib/form-field-catalog";

export const Route = createFileRoute("/_authenticated/fluxos-whatsapp")({
  head: () => ({
    meta: [
      { title: "Fluxos de cadastro pelo WhatsApp | Povo que Batalha" },
      {
        name: "description",
        content:
          "Monte roteiros de perguntas para cadastrar pessoas direto na conversa do WhatsApp, com gatilhos por palavra-chave, anúncio ou primeiro contato.",
      },
      { property: "og:title", content: "Fluxos de cadastro pelo WhatsApp" },
      {
        property: "og:description",
        content: "Cadastro automático pelo chat do WhatsApp, com as mesmas regras dos formulários públicos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FluxosWhatsappPage,
});

type StepDraft = {
  id?: string;
  catalog_field_key: string;
  prompt: string;
  required: boolean;
  response_kind: FlowResponseKind;
};

type FlowDraft = {
  id?: string;
  nome: string;
  descricao: string | null;
  opening_message: string;
  closing_message: string;
  active: boolean;
  priority: number;
  allow_update_existing: boolean;
  trigger_keywords: string[];
  trigger_on_ad: boolean;
  trigger_ad_ids: string[];
  trigger_on_first_contact: boolean;
  steps: StepDraft[];
};

function emptyDraft(): FlowDraft {
  return {
    nome: "FAÇA PARTE DA NOSSA CAMPANHA!",
    descricao: null,
    opening_message:
      "FAÇA PARTE DA NOSSA CAMPANHA! 💪\n\nVou te fazer algumas perguntas rapidinho pra completar seu cadastro. Leva menos de 2 minutos.",
    closing_message: "Prontinho! Seu cadastro foi feito. Obrigado por fazer parte. 💜",
    active: false,
    priority: 10,
    allow_update_existing: true,
    trigger_keywords: ["quero participar", "cadastro"],
    trigger_on_ad: true,
    trigger_ad_ids: [],
    trigger_on_first_contact: false,
    steps: DEFAULT_FLOW_STEPS.map((s) => ({
      catalog_field_key: s.catalog_field_key,
      prompt: s.prompt,
      required: s.required,
      response_kind: suggestedResponseKind(s.catalog_field_key),
    })),
  };
}

function FluxosWhatsappPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(listWhatsappFlows);
  const save = useServerFn(saveWhatsappFlow);
  const remove = useServerFn(deleteWhatsappFlow);
  const toggle = useServerFn(setWhatsappFlowActive);

  const { data, isLoading } = useQuery({ queryKey: ["whatsapp-flows"], queryFn: () => load() });

  const [draft, setDraft] = useState<FlowDraft | null>(null);
  const [keywordText, setKeywordText] = useState("");
  const [adIdsText, setAdIdsText] = useState("");

  const saveMutation = useMutation({
    mutationFn: (payload: FlowDraft) => save({ data: payload }),
    onSuccess: () => {
      toast.success("Fluxo salvo.");
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-flows"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível salvar o fluxo."),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Fluxo apagado.");
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-flows"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível apagar."),
  });

  const toggleMutation = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggle({ data: v }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["whatsapp-flows"] }),
    onError: (e: Error) => toast.error(e.message || "Não foi possível mudar o fluxo."),
  });

  const stepsByFlow = useMemo(() => {
    const map = new Map<string, StepDraft[]>();
    for (const s of data?.steps ?? []) {
      const list = map.get(s.flow_id) ?? [];
      list.push({
        id: s.id,
        catalog_field_key: s.catalog_field_key,
        prompt: s.prompt,
        required: s.required,
        response_kind: s.response_kind as FlowResponseKind,
      });
      map.set(s.flow_id, list);
    }
    return map;
  }, [data]);

  const openEditor = (draftValue: FlowDraft) => {
    setDraft(draftValue);
    setKeywordText(draftValue.trigger_keywords.join(", "));
    setAdIdsText(draftValue.trigger_ad_ids.join(", "));
  };

  const updateStep = (index: number, patch: Partial<StepDraft>) => {
    setDraft((d) =>
      d ? { ...d, steps: d.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : d,
    );
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    setDraft((d) => {
      if (!d) return d;
      const target = index + dir;
      if (target < 0 || target >= d.steps.length) return d;
      const steps = [...d.steps];
      const [item] = steps.splice(index, 1);
      steps.splice(target, 0, item!);
      return { ...d, steps };
    });
  };

  const addStep = () => {
    setDraft((d) => {
      if (!d) return d;
      const used = new Set(d.steps.map((s) => s.catalog_field_key));
      const field = FLOW_AVAILABLE_FIELDS.find((f) => !used.has(f.key)) ?? FLOW_AVAILABLE_FIELDS[0]!;
      return {
        ...d,
        steps: [
          ...d.steps,
          {
            catalog_field_key: field.key,
            prompt: field.defaultLabel,
            required: Boolean(field.alwaysRequired),
            response_kind: suggestedResponseKind(field.key),
          },
        ],
      };
    });
  };

  const submit = () => {
    if (!draft) return;
    if (!draft.steps.length) {
      toast.error("Adicione pelo menos uma pergunta ao roteiro.");
      return;
    }
    const keywords = keywordText.split(",").map((k) => k.trim()).filter(Boolean);
    const adIds = adIdsText.split(",").map((k) => k.trim()).filter(Boolean);
    if (!keywords.length && !draft.trigger_on_ad && !draft.trigger_on_first_contact) {
      toast.error("Escolha ao menos um gatilho: palavra-chave, anúncio ou primeiro contato.");
      return;
    }
    saveMutation.mutate({
      ...draft,
      trigger_keywords: keywords,
      trigger_ad_ids: adIds,
      steps: draft.steps.map((s) => ({ ...s, options: [] })) as never,
    });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bot className="h-6 w-6" /> Cadastro pelo chat do WhatsApp
        </h1>
        <p className="text-muted-foreground text-sm">
          O robô conduz as perguntas na conversa e salva a pessoa na base com as mesmas regras dos
          formulários públicos. Só entra em ação quando o gatilho que você escolher acontecer.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openEditor(emptyDraft())}>
          <MessageSquarePlus className="mr-2 h-4 w-4" /> Novo fluxo (roteiro pronto)
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando fluxos…
        </div>
      ) : (data?.flows ?? []).length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            Nenhum fluxo criado ainda. Clique em “Novo fluxo” — ele já vem com o roteiro completo
            (nome, nome social, WhatsApp, endereço por CEP, formas de ajuda, Coletivo Alicerce e os
            consentimentos) e você ajusta o que quiser.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {(data?.flows ?? []).map((flow) => {
            const steps = stepsByFlow.get(flow.id) ?? [];
            const sessions = (data?.sessions ?? []).filter((s) => s.flow_id === flow.id);
            const running = sessions.filter((s) => s.status === "running" || s.status === "opening").length;
            const done = sessions.filter((s) => s.status === "completed").length;
            return (
              <Card key={flow.id}>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {flow.nome}
                      {flow.active ? (
                        <Badge variant="default">Ligado</Badge>
                      ) : (
                        <Badge variant="secondary">Desligado</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {steps.length} perguntas · {running} conversas em andamento · {done} cadastros
                      concluídos
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={flow.active}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: flow.id, active: v })}
                      aria-label="Ligar ou desligar o fluxo"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        openEditor({
                          id: flow.id,
                          nome: flow.nome,
                          descricao: flow.descricao,
                          opening_message: flow.opening_message,
                          closing_message: flow.closing_message,
                          active: flow.active,
                          priority: flow.priority,
                          allow_update_existing: flow.allow_update_existing,
                          trigger_keywords: flow.trigger_keywords ?? [],
                          trigger_on_ad: flow.trigger_on_ad,
                          trigger_ad_ids: flow.trigger_ad_ids ?? [],
                          trigger_on_first_contact: flow.trigger_on_first_contact,
                          steps,
                        })
                      }
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Apagar o fluxo “${flow.nome}”? As conversas em andamento também serão apagadas. Os contatos já cadastrados continuam na base.`,
                          )
                        ) {
                          removeMutation.mutate(flow.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    {(flow.trigger_keywords ?? []).map((k) => (
                      <Badge key={k} variant="outline">
                        palavra: {k}
                      </Badge>
                    ))}
                    {flow.trigger_on_ad ? <Badge variant="outline">veio de anúncio</Badge> : null}
                    {flow.trigger_on_first_contact ? (
                      <Badge variant="outline">primeira mensagem</Badge>
                    ) : null}
                  </div>
                  {sessions.length ? (
                    <div className="space-y-1">
                      <p className="font-medium">Últimas conversas</p>
                      <ul className="text-muted-foreground space-y-1">
                        {sessions.slice(0, 5).map((s) => (
                          <li key={s.id}>
                            {s.phone} ·{" "}
                            {FLOW_SESSION_STATUS_LABELS[s.status as FlowSessionStatus] ?? s.status} ·
                            pergunta {s.current_step_index + 1}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={draft != null} onOpenChange={(open) => (open ? null : setDraft(null))}>
        <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar fluxo" : "Novo fluxo de cadastro"}</DialogTitle>
            <DialogDescription>
              As respostas caem direto na ficha do contato. Perguntas obrigatórias travam o cadastro
              até serem respondidas — use com cuidado.
            </DialogDescription>
          </DialogHeader>

          {draft ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="flow-nome">Nome do fluxo</Label>
                  <Input
                    id="flow-nome"
                    value={draft.nome}
                    onChange={(e) => setDraft({ ...draft, nome: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="flow-prioridade">Prioridade</Label>
                  <Input
                    id="flow-prioridade"
                    type="number"
                    min={0}
                    max={100}
                    value={draft.priority}
                    onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })}
                  />
                  <p className="text-muted-foreground text-xs">
                    Se dois fluxos combinarem, vence o de número maior.
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="flow-abertura">Mensagem de abertura</Label>
                <Textarea
                  id="flow-abertura"
                  rows={3}
                  value={draft.opening_message}
                  onChange={(e) => setDraft({ ...draft, opening_message: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="flow-fim">Mensagem final</Label>
                <Textarea
                  id="flow-fim"
                  rows={2}
                  value={draft.closing_message}
                  onChange={(e) => setDraft({ ...draft, closing_message: e.target.value })}
                />
              </div>

              <div className="space-y-3 rounded-lg border-2 p-3">
                <p className="font-semibold">Quando o robô começa a conversar</p>
                <div className="space-y-1">
                  <Label htmlFor="flow-palavras">Palavras-chave (separadas por vírgula)</Label>
                  <Input
                    id="flow-palavras"
                    value={keywordText}
                    onChange={(e) => setKeywordText(e.target.value)}
                    placeholder="quero participar, cadastro"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Quem chega por anúncio</p>
                    <p className="text-muted-foreground text-xs">
                      Vale para cliques em anúncios que abrem o WhatsApp.
                    </p>
                  </div>
                  <Switch
                    checked={draft.trigger_on_ad}
                    onCheckedChange={(v) => setDraft({ ...draft, trigger_on_ad: v })}
                  />
                </div>
                {draft.trigger_on_ad ? (
                  <div className="space-y-1">
                    <Label htmlFor="flow-anuncios">
                      Só para estes anúncios (opcional, IDs separados por vírgula)
                    </Label>
                    <Input
                      id="flow-anuncios"
                      value={adIdsText}
                      onChange={(e) => setAdIdsText(e.target.value)}
                      placeholder="deixe vazio para valer para qualquer anúncio"
                    />
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Primeira mensagem de um número novo</p>
                    <p className="text-muted-foreground text-xs">
                      Cuidado: liga o robô para qualquer pessoa que falar com a campanha pela
                      primeira vez.
                    </p>
                  </div>
                  <Switch
                    checked={draft.trigger_on_first_contact}
                    onCheckedChange={(v) => setDraft({ ...draft, trigger_on_first_contact: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Conversar com quem já é cadastrado</p>
                    <p className="text-muted-foreground text-xs">
                      Desligado, o robô ignora quem já concluiu o cadastro.
                    </p>
                  </div>
                  <Switch
                    checked={draft.allow_update_existing}
                    onCheckedChange={(v) => setDraft({ ...draft, allow_update_existing: v })}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Roteiro de perguntas ({draft.steps.length})</p>
                  <Button variant="outline" size="sm" onClick={addStep}>
                    <Plus className="mr-2 h-4 w-4" /> Adicionar pergunta
                  </Button>
                </div>

                {draft.steps.map((step, index) => {
                  const field = getCatalogField(step.catalog_field_key);
                  return (
                    <div key={`${step.catalog_field_key}-${index}`} className="space-y-2 rounded-lg border-2 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold">
                          {index + 1}. {field?.defaultLabel ?? step.catalog_field_key}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => moveStep(index, -1)} aria-label="Subir">
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => moveStep(index, 1)} aria-label="Descer">
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remover pergunta"
                            onClick={() =>
                              setDraft({ ...draft, steps: draft.steps.filter((_, i) => i !== index) })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Campo da ficha</Label>
                          <Select
                            value={step.catalog_field_key}
                            onValueChange={(v) =>
                              updateStep(index, {
                                catalog_field_key: v,
                                response_kind: suggestedResponseKind(v),
                                prompt: getCatalogField(v)?.defaultLabel ?? step.prompt,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FLOW_AVAILABLE_FIELDS.map((f) => (
                                <SelectItem key={f.key} value={f.key}>
                                  {f.defaultLabel}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Tipo de resposta</Label>
                          <Select
                            value={step.response_kind}
                            onValueChange={(v) => updateStep(index, { response_kind: v as FlowResponseKind })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(FLOW_RESPONSE_KIND_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label>Pergunta que a pessoa vai ler</Label>
                        <Textarea
                          rows={2}
                          value={step.prompt}
                          onChange={(e) => updateStep(index, { prompt: e.target.value })}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm">Obrigatória</span>
                        <Switch
                          checked={step.required}
                          onCheckedChange={(v) => updateStep(index, { required: v })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar fluxo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
