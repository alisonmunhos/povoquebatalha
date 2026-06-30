import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as XLSX from "xlsx";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Field keys we map to in contacts table
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
    if (!n) {
      map[h] = "ignore";
      continue;
    }
    if (/(nome|name|completo)/.test(n)) map[h] = "nome";
    else if (/(telefone|celular|phone|whats|fone|tel|numero|mobile)/.test(n))
      map[h] = "phone_raw";
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

async function readWorkbook(
  supabase: { storage: { from: (b: string) => { download: (p: string) => Promise<{ data: Blob | null; error: unknown }> } } },
  filePath: string,
) {
  const { data, error } = await supabase.storage.from("imports").download(filePath);
  if (error || !data) throw new Error("Não foi possível ler o arquivo do storage.");
  const buf = await data.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  return rows;
}

const parseSchema = z.object({
  filePath: z.string().min(1),
  fileName: z.string().min(1),
});

export const parseUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const rows = await readWorkbook(context.supabase, data.filePath);
    if (rows.length === 0) throw new Error("Arquivo vazio.");
    const headers = Object.keys(rows[0]);
    const mapping = suggestMapping(headers);

    const { data: imp, error } = await context.supabase
      .from("imports")
      .insert({
        file_path: data.filePath,
        file_name: data.fileName,
        total: rows.length,
        mapeamento: mapping,
        status: "pending",
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;

    // Persist all raw rows for later commit
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const slice = rows.slice(i, i + chunkSize).map((r, idx) => ({
        import_id: imp.id,
        linha: i + idx + 2, // +2 = header row + 1-index
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
      sample: rows.slice(0, 5).map((r) => JSON.parse(JSON.stringify(r)) as Record<string, string>),
    };
  });

export const getImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ importId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: imp, error } = await context.supabase
      .from("imports")
      .select("*")
      .eq("id", data.importId)
      .single();
    if (error) throw error;
    const { data: rows } = await context.supabase
      .from("import_rows")
      .select("linha,raw,status,erro")
      .eq("import_id", data.importId)
      .order("linha")
      .limit(10);
    return { imp, sample: rows ?? [] };
  });

const commitSchema = z.object({
  importId: z.string().uuid(),
  mapping: z.record(z.string(), z.enum(FIELD_KEYS)),
  consentimentoWhatsapp: z.boolean().default(true),
});

export const commitImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => commitSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: imp, error: ie } = await sb
      .from("imports")
      .select("file_path")
      .eq("id", data.importId)
      .single();
    if (ie) throw ie;

    await sb
      .from("imports")
      .update({ status: "processing", mapeamento: data.mapping })
      .eq("id", data.importId);

    // Re-read in chunks via import_rows to avoid re-downloading
    const pageSize = 500;
    let page = 0;
    let criados = 0;
    let atualizados = 0;
    let duplicados = 0;
    let erros = 0;

    while (true) {
      const { data: rows, error } = await sb
        .from("import_rows")
        .select("id,linha,raw")
        .eq("import_id", data.importId)
        .order("linha")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        const raw = (row.raw ?? {}) as Record<string, unknown>;
        const fields: Record<string, string | null> = {};
        for (const [col, key] of Object.entries(data.mapping)) {
          if (key === "ignore") continue;
          const v = raw[col];
          fields[key] = v == null || v === "" ? null : String(v).trim();
        }
        const nome = fields.nome ?? null;
        const phone = fields.phone_raw ?? null;
        if (!nome || nome.length < 2) {
          await sb
            .from("import_rows")
            .update({ status: "erro", erro: "Nome ausente" })
            .eq("id", row.id);
          erros++;
          continue;
        }
        if (!phone) {
          await sb
            .from("import_rows")
            .update({ status: "erro", erro: "Telefone ausente" })
            .eq("id", row.id);
          erros++;
          continue;
        }

        // Normalize via RPC-like select — use SQL functions through .rpc not available without exposing; use raw select
        const { data: norm } = await sb
          .rpc("normalize_phone_br" as never, { input: phone } as never)
          .single();
        const phone_e164 = (norm as unknown as string) ?? null;
        if (!phone_e164) {
          await sb
            .from("import_rows")
            .update({ status: "erro", erro: "Telefone inválido" })
            .eq("id", row.id);
          erros++;
          continue;
        }

        // Dedup by phone_e164
        const { data: existing } = await sb
          .from("contacts")
          .select("id")
          .eq("phone_e164", phone_e164)
          .maybeSingle();

        const payload = {
          nome,
          phone_raw: phone,
          email: fields.email,
          cidade: fields.cidade,
          uf: fields.uf?.slice(0, 2).toUpperCase() ?? null,
          cep: fields.cep,
          endereco: fields.endereco,
          numero: fields.numero,
          bairro: fields.bairro,
          observacoes: fields.observacoes,
          origem: "import" as const,
          consentimento_whatsapp: data.consentimentoWhatsapp,
          created_by: context.userId,
        };

        if (existing) {
          await sb.from("contacts").update(payload).eq("id", existing.id);
          await sb
            .from("import_rows")
            .update({ status: "duplicado", contact_id: existing.id })
            .eq("id", row.id);
          duplicados++;
          atualizados++;
        } else {
          const { data: ins, error: insErr } = await sb
            .from("contacts")
            .insert(payload)
            .select("id")
            .single();
          if (insErr) {
            await sb
              .from("import_rows")
              .update({ status: "erro", erro: insErr.message })
              .eq("id", row.id);
            erros++;
            continue;
          }
          await sb
            .from("import_rows")
            .update({ status: "criado", contact_id: ins.id })
            .eq("id", row.id);
          criados++;
        }
      }

      if (rows.length < pageSize) break;
      page++;
    }

    await sb
      .from("imports")
      .update({
        status: "done",
        criados,
        atualizados,
        duplicados,
        erros,
      })
      .eq("id", data.importId);

    return { criados, atualizados, duplicados, erros };
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
