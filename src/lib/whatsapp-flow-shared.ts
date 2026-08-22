// Tipos e regras compartilhadas dos Fluxos de cadastro pelo chat do WhatsApp.
// Arquivo client-safe: pode ser importado por telas e pelo motor no servidor.
import { FORM_FIELD_CATALOG, getCatalogField, type FormCatalogOption } from "@/lib/form-field-catalog";

export type FlowResponseKind =
  | "text"
  | "single_choice"
  | "multi_choice"
  | "yes_no"
  | "address"
  | "email"
  | "date"
  | "number";

export const FLOW_RESPONSE_KIND_LABELS: Record<FlowResponseKind, string> = {
  text: "Resposta escrita",
  single_choice: "Escolher uma opção",
  multi_choice: "Escolher várias opções",
  yes_no: "Sim ou não",
  address: "Endereço (guiado por CEP)",
  email: "E-mail",
  date: "Data",
  number: "Número",
};

/** Tipo de etapa do roteiro. */
export type FlowStepKind = "question" | "menu" | "handoff" | "finish";

export const FLOW_STEP_KIND_LABELS: Record<FlowStepKind, string> = {
  question: "Pergunta",
  menu: "Menu de opções (ramificação)",
  handoff: "Passar para atendimento humano",
  finish: "Encerrar e salvar o cadastro",
};

/** Caminho principal (fluxos antigos ficam todos aqui). */
export const FLOW_DEFAULT_PATH = "default";

/** Chave usada no `catalog_field_key` de etapas que não gravam campo na ficha. */
export const FLOW_NO_FIELD_KEY = "__menu__";

export type FlowStep = {
  id: string;
  flow_id: string;
  order_index: number;
  catalog_field_key: string;
  prompt: string;
  required: boolean;
  response_kind: FlowResponseKind;
  /** Opções clicáveis. Vazio = usa as opções padrão do campo do catálogo. */
  options: FormCatalogOption[];
  kind: FlowStepKind;
  /** Caminho a que a etapa pertence. */
  path_key: string;
  /**
   * Em etapas de menu: valor da opção -> caminho de destino.
   * Em etapas de encerramento: `{ source_form_type: "receber_informacoes" }`.
   */
  option_routes: Record<string, string>;
};

export type FlowTriggerKind = "keyword" | "ad" | "first_contact" | "manual";


export type Flow = {
  id: string;
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
};

export type FlowSessionStatus =
  | "opening"
  | "running"
  | "completed"
  | "abandoned"
  | "paused"
  | "declined";

export const FLOW_SESSION_STATUS_LABELS: Record<FlowSessionStatus, string> = {
  opening: "Iniciando",
  running: "Em andamento",
  completed: "Concluído",
  abandoned: "Abandonado (24h)",
  paused: "Pausado",
  declined: "Recusado",
};

/** Palavras que encerram o fluxo por decisão da pessoa. */
export const FLOW_CANCEL_WORDS = ["sair", "parar", "cancelar", "stop", "descadastrar"];
/** Palavras que pulam uma pergunta opcional. */
export const FLOW_SKIP_WORDS = ["pular", "pula", "nao quero", "não quero", "prefiro nao", "prefiro não"];
/** Id/rótulo do botão que encerra uma pergunta de múltipla escolha. */
export const FLOW_MULTI_DONE_ID = "__flow_done__";
export const FLOW_MULTI_DONE_LABEL = "Pronto, terminei";

/** Tipo de resposta sugerido para um campo do catálogo. */
export function suggestedResponseKind(catalogKey: string): FlowResponseKind {
  const field = getCatalogField(catalogKey);
  if (!field) return "text";
  if (catalogKey === "email") return "email";
  if (field.responseType === "address_block") return "address";
  if (field.responseType === "yes_no") return "yes_no";
  if (field.responseType === "number") return "number";
  if (field.responseType === "date") return "date";
  if (field.responseType === "multiple_choice") {
    // Faixa etária e afins são escolha única (filterKind "enum").
    return field.filterKind === "multiselect" ? "multi_choice" : "single_choice";
  }
  return "text";
}

/** Opções efetivas de um passo: as do passo, senão as do catálogo. */
export function stepOptions(step: Pick<FlowStep, "catalog_field_key" | "options">): FormCatalogOption[] {
  if (step.options?.length) return step.options;
  return getCatalogField(step.catalog_field_key)?.options ?? [];
}

/** Campos do catálogo que fazem sentido perguntar por chat (sem o bloco de "outro"). */
export const FLOW_AVAILABLE_FIELDS = FORM_FIELD_CATALOG.filter(
  (f) => f.key !== "formas_ajuda_outro",
);

/** Caminhos nomeados do roteiro padrão. */
export const FLOW_PATH_LABELS: Record<string, string> = {
  [FLOW_DEFAULT_PATH]: "Início (menu)",
  cadastro: "Quero apoiar (cadastro completo)",
  info: "Quero receber informações",
  humano: "Quero falar com alguém",
};

export type FlowStepTemplate = {
  catalog_field_key: string;
  prompt: string;
  required: boolean;
  kind?: FlowStepKind;
  path_key?: string;
  option_routes?: Record<string, string>;
  options?: FormCatalogOption[];
};

/**
 * Encurta o título de um item de lista (limite de 24 caracteres da Meta) sem
 * perder o texto: o completo vai na descrição do item.
 */
export function shortRowTitle(label: string): string {
  const clean = label.trim();
  if (clean.length <= 24) return clean;
  const cut = clean.slice(0, 24);
  const space = cut.lastIndexOf(" ");
  return (space > 12 ? cut.slice(0, space) : cut.slice(0, 23)).trim() + "…";
}

/** Monta um item de lista sem cortar frases longas (título curto + descrição). */
export function listRowFor(
  id: string,
  label: string,
): { id: string; title: string; description?: string } {
  const clean = label.trim();
  if (clean.length <= 24) return { id, title: clean };
  return { id, title: shortRowTitle(clean), description: clean.slice(0, 72) };
}

/** Roteiro padrão do fluxo "FAÇA PARTE DA NOSSA CAMPANHA!". */
export const DEFAULT_FLOW_STEPS: FlowStepTemplate[] = [
  // ---- menu de entrada
  {
    catalog_field_key: FLOW_NO_FIELD_KEY,
    kind: "menu",
    path_key: FLOW_DEFAULT_PATH,
    prompt: "Como podemos te ajudar hoje?",
    required: true,
    options: [
      { value: "apoiar", label: "Quero apoiar a campanha" },
      { value: "informacoes", label: "Quero receber informações" },
      { value: "falar", label: "Quero falar com alguém" },
    ],
    option_routes: { apoiar: "cadastro", informacoes: "info", falar: "humano" },
  },

  // ---- caminho: cadastro completo
  {
    catalog_field_key: "nome",
    path_key: "cadastro",
    prompt: "Pra começar, qual é o seu nome completo?",
    required: true,
  },
  {
    catalog_field_key: "nome_social",
    path_key: "cadastro",
    prompt: 'Você usa nome social ou apelido? Se sim, escreva aqui. Se não, responda "pular".',
    required: false,
  },
  {
    catalog_field_key: "whatsapp",
    path_key: "cadastro",
    prompt:
      "Esse WhatsApp que você está usando é o melhor número pra gente te chamar? Se sim, escreva SIM. Se não, escreva o número com DDD.",
    required: true,
  },
  {
    catalog_field_key: "endereco_completo",
    path_key: "cadastro",
    prompt: "Agora o endereço. Qual é o seu CEP? (só os números)",
    required: false,
  },
  {
    catalog_field_key: "formas_ajuda",
    path_key: "cadastro",
    prompt: "Como você pode ajudar a campanha? Pode marcar mais de uma.",
    required: false,
  },
  {
    catalog_field_key: "coletivo_alicerce",
    path_key: "cadastro",
    prompt: "Você faz parte do Coletivo Alicerce?",
    required: false,
  },
  {
    catalog_field_key: "consentimento",
    path_key: "cadastro",
    prompt: "Você aceita receber mensagens da campanha por aqui, no WhatsApp?",
    required: true,
  },
  {
    catalog_field_key: "consentimento_lgpd",
    path_key: "cadastro",
    prompt:
      "Por último: você autoriza o uso dos seus dados pela campanha, conforme a Lei Geral de Proteção de Dados (LGPD), só para os fins deste cadastro?",
    required: true,
  },

  // ---- caminho: só receber informações
  {
    catalog_field_key: "nome",
    path_key: "info",
    prompt: "Combinado! Só preciso confirmar: qual é o seu nome?",
    required: true,
  },
  {
    catalog_field_key: "whatsapp",
    path_key: "info",
    prompt:
      "É neste número que você quer receber as informações? Se sim, escreva SIM. Se preferir outro, escreva o número com DDD.",
    required: true,
  },
  {
    catalog_field_key: "consentimento",
    path_key: "info",
    prompt: "Você autoriza a campanha te mandar novidades por WhatsApp?",
    required: true,
  },
  {
    catalog_field_key: "consentimento_lgpd",
    path_key: "info",
    prompt:
      "E autoriza o uso dos seus dados pela campanha, conforme a Lei Geral de Proteção de Dados (LGPD), só para te manter informado?",
    required: true,
  },
  {
    catalog_field_key: FLOW_NO_FIELD_KEY,
    kind: "finish",
    path_key: "info",
    prompt:
      "Prontinho! A partir de agora você recebe as novidades da campanha por aqui. Se quiser fazer parte de verdade, é só me chamar. 💜",
    required: false,
    option_routes: { source_form_type: "receber_informacoes" },
  },

  // ---- caminho: falar com alguém
  {
    catalog_field_key: FLOW_NO_FIELD_KEY,
    kind: "handoff",
    path_key: "humano",
    prompt:
      "Já avisei nossa equipe! Alguém vai te responder por aqui mesmo, o mais rápido possível. 💪",
    required: false,
  },
];


// ------------------------------------------------------------- caminhos e regras
// Helpers puros usados pelo construtor (tela) e pela validação no servidor.
// Espelham a lógica de ramificação do construtor de formulários.

/** Destino especial de uma opção: encerrar a conversa e salvar o cadastro. */
export const FLOW_FINISH_ROUTE = "__finish__";

/** Nome amigável de um caminho (roteiro padrão tem nomes fixos; o resto é livre). */
export function pathLabel(key: string): string {
  return FLOW_PATH_LABELS[key] ?? key;
}

export type FlowStepLike = {
  id?: string;
  catalog_field_key: string;
  prompt: string;
  required: boolean;
  response_kind: FlowResponseKind;
  kind: FlowStepKind;
  path_key: string;
  option_routes: Record<string, string>;
  options: FormCatalogOption[];
};

export type FlowPathGroup<T extends FlowStepLike = FlowStepLike> = {
  key: string;
  label: string;
  steps: T[];
  /** Índices originais das etapas dentro da lista completa. */
  indexes: number[];
};

/**
 * Agrupa as etapas por caminho, mantendo a ordem de aparição. O caminho padrão
 * (início) vem sempre primeiro, mesmo que não tenha etapas.
 */
export function groupStepsByPath<T extends FlowStepLike>(steps: T[]): FlowPathGroup<T>[] {
  const groups = new Map<string, FlowPathGroup<T>>();
  const ensure = (key: string) => {
    let g = groups.get(key);
    if (!g) {
      g = { key, label: pathLabel(key), steps: [], indexes: [] };
      groups.set(key, g);
    }
    return g;
  };
  ensure(FLOW_DEFAULT_PATH);
  steps.forEach((s, i) => {
    const g = ensure(s.path_key || FLOW_DEFAULT_PATH);
    g.steps.push(s);
    g.indexes.push(i);
  });
  // Caminhos citados em menus, mesmo vazios, precisam aparecer para edição.
  for (const s of steps) {
    for (const target of Object.values(s.option_routes ?? {})) {
      if (target && target !== FLOW_FINISH_ROUTE) ensure(target);
    }
  }
  return [...groups.values()];
}

/** Todas as chaves de caminho conhecidas de um roteiro. */
export function flowPathKeys(steps: FlowStepLike[]): string[] {
  return groupStepsByPath(steps).map((g) => g.key);
}

/** Etapas que podem ter destino por opção (menu ou escolha única). */
export function stepHasRoutes(step: FlowStepLike): boolean {
  return step.kind === "menu" || (step.kind === "question" && step.response_kind === "single_choice");
}

export type FlowValidationResult = { errors: string[]; warnings: string[] };

/** Confere o roteiro e devolve mensagens em português para a tela e o servidor. */
export function validateFlowDraft(steps: FlowStepLike[]): FlowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!steps.length) {
    errors.push("O roteiro está vazio: adicione ao menos uma etapa.");
    return { errors, warnings };
  }

  const groups = groupStepsByPath(steps);
  const reached = new Set<string>([FLOW_DEFAULT_PATH]);
  for (const s of steps) {
    for (const target of Object.values(s.option_routes ?? {})) {
      if (target && target !== FLOW_FINISH_ROUTE) reached.add(target);
    }
  }

  for (const g of groups) {
    if (!g.steps.length) {
      errors.push(`O caminho “${g.label}” não tem nenhuma etapa.`);
      continue;
    }
    if (!reached.has(g.key)) {
      warnings.push(
        `Ninguém chega no caminho “${g.label}”: nenhum menu ou opção aponta para ele.`,
      );
    }
    const last = g.steps[g.steps.length - 1]!;
    const endsWell =
      last.kind === "finish" ||
      last.kind === "handoff" ||
      last.kind === "menu" ||
      g.steps.some((s) => stepHasRoutes(s) && Object.keys(s.option_routes ?? {}).length > 0);
    if (!endsWell) {
      warnings.push(
        `O caminho “${g.label}” termina sem etapa de encerramento: o cadastro é salvo automaticamente no fim.`,
      );
    }
  }

  for (const s of steps) {
    if (s.kind === "menu") {
      const opts = stepOptions(s);
      if (opts.length < 2) {
        errors.push(`O menu “${s.prompt || "(sem texto)"}” precisa de ao menos 2 opções.`);
      }
      const missing = opts.filter((o) => !s.option_routes?.[o.value]);
      if (missing.length) {
        errors.push(
          `No menu “${s.prompt || "(sem texto)"}”, estas opções estão sem destino: ${missing
            .map((o) => o.label)
            .join(", ")}.`,
        );
      }
      if (opts.length > 10) {
        errors.push("O WhatsApp aceita no máximo 10 opções por lista.");
      }
    }
    if (!s.prompt?.trim()) {
      errors.push("Existe uma etapa sem texto para a pessoa ler.");
    }
    for (const o of stepOptions(s)) {
      if (o.label.length > 72) {
        warnings.push(
          `A opção “${o.label.slice(0, 40)}…” é longa: o WhatsApp mostra até 72 caracteres.`,
        );
      }
    }
  }

  return { errors, warnings };
}
