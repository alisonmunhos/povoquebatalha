import { useState, useMemo, type ReactNode } from "react";
import { ChevronDown, ChevronRight, MapPin, User, Users, MessageCircle, History, FileUp, SlidersHorizontal, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MultiSelectFilter, SingleSelectFilter, type MultiOption } from "@/components/MultiSelectFilter";
import { Input } from "@/components/ui/input";
import type { CrmFilters } from "@/lib/crm-filters";
import {
  applyFilterSelection,
  getFilterMode,
  getFilterValues,
  type ExcludableFilterKey,
  type FilterMode,
} from "@/lib/filter-exclusion";
import { SYSTEM_CAPTURE_SENTINEL } from "@/lib/contact-source-metadata";
import { listSystemUserOptions } from "@/lib/users.functions";
import { cn } from "@/lib/utils";


export type FilterOptionsBundle = {
  cidades: MultiOption[];
  bairros: MultiOption[];
  ufs: MultiOption[];
  profissoes: MultiOption[];
  instituicoes: MultiOption[];
  tipos_contato: MultiOption[];
  origens: MultiOption[];
  origem_detalhes: MultiOption[];
  formas_ajuda: MultiOption[];
  movimentos_sociais: MultiOption[];
  quem_indicou: MultiOption[];
  rede_social: MultiOption[];
  zona_eleitoral: MultiOption[];
  como_conheceu: MultiOption[];
  disponibilidade: MultiOption[];
  faixa_etaria: MultiOption[];
  tags: (MultiOption & { cor?: string | null })[];
  segmentos: { value: string; label: string; tipo: string }[];
  campanhas: { value: string; label: string; status: string }[];
  missoes?: { value: string; label: string }[];
  eventos?: { value: string; label: string }[];
  formularios?: { value: string; label: string }[];
  mensagens: { value: string; label: string; kind: string }[];
  importacoes: MultiOption[];
  tracking_points: MultiOption[];
  imported_by: MultiOption[];
  system_users?: MultiOption[];
  consentimento_lgpd?: MultiOption[];
  consentimento_dados_sensiveis?: MultiOption[];
  capture_channel_counts?: Record<string, number>;
  source_module_counts?: Record<string, number>;
  source_form_type_counts?: Record<string, number>;
};

const SOURCE_MODULES: MultiOption[] = [
  { value: "gestao_base", label: "Gestão da Base" },
  { value: "territorio", label: "Território" },
  { value: "agitacao", label: "Agitação" },
  { value: "mapa", label: "Mapa" },
  { value: "inbox", label: "Inbox" },
  { value: "ficha_contato", label: "Ficha do contato" },
  { value: "relacionamento", label: "Relacionamento" },
  { value: "link_publico", label: "Links públicos" },
  { value: "formulario_publico", label: "Formulário público" },
  { value: "importacao", label: "Importação" },
  { value: "manual", label: "Cadastro manual" },
  { value: "outro", label: "Outro" },
];

const SOURCE_FORM_TYPES: MultiOption[] = [
  { value: "cadastro_completo", label: "Cadastro completo" },
  { value: "receber_informacoes", label: "Receber informações" },
];

const PHONE_STATUS: MultiOption[] = [
  { value: "valido", label: "Número OK" },
  { value: "precisa_revisao", label: "Falta DDD" },
  { value: "sem_ddd", label: "Falta DDD (sem sugestão)" },
  { value: "sem_nono_digito", label: "Falta 9º dígito" },
  { value: "invalido", label: "Número inválido" },
  { value: "duplicado_possivel", label: "Possível duplicado" },
];
const WPP_STATUS: MultiOption[] = [
  { value: "desconhecido", label: "Não verificado" },
  { value: "confirmado", label: "Confirmado no WhatsApp" },
  { value: "invalido", label: "Não tem WhatsApp" },
  { value: "erro_envio", label: "Erro no envio" },
  { value: "opt_out", label: "Opt-out" },
];
const LIFECYCLE: MultiOption[] = [
  { value: "recadastro_concluido", label: "Cadastro completo" },
  { value: "importado_aguardando_recadastro", label: "Só importado (sem cadastro)" },
  { value: "recadastro_iniciado", label: "Cadastro iniciado" },
  { value: "link_enviado", label: "Link enviado" },
  { value: "nao_respondeu", label: "Não respondeu" },
  { value: "telefone_invalido", label: "Marcado telefone inválido (manual)" },
  { value: "precisa_revisao", label: "Precisa revisão (manual)" },
  { value: "duplicado_possivel", label: "Possível duplicado (manual)" },
  { value: "duplicado_mesclado", label: "Mesclado" },
  { value: "nao_enviar", label: "Bloqueado (não enviar)" },
];
const CAPTURE_CHANNELS: MultiOption[] = [
  { value: "formulario_publico", label: "Formulário público" },
  { value: "captacao_atribuida", label: "Captação atribuída" },
];
const TIPO_CONTATO: MultiOption[] = [
  { value: "apoiador", label: "Apoiador" },
  { value: "voluntario", label: "Voluntário" },
  { value: "lista_divulgacao", label: "Lista de divulgação" },
  { value: "importado", label: "Importado" },
  { value: "outro", label: "Outro" },
];

const FAIXA_ETARIA: MultiOption[] = [
  { value: "16_17", label: "16-17 anos" },
  { value: "18_24", label: "18-24 anos" },
  { value: "25_34", label: "25-34 anos" },
  { value: "35_44", label: "35-44 anos" },
  { value: "45_59", label: "45-59 anos" },
  { value: "60_mais", label: "60+ anos" },
];

const SIM_NAO: MultiOption[] = [
  { value: "sim", label: "Sim" },
  { value: "nao", label: "Não" },
];

/** Mescla opções dinâmicas da base com um mapa fixo de rótulos amigáveis. */
function mergeLabels(dynamic: MultiOption[] | undefined, labels: MultiOption[]): MultiOption[] {
  const labelMap = new Map(labels.map((l) => [l.value.toLowerCase(), l.label]));
  const list = (dynamic ?? []).map((o) => ({
    ...o,
    label: labelMap.get(o.value.toLowerCase()) ?? o.label,
  }));
  return list.length ? list : labels;
}

export type StatusFacets = {
  lifecycle: Record<string, number>;
  phone: Record<string, number>;
  whatsapp: Record<string, number>;
};

/** Anexa a contagem real da base a uma lista fixa; opções com zero ficam desabilitadas. */
function withCounts(list: MultiOption[], facet: Record<string, number> | undefined): MultiOption[] {
  if (!facet) return list;
  return list.map((o) => {
    const count = facet[o.value] ?? 0;
    return count > 0
      ? { ...o, count }
      : { ...o, count: 0, disabled: true, disabledReason: "nenhum contato" };
  });
}

type Props = {
  filters: CrmFilters;
  onChange: (f: CrmFilters) => void;
  options: FilterOptionsBundle | undefined;
  /** Contagens reais por status, vindas do banco. Sem elas, as listas ficam sem número. */
  facets?: StatusFacets;
};

export function ContactFiltersPanel({ filters, onChange, options, facets }: Props) {
  const set = <K extends keyof CrmFilters>(k: K, v: CrmFilters[K]) => {
    const next = { ...filters, [k]: v } as CrmFilters;
    if (v === undefined || (Array.isArray(v) && v.length === 0) || v === "") {
      delete (next as Record<string, unknown>)[k as string];
    }
    onChange(next);
  };

  /**
   * Liga um filtro de lista ao par incluir/excluir. Passa `mode` + `onApply`
   * para o MultiSelectFilter mostrar "Mostrar os marcados / Esconder os marcados".
   */
  const sel = (key: ExcludableFilterKey) => ({
    value: getFilterValues(filters, key),
    mode: getFilterMode(filters, key),
    onApply: (values: string[], mode: FilterMode) =>
      onChange(applyFilterSelection(filters, key, values, mode)),
    onChange: (values: string[]) =>
      onChange(applyFilterSelection(filters, key, values, getFilterMode(filters, key))),
  });

  const opts = options ?? {
    cidades: [], bairros: [], ufs: [], profissoes: [], instituicoes: [], tipos_contato: [],
    origens: [], origem_detalhes: [], formas_ajuda: [], movimentos_sociais: [],
    quem_indicou: [], rede_social: [], zona_eleitoral: [], como_conheceu: [], disponibilidade: [], faixa_etaria: [],
    tags: [], segmentos: [], campanhas: [], mensagens: [], importacoes: [],
    tracking_points: [], imported_by: [], missoes: [], eventos: [], formularios: [],
  };

  const systemUsersFn = useServerFn(listSystemUserOptions);
  const systemUsersQ = useQuery({
    queryKey: ["system-user-options"],
    queryFn: () => systemUsersFn(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const systemUserOptions = useMemo<MultiOption[]>(() => {
    const arr = (systemUsersQ.data?.users ?? []).map((u) => ({
      value: u.id,
      // Nunca cair no e-mail como rótulo: é dado interno do usuário.
      label:
        u.full_name && u.full_name.trim().length > 0
          ? u.full_name
          : `Usuário sem nome (${u.id.slice(0, 8)})`,
    }));
    arr.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    return arr;
  }, [systemUsersQ.data]);
  const captureUserOptions = useMemo<MultiOption[]>(() => [
    { value: SYSTEM_CAPTURE_SENTINEL, label: "Sistema (formulário público)" },
    ...systemUserOptions,
  ], [systemUserOptions]);

  return (
    <div className="border rounded-xl bg-card divide-y">
      <Section icon={<SlidersHorizontal className="h-4 w-4" />} title="Filtros rápidos" defaultOpen>
        <Field label="Arquivados">
          <SingleSelectFilter
            options={[
              { value: "nao", label: "Somente ativos" },
              { value: "sim", label: "Somente arquivados" },
              { value: "todos", label: "Todos" },
            ]}
            value={filters.archived ?? "nao"}
            onChange={(v) => set("archived", (v as "nao" | "sim" | "todos") ?? "nao")}
            placeholder="Somente ativos"
          />
        </Field>
        <Field
          label="Usuários do sistema"
          hint="Usuários com login (equipe, agitadores) também são contatos. Use 'Esconder usuários' para ver só a base de apoiadores."
        >
          <SingleSelectFilter
            options={[
              { value: "todos", label: "Todos (contatos e usuários)" },
              { value: "sim", label: "Somente usuários do sistema" },
              { value: "nao", label: "Esconder usuários do sistema" },
            ]}
            value={filters.is_system_user ?? "todos"}
            onChange={(v) => set("is_system_user", v === "sim" || v === "nao" ? v : undefined)}
            placeholder="Todos (contatos e usuários)"
          />
        </Field>
        <Field label="Tags" hint="Dentro do menu você pode escolher entre mostrar só os marcados ou esconder os marcados (exceto).">
          <MultiSelectFilter options={opts.tags} {...sel("tag_ids")} placeholder="Todas as tags" />
        </Field>
        <Field label="Situação do cadastro" hint="Progresso do recadastro + marcações manuais (bloqueado, precisa revisão). Exemplo: 'Cadastro completo' = quem já preencheu o formulário de atualização. Opções sem contatos ficam desabilitadas.">
          <MultiSelectFilter options={withCounts(LIFECYCLE, facets?.lifecycle)} {...sel("lifecycle_statuses")} placeholder="Qualquer" />
        </Field>
        <Field label="Status do número" hint="Qualidade técnica do telefone. 'Falta DDD' = precisa completar o código de área.">
          <MultiSelectFilter options={withCounts(PHONE_STATUS, facets?.phone)} {...sel("phone_statuses")} placeholder="Qualquer status" />
        </Field>
        <Field label="Confirmado no WhatsApp?" hint="Preenchido só após você rodar 'Verificar no WhatsApp'.">
          <MultiSelectFilter options={withCounts(WPP_STATUS, facets?.whatsapp)} {...sel("whatsapp_statuses")} placeholder="Qualquer status" />
        </Field>
      </Section>


      <Section icon={<MapPin className="h-4 w-4" />} title="Onde está">
        <Field label="UF">
          <MultiSelectFilter options={opts.ufs} {...sel("ufs")} placeholder="Qualquer UF" />
        </Field>
        <Field label="Cidade">
          <MultiSelectFilter options={opts.cidades} {...sel("cidades")} placeholder="Qualquer cidade" />
        </Field>
        <Field label="Bairro" hint={filters.cidades?.length ? "Mostrando só bairros da(s) cidade(s) selecionada(s)." : undefined}>
          <MultiSelectFilter options={opts.bairros} {...sel("bairros")} placeholder="Qualquer bairro" />
        </Field>
      </Section>

      <Section icon={<User className="h-4 w-4" />} title="Quem é">
        <Field label="Tipo de contato" informativo>
          <MultiSelectFilter options={mergeLabels(opts.tipos_contato, TIPO_CONTATO)} {...sel("tipos_contato")} placeholder="Qualquer tipo" />
        </Field>
        <Field label="Nome social contém…" hint="Busca livre no campo nome social">
          <Input value={filters.nome_social ?? ""} onChange={(e) => set("nome_social", e.target.value || undefined)} placeholder="Ex.: Ana" />
        </Field>
        <Field label="Profissão" hint="Respostas já cadastradas. Digite no menu para achar; marque quantas quiser.">
          <MultiSelectFilter options={opts.profissoes} {...sel("profissoes")} placeholder="Qualquer profissão" />
        </Field>
        <Field label="Onde trabalha" hint="Respostas já cadastradas no campo instituição/local de trabalho.">
          <MultiSelectFilter options={opts.instituicoes} {...sel("instituicoes")} placeholder="Qualquer local" />
        </Field>
        <Field label="Coletivo Alicerce" informativo>
          <SingleSelectFilter
            options={SIM_NAO}
            value={filters.coletivo_alicerce === undefined ? undefined : filters.coletivo_alicerce ? "sim" : "nao"}
            onChange={(v) => set("coletivo_alicerce", v === undefined ? undefined : v === "sim")}
            placeholder="Qualquer"
          />
        </Field>
        <Field label="Participa de movimento social">
          <SingleSelectFilter
            options={SIM_NAO}
            value={filters.participa_movimento_social === undefined ? undefined : filters.participa_movimento_social ? "sim" : "nao"}
            onChange={(v) => set("participa_movimento_social", v === undefined ? undefined : v === "sim")}
            placeholder="Qualquer"
          />
        </Field>
        <Field label="Movimento social" informativo hint="Respostas já cadastradas no nome do movimento.">
          <MultiSelectFilter options={opts.movimentos_sociais} {...sel("movimentos_sociais")} placeholder="Qualquer movimento" />
        </Field>
        <Field label="Faixa etária" informativo>
          <MultiSelectFilter options={mergeLabels(opts.faixa_etaria, FAIXA_ETARIA)} {...sel("faixas_etarias")} placeholder="Qualquer faixa" />
        </Field>
        <Field label="Rede social" informativo hint="Respostas já cadastradas.">
          <MultiSelectFilter options={opts.rede_social} {...sel("rede_social_values")} placeholder="Qualquer rede" />
        </Field>
        <Field label="Quem indicou" informativo hint="Respostas já cadastradas.">
          <MultiSelectFilter options={opts.quem_indicou} {...sel("quem_indicou_values")} placeholder="Qualquer indicação" />
        </Field>
        <Field label="Zona eleitoral / local de votação" informativo hint="Respostas já cadastradas.">
          <MultiSelectFilter options={opts.zona_eleitoral} {...sel("zona_eleitoral_values")} placeholder="Qualquer zona/local" />
        </Field>
        <Field label="Como conheceu a campanha" informativo hint="Respostas já cadastradas.">
          <MultiSelectFilter options={opts.como_conheceu} {...sel("como_conheceu_values")} placeholder="Qualquer resposta" />
        </Field>
      </Section>

      <Section icon={<Users className="h-4 w-4" />} title="Como pode ajudar">
        <Field label="Formas de ajuda">
          <MultiSelectFilter options={opts.formas_ajuda} {...sel("formas_ajuda")} placeholder="Todas as formas" />
        </Field>
        <Field label="Disponibilidade" informativo>
          <MultiSelectFilter options={opts.disponibilidade} {...sel("disponibilidade")} placeholder="Qualquer dia/período" />
        </Field>
      </Section>



      <Section icon={<MessageCircle className="h-4 w-4" />} title="Posso falar com essa pessoa?">
        <Field label="Apto para envio" hint="Atalho: consentimento WhatsApp = sim, sem opt-out, não bloqueado e telefone válido.">
          <SingleSelectFilter
            options={SIM_NAO}
            value={filters.apto_envio}
            onChange={(v) => set("apto_envio", v as "sim" | "nao" | undefined)}
            placeholder="Qualquer"
          />
        </Field>
        <Field label="E-mail contém…" hint="Busca livre no campo e-mail">
          <Input value={filters.email_contains ?? ""} onChange={(e) => set("email_contains", e.target.value || undefined)} placeholder="Ex.: gmail.com" />
        </Field>
        <Field label="Tem e-mail secundário">
          <SingleSelectFilter options={SIM_NAO} value={filters.tem_email_secundario} onChange={(v) => set("tem_email_secundario", v as "sim" | "nao" | undefined)} placeholder="Qualquer" />
        </Field>
        <Field label="Tem telefone secundário">
          <SingleSelectFilter options={SIM_NAO} value={filters.tem_phone_secundario} onChange={(v) => set("tem_phone_secundario", v as "sim" | "nao" | undefined)} placeholder="Qualquer" />
        </Field>
        <div className="col-span-full mt-2 pt-2 border-t border-dashed">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Detalhado / avançado</p>
          <p className="text-[10px] text-muted-foreground">Use "Apto para envio" acima como atalho. Os filtros abaixo permitem ajuste fino.</p>
        </div>
        <Field label="Consentimento WhatsApp">
          <SingleSelectFilter options={SIM_NAO} value={filters.consent} onChange={(v) => set("consent", v as "sim" | "nao" | undefined)} placeholder="Qualquer" />
        </Field>
        <Field label="Consentimento LGPD" hint="Tratamento de dados pessoais — independente do consentimento de WhatsApp.">
          <SingleSelectFilter options={opts.consentimento_lgpd ?? SIM_NAO} value={filters.consentimento_lgpd} onChange={(v) => set("consentimento_lgpd", v as "sim" | "nao" | undefined)} placeholder="Qualquer" />
        </Field>
        <Field label="Dados Sensíveis">
          <SingleSelectFilter options={opts.consentimento_dados_sensiveis ?? SIM_NAO} value={filters.consentimento_dados_sensiveis} onChange={(v) => set("consentimento_dados_sensiveis", v as "sim" | "nao" | undefined)} placeholder="Qualquer" />
        </Field>
        <Field label="Opt-out (não quer receber)">
          <SingleSelectFilter options={SIM_NAO} value={filters.optOut} onChange={(v) => set("optOut", v as "sim" | "nao" | undefined)} placeholder="Qualquer" />
        </Field>
        <Field label="Bloqueado para envio">
          <SingleSelectFilter options={SIM_NAO} value={filters.bloqueado} onChange={(v) => set("bloqueado", v as "sim" | "nao" | undefined)} placeholder="Qualquer" />
        </Field>
        {/* Status do telefone / WhatsApp / Ciclo de vida foram promovidos para "Filtros rápidos" no topo. */}
      </Section>


      <Section icon={<History className="h-4 w-4" />} title="O que já aconteceu">
        <Field label="Recebeu campanha">
          <SingleSelectFilter options={opts.campanhas} value={filters.recebeu_campanha_id} onChange={(v) => set("recebeu_campanha_id", v)} placeholder="Escolher campanha" />
        </Field>
        <Field label="NÃO recebeu campanha">
          <SingleSelectFilter options={opts.campanhas} value={filters.nao_recebeu_campanha_id} onChange={(v) => set("nao_recebeu_campanha_id", v)} placeholder="Escolher campanha" />
        </Field>
        <Field label="Erro em campanha">
          <SingleSelectFilter options={opts.campanhas} value={filters.erro_campanha_id} onChange={(v) => set("erro_campanha_id", v)} placeholder="Escolher campanha" />
        </Field>
        <Field label="Recebeu mensagem salva">
          <SingleSelectFilter options={opts.mensagens} value={filters.recebeu_template_id} onChange={(v) => set("recebeu_template_id", v)} placeholder="Escolher mensagem" />
        </Field>
        <Field label="NÃO recebeu mensagem salva">
          <SingleSelectFilter options={opts.mensagens} value={filters.nao_recebeu_template_id} onChange={(v) => set("nao_recebeu_template_id", v)} placeholder="Escolher mensagem" />
        </Field>
        <Field
          label="Recebeu mensagem de missão"
          hint="'Recebeu' conta só o que o agitador marcou como enviado. 'Foi atribuído' inclui quem entrou na leva de alguém, mesmo sem envio confirmado. Use junto de 'Missão específica' para não repetir mensagem para quem já recebeu."
        >
          <SingleSelectFilter
            options={[
              { value: "sim", label: "Recebeu mensagem" },
              { value: "nao", label: "Não recebeu" },
              { value: "atribuido", label: "Foi atribuído (mesmo sem envio)" },
            ]}
            value={filters.missao_recebida}
            onChange={(v) => set("missao_recebida", v as "sim" | "nao" | "atribuido" | undefined)}
            placeholder="Qualquer"
          />
        </Field>
        <Field label="Missão específica" hint="Opcional: limita o filtro acima a uma missão.">
          <SingleSelectFilter options={opts.missoes ?? []} value={filters.missao_id} onChange={(v) => set("missao_id", v)} placeholder="Qualquer missão" />
        </Field>
        <Field label="Presença em evento">
          <SingleSelectFilter
            options={[
              { value: "sim", label: "Confirmou presença" },
              { value: "recusou", label: "Recusou o convite" },
              { value: "nao", label: "Não confirmou" },
            ]}
            value={filters.evento_rsvp}
            onChange={(v) => set("evento_rsvp", v as "sim" | "nao" | "recusou" | undefined)}
            placeholder="Qualquer"
          />
        </Field>
        <Field label="Evento específico" hint="Opcional: limita o filtro de presença a um evento.">
          <SingleSelectFilter options={opts.eventos ?? []} value={filters.evento_id} onChange={(v) => set("evento_id", v)} placeholder="Qualquer evento" />
        </Field>
        <Field label="Já respondeu alguma mensagem" hint="Teve pelo menos uma resposta recebida no WhatsApp.">
          <SingleSelectFilter
            options={SIM_NAO}
            value={filters.respondeu_mensagem}
            onChange={(v) => set("respondeu_mensagem", v as "sim" | "nao" | undefined)}
            placeholder="Qualquer"
          />
        </Field>
      </Section>

      <Section icon={<Zap className="h-4 w-4" />} title="Como entrou">
        <Field label="Canal" hint="Formulário público = preenchido via Entrada de Dados. Captação atribuída = cadastro presencial ou link gerado por alguém da equipe.">
          <MultiSelectFilter options={withCounts(CAPTURE_CHANNELS, opts.capture_channel_counts)} value={filters.capture_channels ?? []} onChange={(v) => set("capture_channels", v as ("captacao_atribuida" | "formulario_publico")[])} placeholder="Qualquer canal" />
        </Field>
        <Field label="Ponto de rastreio" hint="Só aparecem pontos com pelo menos um contato — nome do formulário, link nomeado ou 'Cadastro presencial'.">
          <MultiSelectFilter options={opts.tracking_points} value={filters.tracking_points ?? []} onChange={(v) => set("tracking_points", v)} placeholder="Qualquer ponto" />
        </Field>
        <Field label="Captado por" hint={systemUsersQ.isLoading ? "Carregando lista de usuários…" : "Escolha um usuário ou 'Sistema' para formulários públicos."}>
          <MultiSelectFilter
            options={captureUserOptions}
            value={filters.captured_by_user_ids ?? []}
            onChange={(v) => set("captured_by_user_ids", v)}
            placeholder="Qualquer"
          />
        </Field>
        <Field label="Módulo de origem" hint="Opções sem contatos ficam desabilitadas.">
          <MultiSelectFilter
            options={withCounts(SOURCE_MODULES, opts.source_module_counts)}
            value={filters.source_modules ?? []}
            onChange={(v) => set("source_modules", v)}
            placeholder="Qualquer módulo"
          />
        </Field>
        <Field label="Tipo de formulário" hint="Cadastro completo vs. formulário curto (receber informações). Opções sem contatos ficam desabilitadas.">
          <MultiSelectFilter
            options={withCounts(SOURCE_FORM_TYPES, opts.source_form_type_counts)}
            value={filters.source_form_types ?? []}
            onChange={(v) => set("source_form_types", v)}
            placeholder="Qualquer tipo"
          />
        </Field>
        <Field label="Sem rastreio fino" hint="Contatos sem ponto de rastreio identificado (nome de link ou formulário).">
          <SingleSelectFilter
            options={SIM_NAO}
            value={filters.sem_rastreio_fino === undefined ? undefined : filters.sem_rastreio_fino ? "sim" : "nao"}
            onChange={(v) => set("sem_rastreio_fino", v === undefined ? undefined : v === "sim")}
            placeholder="Qualquer"
          />
        </Field>
        <Field label="Formulário específico" hint="Contatos cujo cadastro veio deste formulário.">
          <MultiSelectFilter
            options={opts.formularios ?? []}
            value={filters.tracking_form_ids ?? []}
            onChange={(v) => set("tracking_form_ids", v)}
            placeholder="Qualquer formulário"
          />
        </Field>
        <Field label="Cadastrado desde" hint="Data de entrada do contato na base.">
          <Input type="date" value={filters.created_desde ?? ""} onChange={(e) => set("created_desde", e.target.value || undefined)} />
        </Field>
        <Field label="Cadastrado até">
          <Input type="date" value={filters.created_ate ?? ""} onChange={(e) => set("created_ate", e.target.value || undefined)} />
        </Field>
        <Field label="Captado desde">
          <Input type="date" value={filters.captado_desde ?? ""} onChange={(e) => set("captado_desde", e.target.value || undefined)} />
        </Field>
        <Field label="Captado até">
          <Input type="date" value={filters.captado_ate ?? ""} onChange={(e) => set("captado_ate", e.target.value || undefined)} />
        </Field>
      </Section>


      <Section icon={<FileUp className="h-4 w-4" />} title="Importação">
        <Field label="Foi importado?" hint="Sim = entrou na base por planilha CSV/Excel (mesmo que depois tenha preenchido formulário).">
          <SingleSelectFilter
            options={SIM_NAO}
            value={filters.foi_importado}
            onChange={(v) => set("foi_importado", v as "sim" | "nao" | undefined)}
            placeholder="Qualquer"
          />
        </Field>
        <Field label="Importado por">
          <MultiSelectFilter
            options={opts.imported_by.length ? opts.imported_by : systemUserOptions}
            value={filters.imported_by_user_ids ?? []}
            onChange={(v) => set("imported_by_user_ids", v)}
            placeholder="Qualquer usuário"
          />
        </Field>
        <Field label="Lote(s) de importação">
          <MultiSelectFilter options={opts.importacoes} value={filters.import_ids ?? []} onChange={(v) => set("import_ids", v)} placeholder="Qualquer lote" />
        </Field>
        <Field label="Importado desde">
          <Input type="date" value={filters.importado_desde ?? ""} onChange={(e) => set("importado_desde", e.target.value || undefined)} />
        </Field>
        <Field label="Importado até">
          <Input type="date" value={filters.importado_ate ?? ""} onChange={(e) => set("importado_ate", e.target.value || undefined)} />
        </Field>
      </Section>
    </div>
  );
}

function Section({ icon, title, defaultOpen = false, children }: { icon: ReactNode; title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/40">
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        {icon}
        <span>{title}</span>
      </button>
      {open && <div className={cn("px-4 pb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3")}>{children}</div>}
    </div>
  );
}

function Field({
  label,
  hint,
  informativo,
  children,
}: {
  label: string;
  hint?: string;
  /** Campo é só etiqueta de cadastro: não entra em nenhuma regra de envio. */
  informativo?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      {children}
      {informativo && (
        <p className="text-[10px] text-muted-foreground/80 mt-1 italic">informativo, não afeta envios</p>
      )}
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
