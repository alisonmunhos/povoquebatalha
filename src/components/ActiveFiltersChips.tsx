import { X } from "lucide-react";
import type { CrmFilters } from "@/lib/crm-filters";
import type { FilterOptionsBundle } from "@/components/ContactFiltersPanel";
import { LIFECYCLE_LABEL, PHONE_STATUS_LABEL, WHATSAPP_STATUS_LABEL } from "@/lib/phone-labels";

type Chip = { key: string; label: string; onRemove: () => void };


export function ActiveFiltersChips({
  filters,
  onChange,
  options,
}: {
  filters: CrmFilters;
  onChange: (f: CrmFilters) => void;
  options: FilterOptionsBundle | undefined;
}) {
  const chips: Chip[] = [];
  const remove = <K extends keyof CrmFilters>(k: K) => () => {
    const next = { ...filters };
    delete (next as Record<string, unknown>)[k as string];
    onChange(next);
  };
  const removeFromArr = <K extends keyof CrmFilters>(k: K, v: string) => () => {
    const cur = (filters[k] as unknown as string[]) ?? [];
    const arr = cur.filter((x) => x !== v);
    const next = { ...filters, [k]: arr } as CrmFilters;
    if (arr.length === 0) delete (next as Record<string, unknown>)[k as string];
    onChange(next);
  };

  const findLabel = (list: { value: string; label: string }[] | undefined, v: string) =>
    list?.find((o) => o.value === v)?.label ?? v;

  // Search
  if (filters.search) chips.push({ key: "search", label: `Busca: “${filters.search}”`, onRemove: remove("search") });

  // Localização
  for (const v of filters.ufs ?? []) chips.push({ key: `uf-${v}`, label: `UF: ${v}`, onRemove: removeFromArr("ufs", v) });
  for (const v of filters.cidades ?? []) chips.push({ key: `cid-${v}`, label: `Cidade: ${v}`, onRemove: removeFromArr("cidades", v) });
  for (const v of filters.bairros ?? []) chips.push({ key: `bai-${v}`, label: `Bairro: ${v}`, onRemove: removeFromArr("bairros", v) });

  // Perfil
  for (const v of filters.tipos_contato ?? []) chips.push({ key: `tc-${v}`, label: `Tipo: ${v}`, onRemove: removeFromArr("tipos_contato", v) });
  for (const v of filters.profissoes ?? []) chips.push({ key: `pf-${v}`, label: `Profissão: ${v}`, onRemove: removeFromArr("profissoes", v) });
  if (filters.profissao) chips.push({ key: "pf-txt", label: `Profissão contém: ${filters.profissao}`, onRemove: remove("profissao") });
  if (typeof filters.coletivo_alicerce === "boolean")
    chips.push({ key: "col", label: `Coletivo Alicerce: ${filters.coletivo_alicerce ? "sim" : "não"}`, onRemove: remove("coletivo_alicerce") });
  if (typeof filters.participa_movimento_social === "boolean")
    chips.push({ key: "pms", label: `Movimento social: ${filters.participa_movimento_social ? "sim" : "não"}`, onRemove: remove("participa_movimento_social") });
  for (const v of filters.movimentos_sociais ?? []) chips.push({ key: `ms-${v}`, label: `Movimento: ${v}`, onRemove: removeFromArr("movimentos_sociais", v) });
  if (filters.movimento_social_contains)
    chips.push({ key: "ms-txt", label: `Movimento contém: ${filters.movimento_social_contains}`, onRemove: remove("movimento_social_contains") });

  // Participação
  for (const v of filters.formas_ajuda ?? []) chips.push({ key: `fa-${v}`, label: `Ajuda: ${v}`, onRemove: removeFromArr("formas_ajuda", v) });
  for (const v of filters.origens ?? []) chips.push({ key: `or-${v}`, label: `Origem: ${v}`, onRemove: removeFromArr("origens", v) });
  for (const v of filters.origem_detalhes ?? []) chips.push({ key: `od-${v}`, label: `Detalhe: ${v}`, onRemove: removeFromArr("origem_detalhes", v) });
  for (const id of filters.tag_ids ?? []) chips.push({ key: `tag-${id}`, label: `Tag: ${findLabel(options?.tags, id)}`, onRemove: removeFromArr("tag_ids", id) });

  // Comunicação
  if (filters.consent) chips.push({ key: "cs", label: `Consentimento: ${filters.consent}`, onRemove: remove("consent") });
  if (filters.optOut) chips.push({ key: "oo", label: `Opt-out: ${filters.optOut}`, onRemove: remove("optOut") });
  if (filters.bloqueado) chips.push({ key: "bl", label: `Bloqueado: ${filters.bloqueado}`, onRemove: remove("bloqueado") });
  for (const v of filters.phone_statuses ?? []) chips.push({ key: `ps-${v}`, label: `Número: ${PHONE_STATUS_LABEL[v] ?? v}`, onRemove: removeFromArr("phone_statuses", v) });
  for (const v of filters.whatsapp_statuses ?? []) chips.push({ key: `ws-${v}`, label: `WhatsApp: ${WHATSAPP_STATUS_LABEL[v] ?? v}`, onRemove: removeFromArr("whatsapp_statuses", v) });
  for (const v of filters.lifecycle_statuses ?? []) chips.push({ key: `ls-${v}`, label: `Status: ${LIFECYCLE_LABEL[v] ?? v}`, onRemove: removeFromArr("lifecycle_statuses", v) });
  if (filters.archived && filters.archived !== "nao")
    chips.push({ key: "ar", label: `Arquivados: ${filters.archived}`, onRemove: () => onChange({ ...filters, archived: "nao" }) });

  // Histórico
  if (filters.recebeu_campanha_id)
    chips.push({ key: "rc", label: `Recebeu: ${findLabel(options?.campanhas, filters.recebeu_campanha_id)}`, onRemove: remove("recebeu_campanha_id") });
  if (filters.nao_recebeu_campanha_id)
    chips.push({ key: "nrc", label: `Não recebeu: ${findLabel(options?.campanhas, filters.nao_recebeu_campanha_id)}`, onRemove: remove("nao_recebeu_campanha_id") });
  if (filters.erro_campanha_id)
    chips.push({ key: "ec", label: `Erro em: ${findLabel(options?.campanhas, filters.erro_campanha_id)}`, onRemove: remove("erro_campanha_id") });
  if (filters.recebeu_template_id)
    chips.push({ key: "rt", label: `Recebeu msg: ${findLabel(options?.mensagens, filters.recebeu_template_id)}`, onRemove: remove("recebeu_template_id") });
  if (filters.nao_recebeu_template_id)
    chips.push({ key: "nrt", label: `Não recebeu msg: ${findLabel(options?.mensagens, filters.nao_recebeu_template_id)}`, onRemove: remove("nao_recebeu_template_id") });

  // Importação
  for (const v of filters.import_ids ?? [])
    chips.push({ key: `imp-${v}`, label: `Lote: ${findLabel(options?.importacoes, v)}`, onRemove: removeFromArr("import_ids", v) });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-secondary text-secondary-foreground border">
          {c.label}
          <button type="button" onClick={c.onRemove} aria-label="Remover" className="hover:text-foreground/70">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
