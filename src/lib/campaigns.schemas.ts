import { z } from "zod";
import { crmFilterSchema } from "@/lib/crm-filters";

export const campaignInput = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().min(1).max(160),
  descricao: z.string().max(500).optional().nullable(),
  tipo: z.enum(["text", "image", "document", "link"]).default("text"),
  mensagem_template: z.string().min(1).max(4000),
  template_id: z.string().uuid().optional().nullable(),
  // Template Oficial (Meta) — só usado pra contatos fora da janela de 24h.
  // Não confundir com template_id acima (message_templates, texto livre).
  whatsapp_template_id: z.string().uuid().optional().nullable(),
  midia_url: z.string().url().optional().nullable(),
  midia_path: z.string().max(500).optional().nullable(),
  midia_filename: z.string().max(200).optional().nullable(),
  midia_mime: z.string().max(120).optional().nullable(),
  midia_caption: z.string().max(500).optional().nullable(),
  segment_id: z.string().uuid().optional().nullable(),
  filtro_adhoc: crmFilterSchema.partial().optional(),
  audience_ids: z.array(z.string().uuid()).max(20000).optional().nullable(),
  agendado_para: z.string().datetime().optional().nullable(),
  delay_min_ms: z.number().int().min(500).max(60000).default(1500),
  delay_max_ms: z.number().int().min(500).max(120000).default(4000),
  link_url: z.string().url().optional().nullable(),
  link_title: z.string().max(2000).transform((value) => value.slice(0, 300)).optional().nullable(),
  link_description: z.string().max(4000).transform((value) => value.slice(0, 600)).optional().nullable(),
  link_image: z.string().url().optional().nullable(),
});

export const audienceInputSchema = z.object({
  ids: z.array(z.string().uuid()).max(20000).optional(),
  filters: crmFilterSchema.partial().optional(),
});

export const createFromSelectionSchema = z.object({
  nome: z.string().trim().min(1).max(160),
  ids: z.array(z.string().uuid()).max(20000).optional(),
  filters: crmFilterSchema.partial().optional(),
  template_id: z.string().uuid().optional().nullable(),
  mensagem_template: z.string().min(1).max(4000),
  tipo: z.enum(["text", "image", "document", "link"]).default("text"),
  midia_path: z.string().max(500).optional().nullable(),
  midia_filename: z.string().max(200).optional().nullable(),
  midia_mime: z.string().max(120).optional().nullable(),
  agendado_para: z.string().datetime().optional().nullable(),
  delay_min_ms: z.number().int().min(500).max(60000).default(1500),
  delay_max_ms: z.number().int().min(500).max(120000).default(4000),
  link_url: z.string().url().optional().nullable(),
  link_title: z.string().max(2000).transform((value) => value.slice(0, 300)).optional().nullable(),
  link_description: z.string().max(4000).transform((value) => value.slice(0, 600)).optional().nullable(),
  link_image: z.string().url().optional().nullable(),
  save_as_template: z.object({
    title: z.string().trim().min(2).max(120),
    category: z.string().max(60).optional(),
  }).optional(),
});