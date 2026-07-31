/**
 * Mecanismo ÚNICO de arquivar/desarquivar contato.
 *
 * É usado tanto pela Gestão da Base (`archiveContact`) quanto pelo "Desfazer"
 * dentro da tela da missão. Desarquivar sempre limpa o mesmo conjunto de campos,
 * então reverter em qualquer um dos dois lugares reflete igual no outro.
 */

type MinimalClient = {
  from: (table: string) => {
    update: (values: unknown) => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
    insert: (values: unknown) => Promise<{ error: unknown }>;
    delete?: () => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
  };
};


export type ArchiveContactOptions = {
  contactId: string;
  archived: boolean;
  userId: string;
  /** Motivo do arquivamento (ex.: opt-out na missão). Ignorado ao desarquivar. */
  motivo?: string | null;
  /** Marca o contato como opt-out (não quer receber) ao arquivar. */
  optOut?: boolean;
  /** Marca o número como inválido ao arquivar (erro de número). */
  invalidPhone?: boolean;
  /** Ação registrada na auditoria. */
  auditAction?: string;
  /** Dados extras da auditoria. */
  auditChanges?: Record<string, unknown> | null;
};

export async function setContactArchived(client: MinimalClient, opts: ArchiveContactOptions) {
  const now = new Date().toISOString();

  const values: Record<string, unknown> = opts.archived
    ? {
        arquivado_at: now,
        ...(opts.optOut
          ? {
              opt_out_at: now,
              opt_out_motivo: opts.motivo ?? null,
              whatsapp_status: "opt_out",
            }
          : {}),
        ...(opts.invalidPhone
          ? {
              whatsapp_status: "invalido",
              phone_status: "invalido",
              lifecycle_status: "telefone_invalido",
            }
          : {}),
      }
    : {
        // Desarquivar é sempre a reversão completa: volta a ser um contato normal.
        arquivado_at: null,
        opt_out_at: null,
        opt_out_motivo: null,
        whatsapp_status: "desconhecido",
        phone_status: null,
        lifecycle_status: null,
      };

  const { error } = await client.from("contacts").update(values).eq("id", opts.contactId);
  if (error) throw error;

  // Desarquivar devolve o contato à triagem por swipe: apagamos as decisões
  // antigas para que ele reapareça na fila (em segmento estático e dinâmico).
  if (!opts.archived) {
    const table = client.from("segment_triage_decisions");
    if (table.delete) {
      try {
        await table.delete().eq("contact_id", opts.contactId);
      } catch {
        /* limpeza best-effort: não impede o desarquivamento */
      }
    }
  }



  const { error: auditError } = await client.from("contact_audit_log").insert({
    contact_id: opts.contactId,
    user_id: opts.userId,
    action: opts.auditAction ?? (opts.archived ? "archive" : "unarchive"),
    ...(opts.auditChanges ? { changes: opts.auditChanges } : {}),
  });
  if (auditError) throw auditError;

  return { ok: true as const };
}
