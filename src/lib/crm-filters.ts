import { z } from "zod";

export const crmFilterSchema = z.object({
  search: z.string().trim().optional(),
  cidade: z.string().trim().optional(),
  bairro: z.string().trim().optional(),
  uf: z.string().trim().length(2).optional(),
  profissao: z.string().trim().optional(),
  coletivo_alicerce: z.boolean().optional(),
  tipo_contato: z.string().optional(),
  formas_ajuda: z.array(z.string()).optional(),
  consent: z.enum(["sim", "nao"]).optional(),
  optOut: z.enum(["sim", "nao"]).optional(),
  archived: z.enum(["sim", "nao", "todos"]).default("nao"),
  phone_status: z.string().optional(),
  whatsapp_status: z.string().optional(),
  lifecycle_status: z.string().optional(),
  origem: z.string().optional(),
  origem_detalhe: z.string().optional(),
  import_id: z.string().uuid().optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
});
export type CrmFilters = z.infer<typeof crmFilterSchema>;

export function applyCrmFilters<T extends {
  ilike: (col: string, v: string) => T;
  or: (v: string) => T;
  eq: (col: string, v: unknown) => T;
  is: (col: string, v: null) => T;
  not: (col: string, op: string, v: unknown) => T;
  in: (col: string, v: unknown[]) => T;
  contains: (col: string, v: unknown) => T;
}>(q: T, f: CrmFilters): T {
  if (f.archived === "nao") q = q.is("arquivado_at", null);
  else if (f.archived === "sim") q = q.not("arquivado_at", "is", null);
  if (f.search) {
    const s = f.search.replace(/[%_,]/g, " ");
    q = q.or(`nome.ilike.%${s}%,phone_e164.ilike.%${s}%,email.ilike.%${s}%`);
  }
  if (f.cidade) q = q.ilike("cidade", `%${f.cidade}%`);
  if (f.bairro) q = q.ilike("bairro", `%${f.bairro}%`);
  if (f.uf) q = q.eq("uf", f.uf.toUpperCase());
  if (f.profissao) q = q.ilike("profissao", `%${f.profissao}%`);
  if (typeof f.coletivo_alicerce === "boolean") q = q.eq("coletivo_alicerce", f.coletivo_alicerce);
  if (f.tipo_contato) q = q.eq("tipo_contato", f.tipo_contato);
  if (f.formas_ajuda?.length) q = q.contains("formas_ajuda", f.formas_ajuda);
  if (f.consent === "sim") q = q.eq("consentimento_whatsapp", true);
  if (f.consent === "nao") q = q.eq("consentimento_whatsapp", false);
  if (f.optOut === "sim") q = q.not("opt_out_at", "is", null);
  if (f.optOut === "nao") q = q.is("opt_out_at", null);
  if (f.phone_status) q = q.eq("phone_status", f.phone_status);
  if (f.whatsapp_status) q = q.eq("whatsapp_status", f.whatsapp_status);
  if (f.lifecycle_status) q = q.eq("lifecycle_status", f.lifecycle_status);
  if (f.origem) q = q.eq("origem", f.origem);
  if (f.origem_detalhe) q = q.ilike("origem_detalhe", `%${f.origem_detalhe}%`);
  if (f.import_id) q = q.eq("import_id", f.import_id);
  return q;
}
