import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { listContactsRich, idsByFilter, bulkApplyTag, bulkArchive, bulkOptOut, bulkSetLifecycle, exportContactsCsv } from "@/lib/crm-bulk.functions";
import { getContactFilterOptions } from "@/lib/crm-filter-options.functions";
import { upsertSegment, listSegments } from "@/lib/segments.functions";
import { setOptOut, archiveContact, deleteContactsBulk, createTag } from "@/lib/contacts.functions";
import { checkWhatsappForContacts, contactsQuickCounts, contactsStatusFacets } from "@/lib/contacts-phone.functions";
import { formatPhoneBR } from "@/lib/phone";
import { LIFECYCLE_LABEL, PHONE_STATUS_LABEL, PHONE_STATUS_BADGE } from "@/lib/phone-labels";
import { PhoneReviewDialog } from "@/components/PhoneReviewDialog";
import { Users, Search, UserMinus, UserCheck, Pencil, Copy, MessageCircle, Archive, ArchiveRestore, Filter, Download, Tag as TagIcon, Save, Info, Send, Trash2, PhoneCall, CheckCircle2 } from "lucide-react";
import { ConfirmDeleteContactDialog } from "@/components/ConfirmDeleteContactDialog";
import { useCurrentUserRole } from "@/hooks/use-current-role";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { SendWhatsAppWizard } from "@/components/SendWhatsAppWizard";
import { ContactFiltersPanel, type FilterOptionsBundle } from "@/components/ContactFiltersPanel";
import { ActiveFiltersChips } from "@/components/ActiveFiltersChips";
import { ColumnFilterHeader, ColumnSortHeader, type ColumnFilterOption } from "@/components/ColumnFilterHeader";
import type { CrmFilters } from "@/lib/crm-filters";

const searchSchema = z.object({ segment: z.string().uuid().optional() }).partial();

export const Route = createFileRoute("/_authenticated/contatos/")({
  head: () => ({ meta: [{ title: "Contatos" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: Contatos,
});

const LIFECYCLE = ["importado_aguardando_recadastro","link_enviado","recadastro_iniciado","recadastro_concluido","nao_respondeu","telefone_invalido","precisa_revisao","duplicado_possivel","duplicado_mesclado","nao_enviar"] as const;

function Contatos() {
  const search = Route.useSearch();
  const listFn = useServerFn(listContactsRich);
  const idsFn = useServerFn(idsByFilter);
  const optionsFn = useServerFn(getContactFilterOptions);
  const segFn = useServerFn(listSegments);
  const saveSegFn = useServerFn(upsertSegment);
  const tagBulkFn = useServerFn(bulkApplyTag);
  const archBulkFn = useServerFn(bulkArchive);
  const optBulkFn = useServerFn(bulkOptOut);
  const lifecycleBulkFn = useServerFn(bulkSetLifecycle);
  const exportFn = useServerFn(exportContactsCsv);
  const optFn = useServerFn(setOptOut);
  const archFn = useServerFn(archiveContact);
  const deleteBulkFn = useServerFn(deleteContactsBulk);
  const createTagFn = useServerFn(createTag);
  const checkWppFn = useServerFn(checkWhatsappForContacts);
  const quickCountsFn = useServerFn(contactsQuickCounts);
  const facetsFn = useServerFn(contactsStatusFacets);

  const role = useCurrentUserRole();
  const isAdmin = role === "admin";
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Default: mostra todos os contatos (ativos + arquivados) para não "sumir" registros mesclados/arquivados
  const [filters, setFilters] = useState<CrmFilters>({ archived: "todos" });
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  // Ordenação: nome A→Z é o padrão pedido; ciclo asc → desc → recent
  const [sort, setSort] = useState<"name" | "name-desc" | "recent">("name");
  const pageSize = 25;
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTagId, setBulkTagId] = useState<string>("");
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [bulkLifecycle, setBulkLifecycle] = useState<string>("");

  const [saveDlg, setSaveDlg] = useState<{ open: boolean; nome: string; descricao: string; tipo: "dinamico" | "estatico" }>({ open: false, nome: "", descricao: "", tipo: "dinamico" });
  const [sendDlg, setSendDlg] = useState<{ open: boolean; mode: "selection" | "filter" }>({ open: false, mode: "selection" });

  // Opções dinâmicas dos filtros — bairros dependem da(s) cidade(s) selecionada(s)
  const cidadesSelecionadas = useMemo(() => filters.cidades ?? [], [filters.cidades]);
  const optionsQ = useQuery({
    queryKey: ["contact-filter-options", cidadesSelecionadas],
    queryFn: () => optionsFn({ data: { cidades: cidadesSelecionadas } }),
    staleTime: 5 * 60_000,
  });
  const filterOptions = optionsQ.data as unknown as FilterOptionsBundle | undefined;

  // Debounce da busca geral
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => {
        const s = searchInput.trim();
        const next = { ...f };
        if (s) next.search = s;
        else delete next.search;
        return next;
      });
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Aplica segmento via querystring
  useEffect(() => {
    if (!search.segment) return;
    segFn().then((r) => {
      const s = r.rows.find((x) => x.id === search.segment);
      if (s?.tipo === "dinamico") setFilters((s.filtro as CrmFilters) ?? { archived: "nao" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.segment]);

  const q = useQuery({
    queryKey: ["contacts-rich", filters, page, sort],
    queryFn: () => listFn({ data: { filters, page, pageSize, sort } }),
  });

  const allOnPage = useMemo(() => (q.data?.rows ?? []).map((r) => r.id), [q.data]);
  const allChecked = allOnPage.length > 0 && allOnPage.every((id) => selected.has(id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  function togglePage() {
    const next = new Set(selected);
    if (allChecked) allOnPage.forEach((id) => next.delete(id));
    else allOnPage.forEach((id) => next.add(id));
    setSelected(next);
  }
  async function selectAllFiltered() {
    const r = await idsFn({ data: { filters, max: 5000 } });
    setSelected(new Set(r.ids));
    toast.success(`${r.ids.length} contato(s) selecionados`);
  }
  function clearSel() { setSelected(new Set()); }

  async function doBulkTag(add: boolean) {
    if (!bulkTagId) return toast.error("Escolha uma tag");
    if (!selected.size) return;
    if (!add && !confirm(`Remover esta tag de ${selected.size} contato(s)?`)) return;
    await tagBulkFn({ data: { ids: [...selected], tag_id: bulkTagId, add } });
    toast.success(`${selected.size} contato(s) atualizados`);
    q.refetch();
  }
  async function doCreateTag() {
    const nome = newTagName.trim();
    if (!nome) return toast.error("Digite um nome para a tag");
    try {
      const row = await createTagFn({ data: { nome } });
      await optionsQ.refetch();
      setBulkTagId(row.id);
      setNewTagName("");
      setCreatingTag(false);
      toast.success(`Tag "${row.nome}" criada — pronta para aplicar`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar tag");
    }
  }

  async function doBulkArchive(archived: boolean) {
    if (!selected.size) return;
    if (archived && !confirm(`Arquivar ${selected.size} contato(s)?\n\nEles deixam de aparecer na listagem padrão, mas o histórico é preservado.`)) return;
    await archBulkFn({ data: { ids: [...selected], archived } });
    toast.success("Aplicado"); clearSel(); q.refetch();
  }
  async function doBulkOptOut(optOut: boolean) {
    if (!selected.size) return;
    if (optOut && !confirm(`Marcar ${selected.size} contato(s) como "Não enviar"?\n\nEles não receberão mais mensagens de campanha.`)) return;
    await optBulkFn({ data: { ids: [...selected], optOut } });
    toast.success("Aplicado"); q.refetch();
  }
  async function doBulkLifecycle() {
    if (!bulkLifecycle || !selected.size) return;
    if (!confirm(`Alterar o status de ${selected.size} contato(s) para "${bulkLifecycle}"?`)) return;
    await lifecycleBulkFn({ data: { ids: [...selected], lifecycle_status: bulkLifecycle } });
    toast.success("Status atualizado"); q.refetch();
  }
  async function doExport(mode: "selecionados" | "filtrados") {
    let ids: string[] = [];
    if (mode === "selecionados") ids = [...selected];
    else ids = (await idsFn({ data: { filters, max: 10000 } })).ids;
    if (!ids.length) return toast.error("Nada para exportar");
    const r = await exportFn({ data: { ids } });
    const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `contatos_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${r.count} contato(s) exportados`);
  }
  async function doSaveSegment() {
    if (!saveDlg.nome.trim()) return toast.error("Nome obrigatório");
    await saveSegFn({ data: {
      nome: saveDlg.nome.trim(), descricao: saveDlg.descricao.trim() || null,
      tipo: saveDlg.tipo, filtro: filters,
      member_ids: saveDlg.tipo === "estatico" ? [...selected] : [],
    } });
    toast.success("Segmento salvo");
    setSaveDlg({ open: false, nome: "", descricao: "", tipo: "dinamico" });
  }

  function clearAllFilters() {
    setFilters({ archived: "nao" });
    setSearchInput("");
    setPage(1);
  }

  const countsQ = useQuery({
    queryKey: ["contacts-quick-counts"],
    queryFn: () => quickCountsFn(),
    staleTime: 30_000,
  });
  const facetsQ = useQuery({
    queryKey: ["contacts-status-facets"],
    queryFn: () => facetsFn(),
    staleTime: 30_000,
  });

  function applyQuickFilter(patch: Partial<CrmFilters>) {
    setFilters((f) => ({ archived: "nao", ...patch }));
    setPage(1);
  }

  async function doBulkCheckWhatsapp() {
    if (!selected.size) return;
    if (!confirm(`Consultar Z-API para ${selected.size} número(s)?\n\nCada número consome 1 chamada da sua conta Z-API.`)) return;
    try {
      const r = await checkWppFn({ data: { contact_ids: [...selected] } });
      toast.success(`WhatsApp: ${r.confirmed} confirmado(s) · ${r.invalid} sem WhatsApp · ${r.skipped} ignorados`);
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao verificar WhatsApp");
    }
  }


  const activeCount =
    Object.entries(filters).filter(([k, v]) => {
      if (k === "archived") return v && v !== "nao";
      if (Array.isArray(v)) return v.length > 0;
      return v !== undefined && v !== null && v !== "";
    }).length;

  // Opções para filtros no cabeçalho — reusa o bundle já carregado em filterOptions.
  const cidadesOpts: ColumnFilterOption[] = (filterOptions?.cidades ?? []).map((o) => ({ value: o.value, label: o.label, count: o.count }));
  // Bairros: se houver cidades selecionadas, filtra bairros por elas seria ideal, mas o bundle
  // é global; mantemos todos e a busca interna resolve o resto.
  const bairrosOpts: ColumnFilterOption[] = (filterOptions?.bairros ?? []).map((o) => ({ value: o.value, label: o.label, count: o.count }));
  const tagsOpts: ColumnFilterOption[] = (filterOptions?.tags ?? []).map((t) => ({
    value: t.value,
    label: t.label,
    count: t.count,
    color: (t as { cor?: string | null }).cor ?? null,
  }));
  // Coluna "Cadastro" — filtra lifecycle_status. Contagens vêm dos facets do banco;
  // opções com count=0 aparecem cinzas para o usuário entender que aquele estado não existe hoje.
  const lifecycleFacet = facetsQ.data?.lifecycle ?? {};
  const cadastroOpts: ColumnFilterOption[] = LIFECYCLE.map((v) => ({
    value: v,
    label: LIFECYCLE_LABEL[v] ?? v,
    count: lifecycleFacet[v] ?? 0,
  })).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  // Coluna "Número" — filtra phone_status. Mesma lógica de contagem.
  const phoneFacet = facetsQ.data?.phone ?? {};
  const PHONE_ORDER = ["valido", "precisa_revisao", "sem_ddd", "sem_nono_digito", "invalido", "duplicado_possivel"];
  const numeroOpts: ColumnFilterOption[] = PHONE_ORDER.map((v) => ({
    value: v,
    label: PHONE_STATUS_LABEL[v] ?? v,
    count: phoneFacet[v] ?? 0,
  }));

  const nameSortState = sort === "name" ? "asc" : sort === "name-desc" ? "desc" : "none";
  function cycleNameSort() {
    setSort((s) => (s === "name" ? "name-desc" : s === "name-desc" ? "recent" : "name"));
    setPage(1);
  }
  function setListFilter(key: "cidades" | "bairros" | "tag_ids" | "lifecycle_statuses", values: string[]) {
    setFilters((f) => {
      const next = { ...f } as CrmFilters;
      if (values.length === 0) delete (next as Record<string, unknown>)[key];
      else (next as Record<string, unknown>)[key] = values;
      return next;
    });
    setPage(1);
  }



  return (
    <TooltipProvider delayDuration={150}>
    <div className="p-6 md:p-10 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Contatos</h1>
        </div>
        <div className="text-sm text-muted-foreground">{q.data?.total ?? 0} resultado(s)</div>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5" />
        Use os filtros para encontrar um público. Depois você pode salvar como segmento ou enviar WhatsApp para todos os contatos filtrados aptos.
      </p>

      {/* Busca + toggle filtros + ações principais */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar em nome, telefone, e-mail, profissão, observações, bairro, cidade, origem, movimento…"
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
          <Filter className="h-4 w-4 mr-1" /> Filtros{activeCount > 0 && ` (${activeCount})`}
        </Button>
        <Button variant="outline" size="sm" onClick={() => doExport("filtrados")}><Download className="h-4 w-4 mr-1" /> Exportar filtrados</Button>
        <Button variant="outline" size="sm" onClick={() => setSaveDlg({ ...saveDlg, open: true, tipo: "dinamico" })}><Save className="h-4 w-4 mr-1" /> Salvar como segmento</Button>
        <Button size="sm" onClick={() => setSendDlg({ open: true, mode: "filter" })}><Send className="h-4 w-4 mr-1" /> Enviar WhatsApp p/ filtro</Button>
      </div>

      {/* Filtros rápidos por chip */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Atalhos:</span>
        <QuickChip label="Cadastro completo" active={filters.lifecycle_statuses?.[0] === "recadastro_concluido" && filters.lifecycle_statuses.length === 1} count={countsQ.data?.cadastroCompleto}
          onClick={() => applyQuickFilter({ lifecycle_statuses: ["recadastro_concluido"] })} />
        <QuickChip label="Só importados" active={filters.lifecycle_statuses?.[0] === "importado_aguardando_recadastro" && filters.lifecycle_statuses.length === 1} count={countsQ.data?.soImportados}
          onClick={() => applyQuickFilter({ lifecycle_statuses: ["importado_aguardando_recadastro"] })} />
        <QuickChip label="Números OK" count={countsQ.data?.numeroOk}
          active={filters.phone_statuses?.length === 1 && filters.phone_statuses[0] === "valido"}
          onClick={() => applyQuickFilter({ phone_statuses: ["valido"] })} />
        <QuickChip label="Falta DDD" count={countsQ.data?.precisaRevisao}
          active={!!filters.phone_statuses?.some((s) => ["precisa_revisao","sem_ddd","sem_nono_digito"].includes(s))}
          onClick={() => applyQuickFilter({ phone_statuses: ["precisa_revisao","sem_ddd","sem_nono_digito"] })} />
        <QuickChip label="Bloqueados" count={countsQ.data?.bloqueados} active={filters.bloqueado === "sim"}
          onClick={() => applyQuickFilter({ bloqueado: "sim" })} />
        <Button size="sm" variant="outline" onClick={() => setReviewOpen(true)}>
          <PhoneCall className="h-3.5 w-3.5 mr-1" /> Revisar telefones
        </Button>
      </div>

      {activeCount > 0 && (
        <div className="flex items-start gap-3 flex-wrap">
          <ActiveFiltersChips filters={filters} onChange={(f) => { setFilters(f); setPage(1); }} options={filterOptions} />
          <Button size="sm" variant="ghost" onClick={clearAllFilters}>Limpar filtros</Button>
        </div>
      )}

      {showFilters && (
        <ContactFiltersPanel
          filters={filters}
          onChange={(f) => { setFilters(f); setPage(1); }}
          options={filterOptions}
        />
      )}


      {/* Barra de ações em massa */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 border rounded-xl bg-primary text-primary-foreground px-4 py-3 shadow space-y-2">
          {/* Grupo: Seleção */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs uppercase tracking-wide opacity-70">Seleção</span>
            <span className="text-sm font-medium">{selected.size} selecionado(s)</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={selectAllFiltered} className="text-xs underline">Selecionar todos do filtro</button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">Isso selecionará todos os contatos que correspondem aos filtros atuais, não apenas os visíveis nesta página.</TooltipContent>
            </Tooltip>
            <button onClick={clearSel} className="text-xs underline">Limpar seleção</button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-primary-foreground/20 pt-2">
            {/* Tags */}
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide opacity-70">Tags</span>
              {creatingTag ? (
                <>
                  <Input
                    autoFocus
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); doCreateTag(); }
                      if (e.key === "Escape") { setCreatingTag(false); setNewTagName(""); }
                    }}
                    placeholder="Nome da nova tag"
                    className="h-8 w-40 text-xs text-foreground"
                  />
                  <Button size="sm" variant="secondary" onClick={doCreateTag}>Criar</Button>
                  <Button size="sm" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => { setCreatingTag(false); setNewTagName(""); }}>Cancelar</Button>
                </>
              ) : (
                <>
                  <select
                    value={bulkTagId}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__new__") { setCreatingTag(true); return; }
                      setBulkTagId(v);
                    }}
                    className="text-xs h-8 rounded-md text-foreground px-2"
                  >
                    <option value="">— escolher tag —</option>
                    <option value="__new__">+ Criar nova tag…</option>
                    {(filterOptions?.tags ?? []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <Button size="sm" variant="secondary" onClick={() => doBulkTag(true)}><TagIcon className="h-3 w-3 mr-1" /> Aplicar tag</Button>
                  <Button size="sm" variant="secondary" onClick={() => doBulkTag(false)}>Remover tag</Button>
                </>
              )}
            </div>


            <div className="h-6 w-px bg-primary-foreground/30" />

            {/* Status */}
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide opacity-70">Status</span>
              <select value={bulkLifecycle} onChange={(e) => setBulkLifecycle(e.target.value)} className="text-xs h-8 rounded-md text-foreground px-2">
                <option value="">— escolher status —</option>
                {LIFECYCLE.map((l) => <option key={l} value={l}>{LIFECYCLE_LABEL[l] ?? l}</option>)}
              </select>
              <Button size="sm" variant="secondary" onClick={doBulkLifecycle}>Aplicar status</Button>
            </div>

            <div className="h-6 w-px bg-primary-foreground/30" />

            {/* Ações */}
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide opacity-70">Ações</span>
              <Button size="sm" variant="secondary" onClick={doBulkCheckWhatsapp} title="Consulta Z-API para confirmar quais números têm WhatsApp">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Verificar no WhatsApp
              </Button>
              <Button size="sm" variant="secondary" onClick={() => doBulkOptOut(true)}>Não enviar</Button>
              <Button size="sm" variant="secondary" onClick={() => doBulkOptOut(false)}>Reativar</Button>
              <Button size="sm" variant="secondary" onClick={() => doBulkArchive(true)}>Arquivar</Button>
              <Button size="sm" variant="secondary" onClick={() => doBulkArchive(false)}>Desarquivar</Button>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                  title="Excluir definitivamente (apenas admin)"
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Excluir
                </Button>
              )}
            </div>

            <div className="h-6 w-px bg-primary-foreground/30" />

            {/* Exportação/Segmento */}
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide opacity-70">Exportar</span>
              <Button size="sm" variant="secondary" onClick={() => doExport("selecionados")}><Download className="h-3 w-3 mr-1" /> CSV</Button>
              <Button size="sm" variant="secondary" onClick={() => setSaveDlg({ ...saveDlg, open: true, tipo: "estatico" })}>Criar segmento</Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSendDlg({ open: true, mode: "selection" })}
              >
                <Send className="h-3 w-3 mr-1" /> Enviar WhatsApp
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="border rounded-xl overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-3 w-8"><Checkbox checked={allChecked} onCheckedChange={togglePage} /></th>
              <th className="text-left px-3 py-3">
                <ColumnSortHeader label="Nome" state={nameSortState} onCycle={cycleNameSort} />
              </th>
              <th className="text-left px-3 py-3">WhatsApp</th>
              <th className="text-left px-3 py-3">
                <ColumnFilterHeader
                  label="Cidade"
                  options={cidadesOpts}
                  selected={filters.cidades ?? []}
                  onChange={(v) => setListFilter("cidades", v)}
                />
              </th>
              <th className="text-left px-3 py-3">
                <ColumnFilterHeader
                  label="Bairro"
                  options={bairrosOpts}
                  selected={filters.bairros ?? []}
                  onChange={(v) => setListFilter("bairros", v)}
                />
              </th>
              <th className="text-left px-3 py-3">
                <ColumnFilterHeader
                  label="Tags"
                  options={tagsOpts}
                  selected={filters.tag_ids ?? []}
                  onChange={(v) => setListFilter("tag_ids", v)}
                />
              </th>
              <th className="text-left px-3 py-3">
                <ColumnFilterHeader
                  label="Status"
                  options={statusOpts}
                  selected={filters.lifecycle_statuses ?? []}
                  onChange={(v) => setListFilter("lifecycle_statuses", v)}
                  align="end"
                />
              </th>
              <th className="text-right px-3 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Carregando…</td></tr>}
            {q.data?.rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Nenhum contato encontrado.</td></tr>}
            {q.data?.rows.map((c) => {
              const digits = (c.phone_e164 ?? "").replace(/\D/g, "");
              return (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-3"><Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} /></td>
                  <td className="px-3 py-3 font-medium">
                    <Link to="/contatos/$id" params={{ id: c.id }} className="hover:underline">{c.nome}</Link>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-muted-foreground">{formatPhoneBR(c.phone_e164)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{c.cidade || "—"}</td>
                  <td className="px-3 py-3 text-muted-foreground">{c.bairro || "—"}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span key={t.id} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: `${t.cor}22`, color: t.cor, border: `1px solid ${t.cor}55` }}>{t.nome}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 space-x-1">
                    {c.arquivado_at && <span className="text-[10px] uppercase px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Arquivado</span>}
                    {c.opt_out_at && <span className="text-[10px] uppercase px-1.5 py-0.5 bg-red-100 text-red-700 rounded">Opt-out</span>}
                    {!c.opt_out_at && c.consentimento_whatsapp && <span className="text-[10px] uppercase px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">Ativo</span>}
                    {c.phone_status && c.phone_status !== "valido" && <span className={"text-[10px] uppercase px-1.5 py-0.5 rounded " + (PHONE_STATUS_BADGE[c.phone_status] ?? "bg-amber-100 text-amber-700")}>{PHONE_STATUS_LABEL[c.phone_status] ?? c.phone_status}</span>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Tooltip><TooltipTrigger asChild>
                        <Link to="/contatos/$id" params={{ id: c.id }} className="p-1.5 hover:bg-accent rounded inline-flex"><Pencil className="h-3.5 w-3.5" /></Link>
                      </TooltipTrigger><TooltipContent>Ver / Editar ficha</TooltipContent></Tooltip>
                      {digits && (
                        <>
                          <Tooltip><TooltipTrigger asChild>
                            <button onClick={() => { navigator.clipboard.writeText(c.phone_e164 ?? ""); toast.success("WhatsApp copiado"); }} className="p-1.5 hover:bg-accent rounded"><Copy className="h-3.5 w-3.5" /></button>
                          </TooltipTrigger><TooltipContent>Copiar número do WhatsApp</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger asChild>
                            <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-accent rounded text-emerald-600 inline-flex"><MessageCircle className="h-3.5 w-3.5" /></a>
                          </TooltipTrigger><TooltipContent>Abrir conversa no WhatsApp</TooltipContent></Tooltip>
                        </>
                      )}
                      <Tooltip><TooltipTrigger asChild>
                        <button onClick={async () => {
                          const target = !c.opt_out_at;
                          if (target && !confirm(`Marcar ${c.nome} como "Não enviar"?`)) return;
                          await optFn({ data: { id: c.id, optOut: target } }); q.refetch();
                        }} className="p-1.5 hover:bg-accent rounded">
                          {c.opt_out_at ? <UserCheck className="h-3.5 w-3.5" /> : <UserMinus className="h-3.5 w-3.5" />}
                        </button>
                      </TooltipTrigger><TooltipContent>{c.opt_out_at ? "Reativar envios" : "Marcar como não enviar"}</TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger asChild>
                        <button onClick={async () => {
                          const target = !c.arquivado_at;
                          if (target && !confirm(`Arquivar ${c.nome}? Ele deixa de aparecer na listagem padrão.`)) return;
                          await archFn({ data: { id: c.id, archived: target } }); q.refetch();
                        }} className="p-1.5 hover:bg-accent rounded">
                          {c.arquivado_at ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                        </button>
                      </TooltipTrigger><TooltipContent>{c.arquivado_at ? "Desarquivar" : "Arquivar contato"}</TooltipContent></Tooltip>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {q.data && q.data.total > pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Página {page} de {Math.ceil(q.data.total / pageSize)}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
            <Button size="sm" variant="outline" disabled={page >= Math.ceil(q.data.total / pageSize)} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}

      <Dialog open={saveDlg.open} onOpenChange={(o) => setSaveDlg({ ...saveDlg, open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Salvar como segmento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={saveDlg.nome} onChange={(e) => setSaveDlg({ ...saveDlg, nome: e.target.value })} /></div>
            <div><Label>Descrição</Label><Input value={saveDlg.descricao} onChange={(e) => setSaveDlg({ ...saveDlg, descricao: e.target.value })} /></div>
            <div>
              <Label>Tipo</Label>
              <select value={saveDlg.tipo} onChange={(e) => setSaveDlg({ ...saveDlg, tipo: e.target.value as "dinamico" | "estatico" })} className="w-full h-9 rounded-md border bg-background px-2 text-sm">
                <option value="dinamico">Dinâmico (recalcula pelos filtros)</option>
                <option value="estatico">Estático ({selected.size} selecionados agora)</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDlg({ ...saveDlg, open: false })}>Cancelar</Button>
            <Button onClick={doSaveSegment}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SendWhatsAppWizard
        open={sendDlg.open}
        onOpenChange={(o) => setSendDlg({ ...sendDlg, open: o })}
        source={sendDlg.mode === "selection" ? { ids: [...selected] } : { filters }}
        labelSelecao={sendDlg.mode === "selection" ? `${selected.size} contato(s) selecionado(s)` : "todos os contatos do filtro atual"}
      />

      <ConfirmDeleteContactDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        bulkCount={selected.size}
        onConfirm={async (typed) => {
          try {
            const r = await deleteBulkFn({ data: { ids: [...selected], confirmation: typed } });
            toast.success(`${r.deleted} contato(s) excluído(s) definitivamente.`);
            setSelected(new Set());
            q.refetch();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro ao excluir.");
          }
        }}
      />
      <PhoneReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} onDone={() => { q.refetch(); countsQ.refetch(); }} />
    </div>
    </TooltipProvider>
  );
}

function QuickChip({ label, count, active, onClick }: { label: string; count?: number; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "text-xs px-2.5 py-1 rounded-full border transition " +
        (active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-accent border-input text-foreground")
      }
    >
      {label}
      {typeof count === "number" && (
        <span className={"ml-1.5 tabular-nums " + (active ? "opacity-90" : "text-muted-foreground")}>
          {count}
        </span>
      )}
    </button>
  );
}
