// Jornada da campanha toda: soma de cadastros novos (formulários públicos +
// botão adicionar, sem os importados) e de mensagens enviadas em missões.
// Somente leitura — não escreve nada no banco.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TASK_STATUS } from "@/lib/agitation-task-status";

const journeySchema = z.object({
  days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(0)]).default(30),
});

export type CampaignJourney = {
  /** Cadastros por formulário público (recadastro + inscrição). */
  cadastrosFormulario: number;
  /** Cadastros feitos manualmente pelo botão adicionar. */
  cadastrosManuais: number;
  /** Soma dos dois acima (importados nunca entram). */
  cadastros: number;
  /** Mensagens enviadas em missões de agitação (confirmadas pelo agitador). */
  mensagens: number;
  /** Cadastros + mensagens. */
  conexoes: number;
  /** Quantos importados existem no período — só como referência, fora da conta. */
  importadosIgnorados: number;
};

export const getCampaignJourney = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => journeySchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<CampaignJourney> => {
    const since =
      data.days > 0
        ? new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString()
        : null;

    const countContacts = async (origens: string[]) => {
      let q = context.supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .in("origem", origens)
        .eq("is_system_user", false);
      if (since) q = q.gte("created_at", since);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    };

    const countImported = async () => {
      let q = context.supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("origem", "import");
      if (since) q = q.gte("created_at", since);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    };

    const countSentTasks = async () => {
      let q = context.supabase
        .from("agitation_tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", TASK_STATUS.ENVIADO);
      if (since) q = q.gte("completed_at", since);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    };

    const [cadastrosFormulario, cadastrosManuais, mensagens, importadosIgnorados] =
      await Promise.all([
        countContacts(["recadastro", "inscricao"]),
        countContacts(["manual"]),
        countSentTasks(),
        countImported(),
      ]);

    const cadastros = cadastrosFormulario + cadastrosManuais;
    return {
      cadastrosFormulario,
      cadastrosManuais,
      cadastros,
      mensagens,
      conexoes: cadastros + mensagens,
      importadosIgnorados,
    };
  });
