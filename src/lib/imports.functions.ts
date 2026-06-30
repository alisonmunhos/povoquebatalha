import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as XLSX from "xlsx";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parsePhoneBR, type ParsedPhone } from "@/lib/phone";

export const FIELD_KEYS = [
  "ignore",
  "nome",
  "phone_raw",
  "email",
  "cidade",
  "uf",
  "cep",
  "endereco",
  "numero",
  "bairro",
  "observacoes",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

const ENCODINGS = ["auto", "utf-8", "utf-8-bom", "iso-8859-1", "windows-1252"] as const;
export type EncodingOption = (typeof ENCODINGS)[number];

function normalize(s: string) {
  return s
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function suggestMapping(headers: string[]): Record<string, FieldKey> {
  const map: Record<string, FieldKey> = {};
  for (const h of headers) {
    const n = normalize(h);
    if (!n) { map[h] = "ignore"; continue; }
    if (/(nome|name|completo)/.test(n)) map[h] = "nome";
    else if (/(telefone|celular|phone|whats|fone|tel|numero|mobile)/.test(n)) map[h] = "phone_raw";
    else if (/(email|mail|eletronic)/.test(n)) map[h] = "email";
    else if (/(cidade|municipio|city)/.test(n)) map[h] = "cidade";
    else if (/(uf|estado|state)/.test(n)) map[h] = "uf";
    else if (/(cep|zip|postal)/.test(n)) map[h] = "cep";
    else if (/(rua|endereco|logradouro|address|street)/.test(n)) map[h] = "endereco";
    else if (/^numero$|^num$|^number$/.test(n)) map[h] = "numero";
    else if (/(bairro|neighborhood|district)/.test(n)) map[h] = "bairro";
    else if (/(obs|nota|comentario|observ|note)/.test(n)) map[h] = "observacoes";
    else map[h] = "ignore";
  }
  return map;
}

async function downloadBytes(
  supabase: { storage: { from: (b: string) => { download: (p: string) => Promise<{ data: Blob | null; error: unknown }> } } },
  filePath: string,
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from("imports").download(filePath);
  if (error || !data) throw new Error("Não foi possível ler o arquivo do storage.");
  return new Uint8Array(await data.arrayBuffer());
}

async function readWorkbookFromBytes(bytes: Uint8Array, fileName: string, encoding: EncodingOption) {
  const isCsv = /\.csv$/i.test(fileName);
  let usedEncoding: string = "binary";
  let wb: XLSX.WorkBook;
  if (isCsv) {
    const { decodeBytes } = await import("@/lib/encoding.server");
    const decoded = decodeBytes(bytes, encoding);
    usedEncoding = decoded.used;
    wb = XLSX.read(decoded.text, { type: "string", raw: false });
  } else {
    wb = XLSX.read(bytes, { type: "array" });
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  return { rows, usedEncoding };
}

type PreviewRow = {
  linha: number;
  nome: string | null;
  email: string | null;
  phone: ParsedPhone;
  dup?: { contact_id: string; nome: string; phone_e164: string | null; match: "forte" | "provavel" | "possivel" };
  problemas: string[];
};

const parseSchema = z.object({
  filePath: z.string().min(1),
  fileName: z.string().min(1),
  encoding: z.enum(ENCODINGS).default("auto"),
  defaultDdd: z.string().trim().max(3).optional().nullable(),
});

export const parseUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const bytes = await downloadBytes(context.supabase, data.filePath);
    const { rows, usedEncoding } = await readWorkbookFromBytes(bytes, data.fileName, data.encoding);
    if (rows.length === 0) throw new Error("Arquivo vazio.");
    const headers = Object.keys(rows[0]);
    const mapping = suggestMapping(headers);

    const { data: imp, error } = await context.supabase
      .from("imports")
      .insert({
        file_path: data.filePath,
        file_name: data.fileName,
        total: rows.length,
        mapeamento: { mapping, encoding: usedEncoding, defaultDdd: data.defaultDdd ?? null },
        status: "pending",
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;

    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const slice = rows.slice(i, i + chunkSize).map((r, idx) => ({
        import_id: imp.id,
        linha: i + idx + 2,
        raw: r as never,
        status: "pending",
      }));
      const { error: e2 } = await context.supabase.from("import_rows").insert(slice);
      if (e2) throw e2;
    }

    return {
      importId: imp.id as string,
      headers,
      mapping,
      total: rows.length,
      usedEncoding,
      defaultDdd: data.defaultDdd ?? null,
      sample: rows.slice(0, 8).map((r) => JSON.parse(JSON.stringify(r)) as Record<string, string>),
    };
  });

const previewSchema = z.object({
  importId: z.string().uuid(),
  encoding: z.enum(ENCODINGS).default("auto"),
  defaultDdd: z.string().trim().max(3).optional().nullable(),
  mapping: z.record(z.string(), z.enum(FIELD_KEYS)),
});

// Re-decode (e.g. user changed encoding) and produce preview rows.
export const buildPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => previewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: imp, error } = await sb
      .from("imports")
      .select("file_path, file_name")
      .eq("id", data.importId)
      .single();
    if (error) throw error;

    if (!imp.file_path) throw new Error("Importação sem arquivo associado.");
    const bytes = await downloadBytes(sb, imp.file_path);
    const { rows, usedEncoding } = await readWorkbookFromBytes(bytes, imp.file_name ?? "arquivo.csv", data.encoding);

    const preview: PreviewRow[] = [];
    const e164List: string[] = [];
    const last8List: string[] = [];
    const emailList: string[] = [];

    rows.forEach((raw, idx) => {
      const linha = idx + 2;
      const get = (key: FieldKey): string | null => {
        for (const [col, k] of Object.entries(data.mapping)) {
          if (k === key) {
            const v = (raw as Record<string, unknown>)[col];
            return v == null || v === "" ? null : String(v).trim();
          }
        }
        return null;
      };
      const nome = get("nome");
      const email = get("email")?.toLowerCase() ?? null;
      const phoneRaw = get("phone_raw");
      const phone = parsePhoneBR(phoneRaw, data.defaultDdd ?? null);
      const problemas: string[] = [];
      if (!nome || nome.length < 2) problemas.push("Nome ausente");
      if (!phoneRaw) problemas.push("Telefone ausente");
      else if (phone.phone_status === "invalido") problemas.push("Telefone inválido");
      else if (phone.phone_status === "sem_ddd") problemas.push("Telefone sem DDD");

      if (phone.phone_e164) e164List.push(phone.phone_e164);
      if (phone.phone_last8) last8List.push(phone.phone_last8);
      if (email) emailList.push(email);

      preview.push({ linha, nome, email, phone, problemas });
    });

    // Bulk dedup query
    type DupRow = { id: string; nome: string; phone_e164: string | null; phone_last8: string | null; email: string | null; nome_normalizado: string | null };
    const dupHits = new Map<string, DupRow>();
    const idx_last8 = new Map<string, DupRow[]>();
    const idx_email = new Map<string, DupRow>();

    if (e164List.length || last8List.length || emailList.length) {
      const filters: string[] = [];
      if (e164List.length) filters.push(`phone_e164.in.(${[...new Set(e164List)].map((v) => `"${v}"`).join(",")})`);
      if (last8List.length) filters.push(`phone_last8.in.(${[...new Set(last8List)].map((v) => `"${v}"`).join(",")})`);
      if (emailList.length) filters.push(`email.in.(${[...new Set(emailList)].map((v) => `"${v}"`).join(",")})`);
      const { data: hits } = await sb
        .from("contacts")
        .select("id,nome,phone_e164,phone_last8,email,nome_normalizado")
        .or(filters.join(","));
      for (const h of (hits ?? []) as DupRow[]) {
        dupHits.set(h.id, h);
        if (h.phone_last8) {
          const arr = idx_last8.get(h.phone_last8) ?? [];
          arr.push(h);
          idx_last8.set(h.phone_last8, arr);
        }
        if (h.email) idx_email.set(h.email.toLowerCase(), h);
      }
    }

    for (const pr of preview) {
      let dup: PreviewRow["dup"];
      if (pr.email && idx_email.has(pr.email)) {
        const h = idx_email.get(pr.email)!;
        dup = { contact_id: h.id, nome: h.nome, phone_e164: h.phone_e164, match: "forte" };
      } else if (pr.phone.phone_e164) {
        const hits = idx_last8.get(pr.phone.phone_last8 ?? "") ?? [];
        const exact = hits.find((h) => h.phone_e164 === pr.phone.phone_e164);
        if (exact) {
          dup = { contact_id: exact.id, nome: exact.nome, phone_e164: exact.phone_e164, match: "forte" };
        } else if (hits.length > 0) {
          const h = hits[0];
          const norm = (pr.nome ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const other = (h.nome_normalizado ?? "").toLowerCase();
          const score = norm && other ? (norm === other ? 1 : norm.includes(other) || other.includes(norm) ? 0.7 : 0.4) : 0;
          dup = { contact_id: h.id, nome: h.nome, phone_e164: h.phone_e164, match: score > 0.6 ? "provavel" : "possivel" };
        }
      }
      if (dup) pr.dup = dup;
    }

    // Persist preview snapshot on each import_row
    const previewByLinha = new Map(preview.map((p) => [p.linha, p]));
    const pageSize = 500;
    let from = 0;
    while (true) {
      const { data: rs } = await sb
        .from("import_rows")
        .select("id,linha")
        .eq("import_id", data.importId)
        .order("linha")
        .range(from, from + pageSize - 1);
      if (!rs || rs.length === 0) break;
      for (const r of rs) {
        const p = previewByLinha.get(r.linha);
        if (!p) continue;
        await sb.from("import_rows").update({ preview: p as never }).eq("id", r.id);
      }
      if (rs.length < pageSize) break;
      from += pageSize;
    }

    await sb
      .from("imports")
      .update({
        mapeamento: { mapping: data.mapping, encoding: usedEncoding, defaultDdd: data.defaultDdd ?? null },
      })
      .eq("id", data.importId);

    const stats = {
      total: preview.length,
      validos: preview.filter((p) => p.phone.phone_status === "valido" && p.problemas.length === 0).length,
      precisa_revisao: preview.filter((p) => ["precisa_revisao", "sem_nono_digito", "sem_ddd"].includes(p.phone.phone_status)).length,
      invalidos: preview.filter((p) => p.phone.phone_status === "invalido" || p.problemas.length > 0).length,
      duplicados: preview.filter((p) => p.dup).length,
    };

    return {
      usedEncoding,
      stats,
      sample: preview.slice(0, 200),
    };
  });

const commitSchema = z.object({
  importId: z.string().uuid(),
  strategy: z.enum(["all", "valid_only", "mark_review"]).default("mark_review"),
  consentimentoWhatsapp: z.boolean().default(true),
  tipo: z.string().default("apoiador"),
});

export const commitImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => commitSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await sb.from("imports").update({ status: "processing" }).eq("id", data.importId);

    let criados = 0, atualizados = 0, duplicados = 0, erros = 0, ignorados = 0;
    const pageSize = 300;
    let page = 0;

    while (true) {
      const { data: rows, error } = await sb
        .from("import_rows")
        .select("id,linha,preview")
        .eq("import_id", data.importId)
        .order("linha")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        const p = row.preview as PreviewRow | null;
        if (!p) {
          await sb.from("import_rows").update({ status: "erro", erro: "Sem prévia. Gere a prévia antes de importar." }).eq("id", row.id);
          erros++;
          continue;
        }
        const isInvalid = p.phone.phone_status === "invalido" || !p.nome || p.problemas.length > 0;
        const needsReview = ["precisa_revisao", "sem_nono_digito", "sem_ddd"].includes(p.phone.phone_status);

        if (isInvalid && data.strategy !== "all") {
          if (data.strategy === "valid_only") {
            await sb.from("import_rows").update({ status: "erro", erro: p.problemas.join("; ") || "Telefone inválido" }).eq("id", row.id);
            erros++;
            continue;
          }
        }

        const dup = p.dup;
        const payload: Record<string, unknown> = {
          nome: p.nome,
          phone_raw: p.phone.phone_original,
          email: p.email,
          origem: "import" as const,
          consentimento_whatsapp: data.consentimentoWhatsapp,
          tipo: data.tipo,
          phone_status: isInvalid
            ? "invalido"
            : needsReview
              ? (p.phone.phone_status === "sem_nono_digito" ? "sem_nono_digito" : "precisa_revisao")
              : dup
                ? "duplicado_possivel"
                : "valido",
          lifecycle_status: isInvalid
            ? "telefone_invalido"
            : dup && dup.match !== "forte"
              ? "duplicado_possivel"
              : "importado_aguardando_recadastro",
          created_by: context.userId,
        };

        if (dup && dup.match === "forte") {
          // Non-destructive merge
          const { data: existing } = await sb.from("contacts").select("*").eq("id", dup.contact_id).single();
          if (existing) {
            const merge: Record<string, unknown> = {};
            const fillIfEmpty = (key: string, value: unknown) => {
              if (value != null && (existing as Record<string, unknown>)[key] == null) merge[key] = value;
            };
            fillIfEmpty("nome", p.nome);
            fillIfEmpty("email", p.email);
            fillIfEmpty("phone_raw", p.phone.phone_original);
            await sb.from("contacts").update(merge as never).eq("id", dup.contact_id);
            await sb.from("import_rows").update({ status: "duplicado", contact_id: dup.contact_id }).eq("id", row.id);
            duplicados++;
            atualizados++;
            continue;
          }
        }

        const { data: ins, error: insErr } = await sb.from("contacts").insert(payload).select("id").single();
        if (insErr) {
          await sb.from("import_rows").update({ status: "erro", erro: insErr.message }).eq("id", row.id);
          erros++;
          continue;
        }

        if (dup && dup.match !== "forte") {
          await sb.from("contact_duplicates").insert({
            contact_a: ins.id,
            contact_b: dup.contact_id,
            match_type: dup.match,
            reason: `Importação linha ${p.linha}: telefone last8 igual`,
          });
          duplicados++;
        }

        await sb.from("import_rows").update({ status: "criado", contact_id: ins.id }).eq("id", row.id);
        criados++;
      }

      if (rows.length < pageSize) break;
      page++;
    }

    await sb
      .from("imports")
      .update({ status: "done", criados, atualizados, duplicados, erros })
      .eq("id", data.importId);

    return { criados, atualizados, duplicados, erros, ignorados };
  });

export const listImports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("imports")
      .select("id,file_name,status,total,criados,atualizados,duplicados,erros,created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return { rows: data ?? [] };
  });
