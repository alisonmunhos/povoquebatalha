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

/** Roteiro padrão do fluxo "FAÇA PARTE DA NOSSA CAMPANHA!". */
export const DEFAULT_FLOW_STEPS: Array<{
  catalog_field_key: string;
  prompt: string;
  required: boolean;
}> = [
  { catalog_field_key: "nome", prompt: "Pra começar, qual é o seu nome completo?", required: true },
  {
    catalog_field_key: "nome_social",
    prompt: 'Você usa nome social ou apelido? Se sim, escreva aqui. Se não, responda "pular".',
    required: false,
  },
  {
    catalog_field_key: "whatsapp",
    prompt:
      "Esse WhatsApp que você está usando é o melhor número pra gente te chamar? Se sim, escreva SIM. Se não, escreva o número com DDD.",
    required: true,
  },
  {
    catalog_field_key: "endereco_completo",
    prompt: "Agora o endereço. Qual é o seu CEP? (só os números)",
    required: false,
  },
  {
    catalog_field_key: "formas_ajuda",
    prompt: "Como você pode ajudar a campanha? Escolha quantas quiser.",
    required: false,
  },
  {
    catalog_field_key: "coletivo_alicerce",
    prompt: "Você faz parte do Coletivo Alicerce?",
    required: false,
  },
  {
    catalog_field_key: "consentimento",
    prompt: "Você aceita receber mensagens da campanha por aqui, no WhatsApp?",
    required: true,
  },
  {
    catalog_field_key: "consentimento_lgpd",
    prompt:
      "Por último: você autoriza o uso dos seus dados pela campanha, conforme a Lei Geral de Proteção de Dados (LGPD), só para os fins deste cadastro?",
    required: true,
  },
];
