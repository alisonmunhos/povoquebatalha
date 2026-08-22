// Tela de configuração dos Fluxos de cadastro pelo chat do WhatsApp.
// Construtor em duas colunas: caminhos da conversa + prévia no WhatsApp.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bot,
  Loader2,
  MessageSquarePlus,
  Plus,
  Save,
  Send,
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
  FLOW_DEFAULT_PATH,
  FLOW_SESSION_STATUS_LABELS,
  groupStepsByPath,
  pathLabel,
  suggestedResponseKind,
  validateFlowDraft,
  type FlowSessionStatus,
  type FlowStepLike,
} from "@/lib/whatsapp-flow-shared";
import { FlowSendDialog } from "@/components/whatsapp-flows/FlowSendDialog";
import { FlowChatPreview } from "@/components/whatsapp-flows/FlowChatPreview";
import { FlowPathList } from "@/components/whatsapp-flows/FlowPathList";
import { FlowStepEditor } from "@/components/whatsapp-flows/FlowStepEditor";

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

type StepDraft = FlowStepLike;

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

function baseDraft(steps: StepDraft[]): FlowDraft {
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
    steps,
  };
}

function templateDraft(): FlowDraft {
  return baseDraft(
    DEFAULT_FLOW_STEPS.map((s) => ({
      catalog_field_key: s.catalog_field_key,
      prompt: s.prompt,
      required: s.required,
      response_kind: suggestedResponseKind(s.catalog_field_key),
      kind: s.kind ?? "question",
      path_key: s.path_key ?? FLOW_DEFAULT_PATH,
      option_routes: s.option_routes ?? {},
      options: s.options ?? [],
    })),
  );
}

function blankDraft(): FlowDraft {
  const field = FLOW_AVAILABLE_FIELDS.find((f) => f.key === "nome") ?? FLOW_AVAILABLE_FIELDS[0]!;
  return baseDraft([
    {
      catalog_field_key: field.key,
      prompt: "Pra começar, qual é o seu nome completo?",
      required: true,
      response_kind: suggestedResponseKind(field.key),
      kind: "question",
      path_key: FLOW_DEFAULT_PATH,
      option_routes: {},
      options: [],
    },
  ]);
}

function FluxosWhatsappPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(listWhatsappFlows);
  const save = useServerFn(saveWhatsappFlow);
  const remove = useServerFn(deleteWhatsappFlow);
  const toggle = useServerFn(setWhatsappFlowActive);
  const startManual = useServerFn(startWhatsappFlowManually);

  const startMutation = useMutation({
    mutationFn: (v: { flow_id: string; phone: string }) => startManual({ data: v }),
    onSuccess: (r) =>
      toast.success(
        `Fluxo enviado para ${(r as { phone?: string }).phone ?? "o número"}. Confira o WhatsApp.`,
      ),
    onError: (e: Error) =>
      toast.error(
        e.message ||
          "Não foi possível iniciar o fluxo. Lembre-se: a pessoa precisa ter mandado mensagem para o número da campanha nas últimas 24 horas.",
      ),
  });

  const askPhoneAndStart = (flowId: string) => {
    const phone = window.prompt(
      "Digite o WhatsApp (com DDD) que vai receber o fluxo agora.\n\nImportante: esse número precisa ter mandado alguma mensagem para o número da campanha nas últimas 24 horas.",
      "",
    );
    if (!phone?.trim()) return;
    startMutation.mutate({ flow_id: flowId, phone: phone.trim() });
  };

  const { data, isLoading } = useQuery({ queryKey: ["whatsapp-flows"], queryFn: () => load() });

  const [draft, setDraft] = useState<FlowDraft | null>(null);
  const [keywordText, setKeywordText] = useState("");
  const [adIdsText, setAdIdsText] = useState("");
  const [sendTarget, setSendTarget] = useState<{ id: string; nome: string } | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>(FLOW_DEFAULT_PATH);

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
        response_kind: s.response_kind as StepDraft["response_kind"],
        kind: (s.kind ?? "question") as StepDraft["kind"],
        path_key: s.path_key ?? FLOW_DEFAULT_PATH,
        option_routes: (s.option_routes ?? {}) as Record<string, string>,
        options: (s.options ?? []) as Array<{ value: string; label: string }>,
      });
      map.set(s.flow_id, list);
    }
    return map;
  }, [data]);

  const openEditor = (draftValue: FlowDraft) => {
    setDraft(draftValue);
    setKeywordText(draftValue.trigger_keywords.join(", "));
    setAdIdsText(draftValue.trigger_ad_ids.join(", "));
    setSelectedPath(FLOW_DEFAULT_PATH);
  };

  const groups = useMemo(
    () => (draft ? groupStepsByPath(draft.steps) : []),
    [draft],
  );
  const currentGroup = groups.find((g) => g.key === selectedPath) ?? groups[0];
  const validation = useMemo(
    () => (draft ? validateFlowDraft(draft.steps) : { errors: [], warnings: [] }),
    [draft],
  );

  const updateStepAt = (globalIndex: number, patch: Partial<StepDraft>) => {
    setDraft((d) =>
      d ? { ...d, steps: d.steps.map((s, i) => (i === globalIndex ? { ...s, ...patch } : s)) } : d,
    );
  };

  const removeStepAt = (globalIndex: number) => {
    setDraft((d) => (d ? { ...d, steps: d.steps.filter((_, i) => i !== globalIndex) } : d));
  };

  /** Move dentro do caminho: troca com o vizinho do mesmo caminho. */
  const moveWithinPath = (positionInPath: number, dir: -1 | 1) => {
    if (!currentGroup) return;
    const from = currentGroup.indexes[positionInPath];
    const to = currentGroup.indexes[positionInPath + dir];
    if (from == null || to == null) return;
    setDraft((d) => {
      if (!d) return d;
      const steps = [...d.steps];
      const a = steps[from]!;
      steps[from] = steps[to]!;
      steps[to] = a;
      return { ...d, steps };
    });
  };

  const addStepToPath = () => {
    setDraft((d) => {
      if (!d) return d;
      const used = new Set(
        d.steps.filter((s) => s.path_key === selectedPath).map((s) => s.catalog_field_key),
      );
      const field = FLOW_AVAILABLE_FIELDS.find((f) => !used.has(f.key)) ?? FLOW_AVAILABLE_FIELDS[0]!;
      const step: StepDraft = {
        catalog_field_key: field.key,
        prompt: field.defaultLabel,
        required: Boolean(field.alwaysRequired),
        response_kind: suggestedResponseKind(field.key),
        kind: "question",
        path_key: selectedPath,
        option_routes: {},
        options: [],
      };
      // Insere logo depois da última etapa deste caminho, para manter a leitura.
      const lastIndex = d.steps.reduce(
        (acc, s, i) => (s.path_key === selectedPath ? i : acc),
        -1,
      );
      const steps = [...d.steps];
      steps.splice(lastIndex + 1, 0, step);
      return { ...d, steps };
    });
  };

  const addMenuToPath = () => {
    setDraft((d) => {
      if (!d) return d;
      const step: StepDraft = {
        catalog_field_key: "__menu__",
        prompt: "Como podemos te ajudar hoje?",
        required: true,
        response_kind: "single_choice",
        kind: "menu",
        path_key: selectedPath,
        option_routes: {},
        options: [
          { value: "opcao_1", label: "Primeira opção" },
          { value: "opcao_2", label: "Segunda opção" },
        ],
      };
      const lastIndex = d.steps.reduce(
        (acc, s, i) => (s.path_key === selectedPath ? i : acc),
        -1,
      );
      const steps = [...d.steps];
      steps.splice(lastIndex + 1, 0, step);
      return { ...d, steps };
    });
  };

  /** Cria um caminho novo pedindo o nome; devolve a chave criada. */
  const createPath = (): string | null => {
    const name = window.prompt("Nome do novo caminho (ex.: Só informações)", "");
    const key = name?.trim();
    if (!key) return null;
    if (groups.some((g) => g.key === key)) {
      toast.error("Já existe um caminho com esse nome.");
      return null;
    }
    setDraft((d) => {
      if (!d) return d;
      const step: StepDraft = {
        catalog_field_key: "__menu__",
        prompt: "Prontinho! Vou salvar seu cadastro. 💜",
        required: false,
        response_kind: "text",
        kind: "finish",
        path_key: key,
        option_routes: { source_form_type: "cadastro_completo" },
        options: [],
      };
      return { ...d, steps: [...d.steps, step] };
    });
    return key;
  };

  const renamePath = (key: string) => {
    const name = window.prompt("Novo nome do caminho", pathLabel(key));
    const next = name?.trim();
    if (!next || next === key) return;
    setDraft((d) => {
      if (!d) return d;
      const steps = d.steps.map((s) => ({
        ...s,
        path_key: s.path_key === key ? next : s.path_key,
        option_routes: Object.fromEntries(
          Object.entries(s.option_routes ?? {}).map(([k, v]) => [k, v === key ? next : v]),
        ),
      }));
      return { ...d, steps };
    });
    setSelectedPath((cur) => (cur === key ? next : cur));
  };

  const submit = () => {
    if (!draft) return;
    const keywords = keywordText.split(",").map((k) => k.trim()).filter(Boolean);
    const adIds = adIdsText.split(",").map((k) => k.trim()).filter(Boolean);
    if (!keywords.length && !draft.trigger_on_ad && !draft.trigger_on_first_contact) {
      toast.error("Escolha ao menos um gatilho: palavra-chave, anúncio ou primeiro contato.");
      return;
    }
    const { errors } = validateFlowDraft(draft.steps);
    if (errors.length) {
      toast.error(errors[0]!);
      return;
    }
    saveMutation.mutate({
      ...draft,
      trigger_keywords: keywords,
      trigger_ad_ids: adIds,
      steps: draft.steps as never,
    });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bot className="h-6 w-6" /> Cadastro pelo chat do WhatsApp
        </h1>
        <div className="text-muted-foreground space-y-1 text-sm">
          <p>
            <strong>1. Gatilho:</strong> algo faz o robô começar a conversar (palavra-chave, clique
            em anúncio, primeira mensagem ou envio manual).
          </p>
          <p>
            <strong>2. Caminhos:</strong> a conversa segue por trilhas. Um menu de opções manda a
            pessoa para o caminho certo — é a mesma lógica das seções e ramificações do construtor de
            formulário.
          </p>
          <p>
            <strong>3. Fim:</strong> a pessoa é salva na base igual a quem preenche o link público, ou
            a conversa vai para atendimento humano.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openEditor(templateDraft())}>
          <MessageSquarePlus className="mr-2 h-4 w-4" /> Começar do modelo pronto
        </Button>
        <Button variant="outline" onClick={() => openEditor(blankDraft())}>
          <Plus className="mr-2 h-4 w-4" /> Começar do zero
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando fluxos…
        </div>
      ) : (data?.flows ?? []).length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            Nenhum fluxo criado ainda. O modelo pronto já vem com menu de entrada e três caminhos
            (apoiar a campanha, só receber informações e falar com alguém) — você ajusta o que
            quiser.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {(data?.flows ?? []).map((flow) => {
            const steps = stepsByFlow.get(flow.id) ?? [];
            const flowGroups = groupStepsByPath(steps).filter((g) => g.steps.length);
            const sessions = (data?.sessions ?? []).filter((s) => s.flow_id === flow.id);
            const running = sessions.filter((s) => s.status === "running" || s.status === "opening").length;
            const done = sessions.filter((s) => s.status === "completed").length;
            return (
              <Card key={flow.id}>
                <CardHeader className="space-y-3">
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
                      {steps.length} etapas em {flowGroups.length} caminho
                      {flowGroups.length === 1 ? "" : "s"} · {running} conversas em andamento ·{" "}
                      {done} cadastros concluídos
                    </CardDescription>
                  </div>

                  {/* Ações de envio manual: linha própria que quebra em telas estreitas. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => setSendTarget({ id: flow.id, nome: flow.nome })}
                    >
                      <Send className="mr-2 h-4 w-4" /> Enviar para quem falou nas últimas 24h
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full sm:w-auto"
                      disabled={startMutation.isPending}
                      onClick={() => askPhoneAndStart(flow.id)}
                    >
                      Testar em um número
                    </Button>
                  </div>
                  {!flow.active ? (
                    <p className="text-muted-foreground text-xs">
                      Este fluxo está desligado: ele não começa sozinho pelos gatilhos, mas o envio
                      manual acima continua funcionando.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <div className="mr-2 flex items-center gap-2">
                      <Switch
                        checked={flow.active}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: flow.id, active: v })}
                        aria-label="Ligar ou desligar o fluxo"
                      />
                      <span className="text-muted-foreground text-xs">
                        {flow.active ? "Gatilhos ligados" : "Gatilhos desligados"}
                      </span>
                    </div>
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
                      Editar roteiro
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
                  {flowGroups.length ? (
                    <div className="flex flex-wrap gap-2">
                      {flowGroups.map((g) => (
                        <Badge key={g.key} variant="secondary">
                          {pathLabel(g.key)} · {g.steps.length}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {sessions.length ? (
                    <div className="space-y-1">
                      <p className="font-medium">Últimas conversas</p>
                      <ul className="text-muted-foreground space-y-1">
                        {sessions.slice(0, 5).map((s) => (
                          <li key={s.id}>
                            {s.phone} ·{" "}
                            {FLOW_SESSION_STATUS_LABELS[s.status as FlowSessionStatus] ?? s.status} ·
                            etapa {s.current_step_index + 1}
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
        <DialogContent className="max-h-[92dvh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar fluxo" : "Novo fluxo de cadastro"}</DialogTitle>
            <DialogDescription>
              Escolha o caminho à esquerda, monte as etapas no meio e veja como fica na conversa à
              direita.
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

              <div className="grid gap-3 md:grid-cols-2">
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
                    rows={3}
                    value={draft.closing_message}
                    onChange={(e) => setDraft({ ...draft, closing_message: e.target.value })}
                  />
                </div>
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

              {validation.errors.length || validation.warnings.length ? (
                <div className="space-y-1 rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-3 text-sm">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" /> Revise o roteiro
                  </p>
                  <ul className="space-y-0.5 text-xs">
                    {validation.errors.map((e) => (
                      <li key={e}>• {e}</li>
                    ))}
                    {validation.warnings.map((w) => (
                      <li key={w} className="text-muted-foreground">
                        • {w}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)_minmax(260px,1.2fr)]">
                <FlowPathList
                  groups={groups}
                  selected={currentGroup?.key ?? FLOW_DEFAULT_PATH}
                  onSelect={setSelectedPath}
                  onRename={renamePath}
                  onCreate={() => {
                    const key = createPath();
                    if (key) setSelectedPath(key);
                  }}
                />

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      Etapas de “{pathLabel(currentGroup?.key ?? FLOW_DEFAULT_PATH)}”
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={addStepToPath}>
                        <Plus className="mr-1 h-3 w-3" /> Pergunta
                      </Button>
                      <Button variant="outline" size="sm" onClick={addMenuToPath}>
                        <Plus className="mr-1 h-3 w-3" /> Menu
                      </Button>
                    </div>
                  </div>

                  {(currentGroup?.steps ?? []).length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      Este caminho está vazio. Adicione uma pergunta ou um menu de opções.
                    </p>
                  ) : null}

                  {(currentGroup?.steps ?? []).map((step, position) => (
                    <FlowStepEditor
                      key={step.id ?? `${step.catalog_field_key}-${position}`}
                      step={step}
                      position={position}
                      total={currentGroup!.steps.length}
                      paths={groups.map((g) => g.key)}
                      onChange={(patch) => updateStepAt(currentGroup!.indexes[position]!, patch)}
                      onRemove={() => removeStepAt(currentGroup!.indexes[position]!)}
                      onMove={(dir) => moveWithinPath(position, dir)}
                      onCreatePath={createPath}
                    />
                  ))}
                </div>

                <FlowChatPreview
                  openingMessage={draft.opening_message}
                  showOpening={(currentGroup?.key ?? FLOW_DEFAULT_PATH) === FLOW_DEFAULT_PATH}
                  steps={currentGroup?.steps ?? []}
                />
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

      {sendTarget ? (
        <FlowSendDialog
          flowId={sendTarget.id}
          flowName={sendTarget.nome}
          open
          onOpenChange={(v) => {
            if (!v) setSendTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
