/** Sentinela para filtro "Captado por = Sistema" (formulário público Entrada de Dados). */
export const SYSTEM_CAPTURE_SENTINEL = "__SYSTEM__";

export type CaptureChannel = "formulario_publico" | "captacao_atribuida";

export const TRACKING_LABELS = {
  CADASTRO_PRESENCIAL: "Cadastro presencial",
  ATUALIZACAO_LEGADO: "Atualização (legado)",
  INSCRICAO_LEGADO: "Inscrição (legado)",
} as const;

export function buildSourceMetadata(opts: {
  qualifying?: boolean;
  capture_channel: CaptureChannel;
  tracking_label: string;
  form_definition_id?: string | null;
  via: string;
  import_id?: string;
}): Record<string, unknown> {
  return {
    qualifying: opts.qualifying ?? true,
    capture_channel: opts.capture_channel,
    tracking_label: opts.tracking_label,
    via: opts.via,
    ...(opts.form_definition_id ? { form_definition_id: opts.form_definition_id } : {}),
    ...(opts.import_id ? { import_id: opts.import_id } : {}),
  };
}

export function importSourceMetadata(importId: string): Record<string, unknown> {
  return {
    qualifying: false,
    capture_channel: "captacao_atribuida",
    tracking_label: "",
    via: "import",
    import_id: importId,
  };
}
