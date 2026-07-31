// Triagem por swipe de segmentos.
// A fila é derivada do próprio segmento (estático = member_ids, dinâmico = filtros),
// então segmentos dinâmicos ganham contatos novos automaticamente a cada recarga.
// Nada de lógica nova de negócio aqui: arquivar/observação/ficha continuam nas
// funções já existentes (contacts.functions.ts / territory-logs.functions.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyCrmFilters, type CrmFilters } from "@/lib/crm-filters";

export const TRIAGE_PAGE_SIZE = 40;

export type TriageContact = {
  id: string;
  nome: string;
  nome_social: string | null;
  profissao: string | null;
  instituicao: string | null;
  cidade: string | null;
  bairro: string | null;
  uf: string | null;
  coletivo_alicerce: boolean | null;
  observacoes: string | null;
  tags: Array<{ id: string; nome: string; cor: string }>;
  ultima_observacao: { note: string; created_at: string } | null;
};

const CONTACT_COLS =
  "id,nome,nome_social,profissao,instituicao,cidade,bairro,uf,coletivo_alicerce,observacoes,arquivado_at,is_system_user,created_at";

type RawContact = {
  id: string;
  nome: string;
  nome_social: string | null;
  profissao: string | null;
  instituicao: string | null;
  cidade: string | null;
  bairro: string | null;
  uf: string | null;
  coletivo_alicerce: boolean | null;
  observacoes: string | null;
  created_at?: string | null;
};

/**
 * Segmentos estáticos podem ter centenas de IDs. Mandar tudo num único `.in()`
 * estoura o tamanho da URL/cabeçalho e a consulta falha — por isso vai em lotes.
 */
const ID_CHUNK = 100;

function chunkIds(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) out.push(ids.slice(i, i + ID_CHUNK));
  return out;
}

/** Gera token URL-safe de 22 chars para o link de tarefa. */
function genToken(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(22);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** Cabeçalho da triagem: nome do segmento + total de contatos ativos na fila. */
export const getSegmentTriageMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ segmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: seg, error } = await context.supabase
      .from("segments")
      .select("id,nome,descricao,tipo,filtro,member_ids")
      .eq("id", data.segmentId)
      .maybeSingle();
    if (error) throw error;
    if (!seg) throw new Error("Segmento não encontrado.");

    let total = 0;
    if (seg.tipo === "estatico") {
      const ids = ((seg.member_ids as string[] | null) ?? []).filter(Boolean);
      for (const lote of chunkIds(ids)) {
        const { count, error: cErr } = await context.supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .in("id", lote)
          .is("arquivado_at", null)
          .eq("is_system_user", false);
        if (cErr) throw cErr;
        total += count ?? 0;
      }
    } else {
      const filtro = (seg.filtro ?? {}) as CrmFilters;
      let q = context.supabase.from("contacts").select("id", { count: "exact", head: true });
      q = applyCrmFilters(q as never, filtro) as typeof q;
      const { count } = await q.is("arquivado_at", null).eq("is_system_user", false);
      total = count ?? 0;
    }

    return {
      segment: { id: seg.id, nome: seg.nome, descricao: seg.descricao, tipo: seg.tipo as "dinamico" | "estatico" },
      total,
    };
  });

/**
 * Uma página da fila de triagem. Sempre recalculada no servidor — em segmento
 * dinâmico isso significa que quem entrou depois aparece na próxima busca.
 */
export const listSegmentTriageQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        segmentId: z.string().uuid(),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(5).max(100).default(TRIAGE_PAGE_SIZE),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: seg, error: segErr } = await context.supabase
      .from("segments")
      .select("tipo,filtro,member_ids")
      .eq("id", data.segmentId)
      .maybeSingle();
    if (segErr) throw segErr;
    if (!seg) throw new Error("Segmento não encontrado.");

    const from = data.page * data.pageSize;
    const to = from + data.pageSize - 1;

    let rows: RawContact[] = [];
    if (seg.tipo === "estatico") {
      const ids = ((seg.member_ids as string[] | null) ?? []).filter(Boolean);
      const all: RawContact[] = [];
      for (const lote of chunkIds(ids)) {
        const { data: cs, error } = await context.supabase
          .from("contacts")
          .select(CONTACT_COLS)
          .in("id", lote)
          .is("arquivado_at", null)
          .eq("is_system_user", false);
        if (error) throw error;
        all.push(...((cs ?? []) as unknown as RawContact[]));
      }
      all.sort((a, b) => {
        const ca = a.created_at ?? "";
        const cb = b.created_at ?? "";
        if (ca !== cb) return ca < cb ? 1 : -1;
        return a.id < b.id ? -1 : 1;
      });
      rows = all.slice(from, to + 1);
    } else {
      const filtro = (seg.filtro ?? {}) as CrmFilters;
      let q = context.supabase.from("contacts").select(CONTACT_COLS);
      q = applyCrmFilters(q as never, filtro) as typeof q;
      const { data: cs, error } = await q
        .is("arquivado_at", null)
        .eq("is_system_user", false)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      rows = (cs ?? []) as unknown as RawContact[];
    }

    const ids = rows.map((r) => r.id);
    const tagsByContact = new Map<string, Array<{ id: string; nome: string; cor: string }>>();
    const lastNote = new Map<string, { note: string; created_at: string }>();

    if (ids.length) {
      const [tagsRes, terrRes, agitRes] = await Promise.all([
        context.supabase
          .from("contact_tags")
          .select("contact_id, tags(id,nome,cor)")
          .in("contact_id", ids),
        context.supabase
          .from("territory_contact_logs")
          .select("contact_id,note,created_at")
          .in("contact_id", ids)
          .not("note", "is", null)
          .is("hidden_at", null)
          .order("created_at", { ascending: false }),
        context.supabase
          .from("agitacao_contact_logs")
          .select("contact_id,note,created_at")
          .in("contact_id", ids)
          .not("note", "is", null)
          .is("hidden_at", null)
          .order("created_at", { ascending: false }),
      ]);

      for (const rel of (tagsRes.data ?? []) as Array<{
        contact_id: string;
        tags: { id: string; nome: string; cor: string } | null;
      }>) {
        if (!rel.tags) continue;
        const arr = tagsByContact.get(rel.contact_id) ?? [];
        arr.push(rel.tags);
        tagsByContact.set(rel.contact_id, arr);
      }

      const noteRows = [
        ...((terrRes.data ?? []) as Array<{ contact_id: string; note: string | null; created_at: string }>),
        ...((agitRes.data ?? []) as Array<{ contact_id: string; note: string | null; created_at: string }>),
      ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      for (const n of noteRows) {
        if (!n.note) continue;
        if (!lastNote.has(n.contact_id)) lastNote.set(n.contact_id, { note: n.note, created_at: n.created_at });
      }
    }

    const contacts: TriageContact[] = rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      nome_social: r.nome_social,
      profissao: r.profissao,
      instituicao: r.instituicao,
      cidade: r.cidade,
      bairro: r.bairro,
      uf: r.uf,
      coletivo_alicerce: r.coletivo_alicerce,
      observacoes: r.observacoes,
      tags: tagsByContact.get(r.id) ?? [],
      ultima_observacao: lastNote.get(r.id) ?? null,
    }));

    return {
      contacts,
      page: data.page,
      hasMore: rows.length === data.pageSize,
    };
  });

// ============ Links de tarefa de triagem (compartilhar) ============

type ShareRow = {
  id: string;
  segment_id: string;
  token: string;
  label: string | null;
  is_active: boolean;
  use_count: number;
  created_at: string;
};

// A tabela é nova e ainda não está nos tipos gerados — acesso via cliente destipado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shares = (supabase: unknown) => (supabase as any).from("segment_triage_shares");

export const listSegmentTriageShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ segmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await shares(context.supabase)
      .select("id,segment_id,token,label,is_active,use_count,created_at")
      .eq("segment_id", data.segmentId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { shares: (rows ?? []) as ShareRow[] };
  });

export const createSegmentTriageShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        segmentId: z.string().uuid(),
        label: z.string().trim().max(120).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await shares(context.supabase)
      .insert({
        segment_id: data.segmentId,
        token: genToken(),
        label: data.label?.trim() || null,
        created_by: context.userId,
        is_active: true,
      })
      .select("id,segment_id,token,label,is_active,use_count,created_at")
      .single();
    if (error) throw new Error(error.message);
    return { share: row as ShareRow };
  });

export const revokeSegmentTriageShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await shares(context.supabase).update({ is_active: false }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Resolve o token para o segmento. Só roda autenticado — o token identifica a
 * TAREFA, nunca autoriza dados: os contatos continuam vindo pela RLS do usuário.
 */
export const resolveSegmentTriageShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().trim().min(8).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    // O usuário logado não pode listar links de outras pessoas (RLS restrita ao
    // criador/admin). A leitura pelo token exato é feita com acesso privilegiado,
    // e nunca devolve o token nem dados do segmento sem checar a permissão do
    // usuário logo abaixo.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await shares(supabaseAdmin)
      .select("id,segment_id,is_active,expires_at,use_count")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { ok: false as const, reason: "nao_encontrado" as const };
    if (!row.is_active) return { ok: false as const, reason: "revogado" as const };
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return { ok: false as const, reason: "expirado" as const };
    }

    // Acesso ao segmento continua valendo pela RLS do usuário autenticado.
    const { data: seg } = await context.supabase
      .from("segments")
      .select("id,nome")
      .eq("id", row.segment_id)
      .maybeSingle();
    if (!seg) return { ok: false as const, reason: "sem_acesso" as const };

    await shares(supabaseAdmin)
      .update({ use_count: (row.use_count ?? 0) + 1 })
      .eq("id", row.id);

    return { ok: true as const, segmentId: seg.id, segmentNome: seg.nome };
  });
