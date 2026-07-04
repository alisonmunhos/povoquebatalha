import { useState, useMemo, type ReactNode } from "react";
import { ChevronDown, ChevronRight, MapPin, User, Users, MessageCircle, History, FileUp, SlidersHorizontal, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MultiSelectFilter, SingleSelectFilter, type MultiOption } from "@/components/MultiSelectFilter";
import { Input } from "@/components/ui/input";
import type { CrmFilters } from "@/lib/crm-filters";
import { listSystemUserOptions } from "@/lib/users.functions";
import { cn } from "@/lib/utils";


export type FilterOptionsBundle = {
  cidades: MultiOption[];
  bairros: MultiOption[];
  ufs: MultiOption[];
  profissoes: MultiOption[];
  tipos_contato: MultiOption[];
  origens: MultiOption[];
  origem_detalhes: MultiOption[];
  formas_ajuda: MultiOption[];
  movimentos_sociais: MultiOption[];
  tags: (MultiOption & { cor?: string | null })[];
  segmentos: { value: string; label: string; tipo: string }[];
  campanhas: { value: string; label: string; status: string }[];
  mensagens: { value: string; label: string; kind: string }[];
  importacoes: MultiOption[];
};

const PHONE_STATUS: MultiOption[] = [
  { value: "valido", label: "Válido" },
  { value: "precisa_revisao", label: "Precisa revisão" },
  { value: "invalido", label: "Inválido" },
  { value: "sem_ddd", label: "Sem DDD" },
  { value: "sem_nono_digito", label: "Sem 9º dígito" },
  { value: "duplicado_possivel", label: "Duplicado possível" },
];
const WPP_STATUS: MultiOption[] = [
  { value: "desconhecido", label: "Desconhecido" },
  { value: "confirmado", label: "Confirmado" },
  { value: "invalido", label: "Inválido" },
  { value: "erro_envio", label: "Erro de envio" },
  { value: "opt_out", label: "Opt-out" },
];
const LIFECYCLE: MultiOption[] = [
  { value: "importado_aguardando_recadastro", label: "Importado (aguardando atualização)" },
  { value: "link_enviado", label: "Link enviado" },
  { value: "recadastro_iniciado", label: "Atualização iniciada" },
  { value: "recadastro_concluido", label: "Atualização concluída" },
  { value: "nao_respondeu", label: "Não respondeu" },
  { value: "telefone_invalido", label: "Telefone inválido" },
  { value: "precisa_revisao", label: "Ciclo: precisa revisão (manual)" },
  { value: "duplicado_possivel", label: "Ciclo: duplicado possível (manual)" },
  { value: "duplicado_mesclado", label: "Duplicado mesclado" },
  { value: "nao_enviar", label: "Não enviar (bloqueado)" },
];
const ORIGEM: MultiOption[] = [
  { value: "recadastro", label: "Atualização" },
  { value: "inscricao", label: "Inscrição" },
  { value: "import", label: "Importação" },
  { value: "manual", label: "Manual" },
];
const TIPO_CONTATO: MultiOption[] = [
  { value: "apoiador", label: "Apoiador" },
  { value: "voluntario", label: "Voluntário" },
  { value: "lista_divulgacao", label: "Lista de divulgação" },
  { value: "importado", label: "Importado" },
  { value: "outro", label: "Outro" },
];

const SIM_NAO: MultiOption[] = [
  { value: "sim", label: "Sim" },
  { value: "nao", label: "Não" },
];

const SYSTEM_ROLES: MultiOption[] = [
  { value: "admin", label: "Admin" },
  { value: "operador", label: "Operador" },
  { value: "vrm", label: "VRM" },
  { value: "comunicacao", label: "Comunicação" },
  { value: "agitador", label: "Agitador" },
  { value: "leitor", label: "Leitor" },
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

type Props = {
  filters: CrmFilters;
  onChange: (f: CrmFilters) => void;
  options: FilterOptionsBundle | undefined;
};

export function ContactFiltersPanel({ filters, onChange, options }: Props) {
  const set = <K extends keyof CrmFilters>(k: K, v: CrmFilters[K]) => {
    const next = { ...filters, [k]: v } as CrmFilters;
    if (v === undefined || (Array.isArray(v) && v.length === 0) || v === "") {
      delete (next as Record<string, unknown>)[k as string];
    }
    onChange(next);
  };

  const opts = options ?? {
    cidades: [], bairros: [], ufs: [], profissoes: [], tipos_contato: [],
    origens: [], origem_detalhes: [], formas_ajuda: [], movimentos_sociais: [],
    tags: [], segmentos: [], campanhas: [], mensagens: [], importacoes: [],
  };

  const systemUsersFn = useServerFn(listSystemUserOptions);
  const systemUsersQ = useQuery({
    queryKey: ["system-user-options"],
    queryFn: () => systemUsersFn(),
    staleTime: 5 * 60_000,
  });
  const systemUserOptions = useMemo<MultiOption[]>(() => {
    const arr = (systemUsersQ.data?.users ?? []).map((u) => ({
      value: u.id,
      label: u.full_name && u.full_name.trim().length > 0 ? u.full_name : u.email || u.id,
    }));
    arr.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    return arr;
  }, [systemUsersQ.data]);


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
        <Field label="Tags">
          <MultiSelectFilter options={opts.tags} value={filters.tag_ids ?? []} onChange={(v) => set("tag_ids", v)} placeholder="Todas as tags" />
        </Field>
      </Section>

      <Section icon={<MapPin className="h-4 w-4" />} title="Localização">
        <Field label="UF">
          <MultiSelectFilter options={opts.ufs} value={filters.ufs ?? []} onChange={(v) => set("ufs", v)} placeholder="Qualquer UF" />
        </Field>
        <Field label="Cidade">
          <MultiSelectFilter options={opts.cidades} value={filters.cidades ?? []} onChange={(v) => set("cidades", v)} placeholder="Qualquer cidade" />
        </Field>
        <Field label="Bairro" hint={filters.cidades?.length ? "Mostrando só bairros da(s) cidade(s) selecionada(s)." : undefined}>
          <MultiSelectFilter options={opts.bairros} value={filters.bairros ?? []} onChange={(v) => set("bairros", v)} placeholder="Qualquer bairro" />
        </Field>
      </Section>

      <Section icon={<User className="h-4 w-4" />} title="Perfil">
        <Field label="Tipo de contato">
          <MultiSelectFilter options={mergeLabels(opts.tipos_contato, TIPO_CONTATO)} value={filters.tipos_contato ?? []} onChange={(v) => set("tipos_contato", v)} placeholder="Qualquer tipo" />
        </Field>
        <Field label="Profissão contém…" hint="Busca livre no campo profissão">
          <Input value={filters.profissao ?? ""} onChange={(e) => set("profissao", e.target.value || undefined)} placeholder="Ex.: professor" />
        </Field>
        <Field label="Coletivo Alicerce">
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
        <Field label="Movimento contém…" hint="Busca livre no nome do movimento">
          <Input value={filters.movimento_social_contains ?? ""} onChange={(e) => set("movimento_social_contains", e.target.value || undefined)} placeholder="Ex.: MST" />
        </Field>
      </Section>

      <Section icon={<Users className="h-4 w-4" />} title="Participação">
        <Field label="Formas de ajuda">
          <MultiSelectFilter options={opts.formas_ajuda} value={filters.formas_ajuda ?? []} onChange={(v) => set("formas_ajuda", v)} placeholder="Todas as formas" />
        </Field>
        <Field label="Origem do contato">
          <MultiSelectFilter options={mergeLabels(opts.origens, ORIGEM)} value={filters.origens ?? []} onChange={(v) => set("origens", v)} placeholder="Todas as origens" />
        </Field>
        <Field label="Detalhe de origem">
          <MultiSelectFilter options={opts.origem_detalhes} value={filters.origem_detalhes ?? []} onChange={(v) => set("origem_detalhes", v)} placeholder="Todos os detalhes" />
        </Field>
      </Section>


      <Section icon={<MessageCircle className="h-4 w-4" />} title="Comunicação">
        <Field label="E-mail contém…" hint="Busca livre no campo e-mail">
          <Input value={filters.email_contains ?? ""} onChange={(e) => set("email_contains", e.target.value || undefined)} placeholder="Ex.: gmail.com" />
        </Field>
        <Field label="Tem e-mail secundário">
          <SingleSelectFilter options={SIM_NAO} value={filters.tem_email_secundario} onChange={(v) => set("tem_email_secundario", v as "sim" | "nao" | undefined)} placeholder="Qualquer" />
        </Field>
        <Field label="Tem telefone secundário">
          <SingleSelectFilter options={SIM_NAO} value={filters.tem_phone_secundario} onChange={(v) => set("tem_phone_secundario", v as "sim" | "nao" | undefined)} placeholder="Qualquer" />
        </Field>
        <Field label="Consentimento WhatsApp">
          <SingleSelectFilter options={SIM_NAO} value={filters.consent} onChange={(v) => set("consent", v as "sim" | "nao" | undefined)} placeholder="Qualquer" />
        </Field>
        <Field label="Opt-out (não quer receber)">
          <SingleSelectFilter options={SIM_NAO} value={filters.optOut} onChange={(v) => set("optOut", v as "sim" | "nao" | undefined)} placeholder="Qualquer" />
        </Field>
        <Field label="Bloqueado para envio">
          <SingleSelectFilter options={SIM_NAO} value={filters.bloqueado} onChange={(v) => set("bloqueado", v as "sim" | "nao" | undefined)} placeholder="Qualquer" />
        </Field>
        <Field label="Status do telefone">
          <MultiSelectFilter options={PHONE_STATUS} value={filters.phone_statuses ?? []} onChange={(v) => set("phone_statuses", v)} placeholder="Qualquer status" />
        </Field>
        <Field label="Status do WhatsApp" hint="⚠️ Ainda não é atualizado automaticamente pelo sistema — não use para decisões por enquanto.">
          <MultiSelectFilter options={WPP_STATUS} value={filters.whatsapp_statuses ?? []} onChange={(v) => set("whatsapp_statuses", v)} placeholder="Qualquer status" />
        </Field>
        <Field label="Ciclo de vida" hint="Status atribuído manualmente ou por importação. Diferente do 'Status do telefone', que é calculado automaticamente a partir do número.">

          <MultiSelectFilter options={LIFECYCLE} value={filters.lifecycle_statuses ?? []} onChange={(v) => set("lifecycle_statuses", v)} placeholder="Qualquer" />
        </Field>
      </Section>

      <Section icon={<History className="h-4 w-4" />} title="Histórico de mensagens">
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
      </Section>

      <Section icon={<Zap className="h-4 w-4" />} title="Origem e captação">
        <Field label="Módulo de origem">
          <MultiSelectFilter
            options={[
              { value: "gestao_base", label: "Gestão da Base" },
              { value: "territorio", label: "Território" },
              { value: "agitacao", label: "Agitação" },
              { value: "mapa", label: "Mapa" },
              { value: "inbox", label: "Inbox" },
              { value: "ficha_contato", label: "Ficha do contato" },
              { value: "relacionamento", label: "Relacionamento" },
              { value: "link_publico", label: "Links públicos" },
            ]}
            value={filters.source_modules ?? []}
            onChange={(v) => set("source_modules", v)}
            placeholder="Qualquer módulo"
          />
        </Field>
        <Field label="Tipo de formulário">
          <MultiSelectFilter
            options={[
              { value: "cadastro_completo", label: "Cadastro completo" },
              { value: "receber_informacoes", label: "Receber informações" },
            ]}
            value={filters.source_form_types ?? []}
            onChange={(v) => set("source_form_types", v)}
            placeholder="Qualquer tipo"
          />
        </Field>
        <Field label="Sem origem rastreada">
          <SingleSelectFilter
            options={SIM_NAO}
            value={filters.sem_origem_rastreada === undefined ? undefined : filters.sem_origem_rastreada ? "sim" : "nao"}
            onChange={(v) => set("sem_origem_rastreada", v === undefined ? undefined : v === "sim")}
            placeholder="Qualquer"
          />
        </Field>
        <Field label="Captado desde">
          <Input type="date" value={filters.captado_desde ?? ""} onChange={(e) => set("captado_desde", e.target.value || undefined)} />
        </Field>
        <Field label="Captado até">
          <Input type="date" value={filters.captado_ate ?? ""} onChange={(e) => set("captado_ate", e.target.value || undefined)} />
        </Field>
        <Field label="ID do captador (UUID)" hint="Cole o ID do usuário para filtrar quem captou">
          <Input value={filters.source_user_id ?? ""} onChange={(e) => set("source_user_id", e.target.value || undefined)} placeholder="uuid do usuário" />
        </Field>
      </Section>

      <Section icon={<FileUp className="h-4 w-4" />} title="Importação">
        <Field label="Lote(s) de importação">
          <MultiSelectFilter options={opts.importacoes} value={filters.import_ids ?? []} onChange={(v) => set("import_ids", v)} placeholder="Qualquer lote" />
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
