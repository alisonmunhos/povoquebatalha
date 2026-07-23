import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LIFECYCLE_LABEL } from "@/lib/phone-labels";

export type FilterOption = { value: string; label: string; count: number };

// Faixas etárias são um conjunto fixo, não derivado do banco (mesmo padrão de TIPO_CONTATO).
export const FAIXA_ETARIA_OPTIONS: { value: string; label: string }[] = [
  { value: "16_17", label: "16-17 anos" },
  { value: "18_24", label: "18-24 anos" },
  { value: "25_34", label: "25-34 anos" },
  { value: "35_44", label: "35-44 anos" },
  { value: "45_59", label: "45-59 anos" },
  { value: "60_mais", label: "60+ anos" },
];

/** Remove acentos e normaliza espaços. */
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normKey(s: string): string {
  return stripAccents(s.trim().toLowerCase()).replace(/\s+/g, " ");
}
function titleCase(s: string): string {
  const small = new Set(["de", "da", "do", "das", "dos", "e", "di"]);
  return s
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      const low = w.toLowerCase();
      if (i > 0 && small.has(low)) return low;
      return low.charAt(0).toUpperCase() + low.slice(1);
    })
    .join(" ");
}

type Counter = Map<string, { label: string; count: number }>;
function bump(map: Counter, raw: string | null | undefined, transform: (s: string) => string = titleCase) {
  if (!raw) return;
  const t = raw.toString().trim();
  if (!t) return;
  const k = normKey(t);
  if (!k) return;
  const cur = map.get(k);
  if (cur) cur.count += 1;
  else map.set(k, { label: transform(t), count: 1 });
}
function toOptions(map: Counter): FilterOption[] {
  return [...map.entries()]
    .map(([value, v]) => ({ value: v.label, label: v.label, count: v.count, _k: value }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"))
    .map(({ value, label, count }) => ({ value, label, count }));
}

/**
 * Retorna todas as opções distintas encontradas nos contatos, com contagem.
 * As contagens consideram contatos não-arquivados; envia até 20k linhas —
 * suficiente para o volume atual do projeto.
 */
export const getContactFilterOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cidades: z.array(z.string()).optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const cidadesFiltro = (data?.cidades ?? []).map((c) => normKey(c));

    const { data: formDefs, error: formDefsError } = await sb
      .from("form_definitions")
      .select("id,tracking_name,title");
    if (formDefsError) throw formDefsError;
    const formLabelById = new Map<string, string>();
    for (const f of formDefs ?? []) {
      const lbl = ((f.tracking_name as string | null) || (f.title as string)).trim();
      if (lbl) formLabelById.set(f.id as string, lbl);
    }

    // Contatos ativos (arquivados fora)
    const { data: contacts, error } = await sb
      .from("contacts")
      .select(
        "cidade,bairro,uf,profissao,tipo_contato,origem,origem_detalhe,formas_ajuda,formas_ajuda_outro,movimento_social_nome,quem_indicou,rede_social,zona_eleitoral,disponibilidade,como_conheceu,faixa_etaria,lifecycle_status,consentimento_whatsapp,participa_movimento_social,coletivo_alicerce,active_tracking_label,active_tracking_form_id,imported_by_user_id",
      )
      .is("arquivado_at", null)
      .limit(20000);
    if (error) throw error;

    // Rótulos amigáveis das formas de ajuda; valores legados consolidados
    const FA_LABELS: Record<string, string> = {
      panfletagem_banquinha: "Panfletagem / Banquinha",
      panfletagem: "Panfletagem / Banquinha",
      compartilhar_whatsapp: "Compartilhar material no WhatsApp",
      compartilhar_redes: "Compartilhar nas redes sociais",
      participar_eventos: "Participar de eventos",
      ajudar_organizacao: "Ajudar na organização",
      mobilizar_bairro: "Mobilizar pessoas do bairro",
      adesivar_carro: "Adesivar o carro",
      plaquinha_casa: "Plaquinha na frente de casa",
      receber_panfletos: "Receber panfletos e adesivos",
      outro: "Outro",
    };
    const FA_VALUE_MAP: Record<string, string> = {
      panfletagem: "panfletagem_banquinha",
      "Panfletagem (legado)": "panfletagem_banquinha",
      Panfletagem: "panfletagem_banquinha",
    };

    const cidades: Counter = new Map();
    const bairros: Counter = new Map();
    const ufs: Counter = new Map();
    const profissoes: Counter = new Map();
    const instituicoes: Counter = new Map();
    const tipos_contato: Counter = new Map();
    const origens: Counter = new Map();
    const origem_detalhes: Counter = new Map();
    const formas_ajuda: Counter = new Map();
    const formas_ajuda_outro: Counter = new Map();
    const movimentos_sociais: Counter = new Map();
    const quem_indicou: Counter = new Map();
    const rede_social: Counter = new Map();
    const zona_eleitoral: Counter = new Map();
    const disponibilidade: Counter = new Map();
    const como_conheceu: Counter = new Map();
    const faixa_etaria_counts: Counter = new Map();
    const lifecycle_status_counts: Counter = new Map();
    const tracking_points: Counter = new Map();
    const imported_by_counts = new Map<string, number>();
    let consentSim = 0;
    let consentNao = 0;
    let consentEmpty = 0;
    let participaSim = 0;
    let participaNao = 0;
    let participaEmpty = 0;
    let coletivoSim = 0;
    let coletivoNao = 0;
    let coletivoEmpty = 0;

    const DIA_LABELS: Record<string, string> = {
      segunda: "Segunda", terca: "Terça", quarta: "Quarta", quinta: "Quinta",
      sexta: "Sexta", sabado: "Sábado", domingo: "Domingo",
    };
    const PERIODO_LABELS: Record<string, string> = {
      manha: "Manhã", tarde: "Tarde", noite: "Noite",
    };

    for (const c of contacts ?? []) {
      bump(cidades, c.cidade);
      const cidadeK = c.cidade ? normKey(c.cidade) : "";
      const cidadeMatch = cidadesFiltro.length === 0 || (cidadeK && cidadesFiltro.includes(cidadeK));
      if (cidadeMatch) bump(bairros, c.bairro);
      bump(ufs, c.uf, (s) => s.toUpperCase());
      bump(profissoes, c.profissao);
      // instituicao: coluna removida do schema; mantido comentário para futura reintrodução.
      bump(tipos_contato, c.tipo_contato, (s) => s);
      bump(origens, c.origem as unknown as string, (s) => s);
      bump(origem_detalhes, c.origem_detalhe);
      const formId = c.active_tracking_form_id as string | null | undefined;
      const trackingLabel = formId
        ? formLabelById.get(formId) ?? (c.active_tracking_label as string | null)
        : (c.active_tracking_label as string | null);
      bump(tracking_points, trackingLabel, (s) => s);
      if (c.imported_by_user_id) {
        const uid = c.imported_by_user_id as string;
        imported_by_counts.set(uid, (imported_by_counts.get(uid) ?? 0) + 1);
      }
      bump(movimentos_sociais, c.movimento_social_nome);
      bump(quem_indicou, c.quem_indicou);
      bump(rede_social, c.rede_social);
      bump(zona_eleitoral, c.zona_eleitoral);
      bump(como_conheceu, c.como_conheceu);
      bump(formas_ajuda_outro, c.formas_ajuda_outro);
      const arr = c.formas_ajuda as unknown;
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item !== "string" || !item) continue;
          const canonical = FA_VALUE_MAP[item] ?? item;
          const label = FA_LABELS[canonical] ?? canonical;
          const cur = formas_ajuda.get(canonical);
          if (cur) cur.count += 1;
          else formas_ajuda.set(canonical, { label, count: 1 });
        }
      }
      const disp = c.disponibilidade as unknown;
      if (Array.isArray(disp)) {
        for (const slug of disp) {
          if (typeof slug !== "string" || !slug) continue;
          const [dia, periodo] = slug.split("_");
          const label = `${DIA_LABELS[dia] ?? dia} - ${PERIODO_LABELS[periodo] ?? periodo}`;
          const cur = disponibilidade.get(slug);
          if (cur) cur.count += 1;
          else disponibilidade.set(slug, { label, count: 1 });
        }
      }
      const faixa = c.faixa_etaria as string | null | undefined;
      if (faixa) {
        const faixaLabel = FAIXA_ETARIA_OPTIONS.find((o) => o.value === faixa)?.label ?? faixa;
        const cur = faixa_etaria_counts.get(faixa);
        if (cur) cur.count += 1;
        else faixa_etaria_counts.set(faixa, { label: faixaLabel, count: 1 });
      }
      const lifecycle = c.lifecycle_status as string | null | undefined;
      if (lifecycle) {
        const label = LIFECYCLE_LABEL[lifecycle] ?? lifecycle;
        const cur = lifecycle_status_counts.get(lifecycle);
        if (cur) cur.count += 1;
        else lifecycle_status_counts.set(lifecycle, { label, count: 1 });
      }
      if (c.consentimento_whatsapp === true) consentSim += 1;
      else if (c.consentimento_whatsapp === false) consentNao += 1;
      else consentEmpty += 1;
      if (c.participa_movimento_social === true) participaSim += 1;
      else if (c.participa_movimento_social === false) participaNao += 1;
      else participaEmpty += 1;
      if (c.coletivo_alicerce === true) coletivoSim += 1;
      else if (c.coletivo_alicerce === false) coletivoNao += 1;
      else coletivoEmpty += 1;
    }

    // Tags — contagem por tag_id (mesmo padrão de /tags), só contatos não arquivados
    const { data: tags, error: tagsError } = await sb.from("tags").select("id,nome,cor");
    if (tagsError) throw tagsError;

    const tagIds = (tags ?? []).map((t) => t.id as string);
    const tagCount = new Map<string, number>();

    if (tagIds.length) {
      const { data: rels, error: tagRelsError } = await sb
        .from("contact_tags")
        .select("tag_id, contact_id")
        .in("tag_id", tagIds);
      if (tagRelsError) throw tagRelsError;

      const linkedContactIds = Array.from(
        new Set((rels ?? []).map((r) => r.contact_id as string)),
      );

      const activeSet = new Set<string>();
      const BATCH = 500;
      for (let i = 0; i < linkedContactIds.length; i += BATCH) {
        const chunk = linkedContactIds.slice(i, i + BATCH);
        const { data: activeChunk, error: activeError } = await sb
          .from("contacts")
          .select("id")
          .in("id", chunk)
          .is("arquivado_at", null);
        if (activeError) throw activeError;
        for (const c of activeChunk ?? []) activeSet.add(c.id as string);
      }

      for (const r of rels ?? []) {
        if (!activeSet.has(r.contact_id as string)) continue;
        const k = r.tag_id as string;
        tagCount.set(k, (tagCount.get(k) ?? 0) + 1);
      }
    }
    const tagsOpts = (tags ?? [])
      .map((t) => ({
        value: t.id as string,
        label: t.nome as string,
        count: tagCount.get(t.id as string) ?? 0,
        cor: (t.cor as string) ?? null,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));

    // Segmentos
    const { data: segments } = await sb
      .from("segments")
      .select("id,nome,tipo")
      .order("nome", { ascending: true });
    const segmentsOpts = (segments ?? []).map((s) => ({
      value: s.id as string,
      label: s.nome as string,
      tipo: s.tipo as string,
    }));

    // Campanhas
    const { data: campaigns } = await sb
      .from("campaigns")
      .select("id,nome,status,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    const campaignsOpts = (campaigns ?? []).map((c) => ({
      value: c.id as string,
      label: c.nome as string,
      status: c.status as string,
    }));

    // Mensagens salvas (templates)
    const { data: templates } = await sb
      .from("message_templates")
      .select("id,title,kind")
      .is("archived_at", null)
      .order("title", { ascending: true });
    const templatesOpts = (templates ?? []).map((t) => ({
      value: t.id as string,
      label: t.title as string,
      kind: t.kind as string,
    }));

    // Lotes de importação
    const { data: imports } = await sb
      .from("imports")
      .select("id,file_name,created_at,total")
      .order("created_at", { ascending: false })
      .limit(50);
    const importsOpts = (imports ?? []).map((i) => ({
      value: i.id as string,
      label: `${i.file_name} — ${new Date(i.created_at as string).toLocaleDateString("pt-BR")}`,
      count: (i.total as number) ?? 0,
    }));

    const importedByIds = [...imported_by_counts.keys()];
    let importedByOpts: FilterOption[] = [];
    if (importedByIds.length) {
      const { data: profiles } = await sb
        .from("profiles")
        .select("id,full_name")
        .in("id", importedByIds);
      const nameMap = new Map(
        (profiles ?? []).map((p) => [
          p.id as string,
          (p.full_name as string | null)?.trim() || (p.id as string),
        ]),
      );
      importedByOpts = importedByIds
        .map((id) => ({
          value: id,
          label: nameMap.get(id) ?? id,
          count: imported_by_counts.get(id) ?? 0,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
    }

    return {
      cidades: toOptions(cidades),
      bairros: toOptions(bairros),
      ufs: toOptions(ufs),
      profissoes: toOptions(profissoes),
      instituicoes: toOptions(instituicoes),
      tipos_contato: toOptions(tipos_contato),
      origens: toOptions(origens),
      origem_detalhes: toOptions(origem_detalhes),
      formas_ajuda: [...formas_ajuda.entries()]
        .map(([slug, v]) => ({ value: slug, label: v.label, count: v.count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR")),
      formas_ajuda_outro: toOptions(formas_ajuda_outro),
      movimentos_sociais: toOptions(movimentos_sociais),
      quem_indicou: toOptions(quem_indicou),
      rede_social: toOptions(rede_social),
      zona_eleitoral: toOptions(zona_eleitoral),
      como_conheceu: toOptions(como_conheceu),
      disponibilidade: [...disponibilidade.entries()]
        .map(([slug, v]) => ({ value: slug, label: v.label, count: v.count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR")),
      faixa_etaria: FAIXA_ETARIA_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
        count: faixa_etaria_counts.get(o.value)?.count ?? 0,
      })),
      lifecycle_statuses: Object.entries(LIFECYCLE_LABEL)
        .map(([value, label]) => ({
          value,
          label,
          count: lifecycle_status_counts.get(value)?.count ?? 0,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR")),
      consentimento: [
        { value: "sim", label: "Sim", count: consentSim },
        { value: "nao", label: "Não", count: consentNao },
      ],
      consentimento_empty: consentEmpty,
      participa_movimento_social: [
        { value: "true", label: "Sim", count: participaSim },
        { value: "false", label: "Não", count: participaNao },
      ],
      participa_movimento_social_empty: participaEmpty,
      coletivo_alicerce: [
        { value: "true", label: "Sim", count: coletivoSim },
        { value: "false", label: "Não", count: coletivoNao },
      ],
      coletivo_alicerce_empty: coletivoEmpty,
      tags: tagsOpts,
      segmentos: segmentsOpts,
      campanhas: campaignsOpts,
      mensagens: templatesOpts,
      importacoes: importsOpts,
      tracking_points: toOptions(tracking_points).filter((o) => o.count > 0),
      imported_by: importedByOpts,
      totalContatosBase: contacts?.length ?? 0,
    };
  });
