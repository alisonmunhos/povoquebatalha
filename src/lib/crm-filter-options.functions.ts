import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FilterOption = { value: string; label: string; count: number };

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
  .handler(async ({ context }) => {
    const sb = context.supabase;

    // Contatos ativos (arquivados fora)
    const { data: contacts, error } = await sb
      .from("contacts")
      .select(
        "cidade,bairro,uf,profissao,tipo_contato,origem,origem_detalhe,formas_ajuda,movimento_social_nome",
      )
      .is("arquivado_at", null)
      .limit(20000);
    if (error) throw error;

    const cidades: Counter = new Map();
    const bairros: Counter = new Map();
    const ufs: Counter = new Map();
    const profissoes: Counter = new Map();
    const tipos_contato: Counter = new Map();
    const origens: Counter = new Map();
    const origem_detalhes: Counter = new Map();
    const formas_ajuda: Counter = new Map();
    const movimentos_sociais: Counter = new Map();

    for (const c of contacts ?? []) {
      bump(cidades, c.cidade);
      bump(bairros, c.bairro);
      bump(ufs, c.uf, (s) => s.toUpperCase());
      bump(profissoes, c.profissao);
      bump(tipos_contato, c.tipo_contato, (s) => s);
      bump(origens, c.origem as unknown as string, (s) => s);
      bump(origem_detalhes, c.origem_detalhe);
      bump(movimentos_sociais, c.movimento_social_nome);
      const arr = c.formas_ajuda as unknown;
      if (Array.isArray(arr)) {
        for (const item of arr) if (typeof item === "string") bump(formas_ajuda, item, (s) => s);
      }
    }

    // Tags
    const { data: tags } = await sb.from("tags").select("id,nome,cor,uso_total");
    const tagsOpts = (tags ?? [])
      .map((t) => ({
        value: t.id as string,
        label: t.nome as string,
        count: (t.uso_total as number) ?? 0,
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

    return {
      cidades: toOptions(cidades),
      bairros: toOptions(bairros),
      ufs: toOptions(ufs),
      profissoes: toOptions(profissoes),
      tipos_contato: toOptions(tipos_contato),
      origens: toOptions(origens),
      origem_detalhes: toOptions(origem_detalhes),
      formas_ajuda: toOptions(formas_ajuda),
      movimentos_sociais: toOptions(movimentos_sociais),
      tags: tagsOpts,
      segmentos: segmentsOpts,
      campanhas: campaignsOpts,
      mensagens: templatesOpts,
      importacoes: importsOpts,
      totalContatosBase: contacts?.length ?? 0,
    };
  });
