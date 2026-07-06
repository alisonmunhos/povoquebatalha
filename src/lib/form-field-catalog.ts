// Catálogo fixo de tipos de campo do construtor de formulários personalizados.
//
// Cada entrada aqui é a "camada fixa": ela amarra uma chave de campo a uma (ou mais)
// coluna(s) de `contacts` e ao tipo de filtro correspondente já existente em
// `src/lib/crm-filters.ts` / `src/components/ContactFiltersPanel.tsx`. O enunciado
// exato da pergunta, texto de ajuda e obrigatoriedade ficam na "camada editável"
// (tabela `form_definition_questions`), nunca aqui — por isso o filtro nunca quebra
// independente de como a pergunta foi redigida em cada formulário.
//
// Adicionar um campo genuinamente novo aqui sempre exige também seguir o padrão de
// 6 pontos documentado em `src/lib/crm-filters.ts:1-4` (migration, filtro, opções de
// filtro, painel de filtros, importação CSV, edição manual da ficha) — por isso este
// catálogo é uma constante de código, não uma tabela no banco.

export type FormFieldResponseType = "short_text" | "multiple_choice" | "yes_no" | "date" | "number" | "address_block";
export type FormFieldFilterKind = "text" | "multiselect" | "enum" | "boolean";

export type FormCatalogOption = { value: string; label: string };

export type FormCatalogField = {
  key: string;
  responseType: FormFieldResponseType;
  /** Coluna(s) de `contacts` que essa resposta alimenta. */
  targetColumns: string[];
  filterKind: FormFieldFilterKind;
  defaultLabel: string;
  defaultHelpText?: string;
  /** Sempre presente em qualquer formulário, não pode ser removido do construtor. */
  core?: boolean;
  /** Sempre obrigatório, independente do que quem monta o formulário escolher. */
  alwaysRequired?: boolean;
  /** Lista fixa de opções, para multiple_choice/enum. */
  options?: FormCatalogOption[];
  /** Só renderiza/grava se outro campo do mesmo formulário tiver esse valor. */
  dependsOn?: { key: string; value: boolean };
};

const DIAS_SEMANA = [
  { v: "segunda", l: "Segunda" }, { v: "terca", l: "Terça" }, { v: "quarta", l: "Quarta" },
  { v: "quinta", l: "Quinta" }, { v: "sexta", l: "Sexta" }, { v: "sabado", l: "Sábado" },
  { v: "domingo", l: "Domingo" },
];
const PERIODOS_DIA = [
  { v: "manha", l: "Manhã" }, { v: "tarde", l: "Tarde" }, { v: "noite", l: "Noite" },
];
const DISPONIBILIDADE_OPTIONS: FormCatalogOption[] = DIAS_SEMANA.flatMap((dia) =>
  PERIODOS_DIA.map((periodo) => ({ value: `${dia.v}_${periodo.v}`, label: `${dia.l} - ${periodo.l}` })),
);

export const FORM_FIELD_CATALOG: FormCatalogField[] = [
  // Sempre presentes, não removíveis.
  {
    key: "nome", responseType: "short_text", targetColumns: ["nome"], filterKind: "text",
    defaultLabel: "Nome completo", core: true, alwaysRequired: true,
  },
  {
    key: "whatsapp", responseType: "short_text", targetColumns: ["phone_raw"], filterKind: "text",
    defaultLabel: "WhatsApp", defaultHelpText: "Com DDD, ex.: (11) 91234-5678",
    core: true, alwaysRequired: true,
  },
  {
    key: "consentimento", responseType: "yes_no", targetColumns: ["consentimento_whatsapp"], filterKind: "boolean",
    defaultLabel: "Aceito receber mensagens da campanha pelo WhatsApp",
    core: true, alwaysRequired: true,
  },

  // Já existem na ficha — reusam o filtro já existente.
  {
    key: "endereco_completo", responseType: "address_block",
    targetColumns: ["cep", "endereco", "numero", "complemento", "bairro", "referencia", "cidade", "uf"],
    filterKind: "text", defaultLabel: "Endereço completo",
    defaultHelpText: "CEP é opcional — se não souber, preencha o resto manualmente.",
  },
  { key: "email", responseType: "short_text", targetColumns: ["email"], filterKind: "text", defaultLabel: "E-mail" },
  { key: "nome_social", responseType: "short_text", targetColumns: ["nome_social"], filterKind: "text", defaultLabel: "Nome social / apelido" },
  { key: "profissao", responseType: "short_text", targetColumns: ["profissao"], filterKind: "text", defaultLabel: "Profissão / ocupação" },
  { key: "instituicao", responseType: "short_text", targetColumns: ["instituicao"], filterKind: "text", defaultLabel: "Onde trabalha" },
  {
    key: "formas_ajuda", responseType: "multiple_choice", targetColumns: ["formas_ajuda"], filterKind: "multiselect",
    defaultLabel: "Como você pode ajudar?",
    options: [
      { value: "panfletagem_banquinha", label: "Panfletagem / Banquinha" },
      { value: "compartilhar_whatsapp", label: "Compartilhar material no WhatsApp" },
      { value: "compartilhar_redes", label: "Compartilhar nas redes sociais" },
      { value: "participar_eventos", label: "Participar de eventos" },
      { value: "ajudar_organizacao", label: "Ajudar na organização" },
      { value: "mobilizar_bairro", label: "Mobilizar pessoas do bairro" },
      { value: "adesivar_carro", label: "Adesivar o carro" },
      { value: "plaquinha_casa", label: "Plaquinha na frente de casa" },
      { value: "receber_panfletos", label: "Receber panfletos e adesivos" },
      { value: "outro", label: "Outro" },
    ],
  },
  {
    key: "formas_ajuda_outro", responseType: "short_text", targetColumns: ["formas_ajuda_outro"], filterKind: "text",
    defaultLabel: 'Se marcou "Outro" em "Como você pode ajudar", descreva aqui',
  },
  {
    key: "participa_movimento_social", responseType: "yes_no", targetColumns: ["participa_movimento_social"], filterKind: "boolean",
    defaultLabel: "Participa de algum movimento social?",
  },
  {
    key: "movimento_social_nome", responseType: "short_text", targetColumns: ["movimento_social_nome"], filterKind: "text",
    defaultLabel: "Qual movimento social?",
    dependsOn: { key: "participa_movimento_social", value: true },
  },
  {
    key: "coletivo_alicerce", responseType: "yes_no", targetColumns: ["coletivo_alicerce"], filterKind: "boolean",
    defaultLabel: "Faz parte do Coletivo Alicerce?",
  },

  // Campos novos (Fase 2) — coluna e filtro criados especificamente para o construtor.
  {
    key: "disponibilidade", responseType: "multiple_choice", targetColumns: ["disponibilidade"], filterKind: "multiselect",
    defaultLabel: "Quando você pode ajudar?",
    defaultHelpText: "Marque todos os dias e períodos em que você tem disponibilidade.",
    options: DISPONIBILIDADE_OPTIONS,
  },
  {
    key: "quem_indicou", responseType: "short_text", targetColumns: ["quem_indicou"], filterKind: "text",
    defaultLabel: "Quem te indicou?",
  },
  {
    key: "faixa_etaria", responseType: "multiple_choice", targetColumns: ["faixa_etaria"], filterKind: "enum",
    defaultLabel: "Faixa etária",
    options: [
      { value: "16_17", label: "16-17 anos" },
      { value: "18_24", label: "18-24 anos" },
      { value: "25_34", label: "25-34 anos" },
      { value: "35_44", label: "35-44 anos" },
      { value: "45_59", label: "45-59 anos" },
      { value: "60_mais", label: "60+ anos" },
    ],
  },
  {
    key: "rede_social", responseType: "short_text", targetColumns: ["rede_social"], filterKind: "text",
    defaultLabel: "Seu @ nas redes sociais",
    defaultHelpText: "Ex.: @seuusuario",
  },
  {
    key: "zona_eleitoral", responseType: "short_text", targetColumns: ["zona_eleitoral"], filterKind: "text",
    defaultLabel: "Zona eleitoral / local de votação",
    defaultHelpText:
      "Perguntamos isso só para organizar melhor a campanha por região — é opcional e você decide se quer responder.",
  },
  {
    key: "como_conheceu", responseType: "short_text", targetColumns: ["como_conheceu"], filterKind: "text",
    defaultLabel: "Como você conheceu a campanha?",
  },
];

export function getCatalogField(key: string): FormCatalogField | undefined {
  return FORM_FIELD_CATALOG.find((f) => f.key === key);
}

export const CORE_CATALOG_FIELDS = FORM_FIELD_CATALOG.filter((f) => f.core);

// Os 2 formulários fixos usam slug "-fixo" internamente (pra não colidir com as rotas
// estáticas antigas /api/public/forms/recadastro|inscrever.ts, mantidas até serem
// validadas e removidas) — mas a URL pública de verdade é a rota fixa de sempre.
export const FIXED_FORM_PUBLIC_PATHS: Record<string, string> = {
  "recadastro-fixo": "/recadastro",
  "inscrever-fixo": "/inscrever",
};
