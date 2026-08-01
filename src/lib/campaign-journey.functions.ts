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

export type CampaignDay = { day: string; label: string; mensagens: number; cadastros: number };

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
  /** Últimos 7 dias (para o mini-gráfico do cartão). */
  daily: CampaignDay[];
};


export const getCampaignJourney = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => journeySchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<CampaignJourney> => {
    const since =
      data.days > 0
        ? new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString()
        : null;

    type Origem = "import" | "inscricao" | "manual" | "recadastro";
    const countContacts = async (origens: Origem[]) => {
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

    // Últimos 7 dias (fuso de São Paulo) para o mini-gráfico do cartão.
    const TZ = "America/Sao_Paulo";
    const keyOf = (iso: string) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso));
    const labelOf = (d: Date) =>
      new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short" })
        .format(d)
        .replace(".", "")
        .slice(0, 3);

    const weekStart = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();

    const listContactDays = async () => {
      const { data: rows, error } = await context.supabase
        .from("contacts")
        .select("created_at")
        .in("origem", ["recadastro", "inscricao", "manual"])
        .eq("is_system_user", false)
        .gte("created_at", weekStart);
      if (error) throw error;
      return (rows ?? []).map((r) => keyOf(r.created_at as string));
    };

    const listTaskDays = async () => {
      const { data: rows, error } = await context.supabase
        .from("agitation_tasks")
        .select("completed_at")
        .eq("status", TASK_STATUS.ENVIADO)
        .gte("completed_at", weekStart);
      if (error) throw error;
      return (rows ?? [])
        .filter((r) => r.completed_at)
        .map((r) => keyOf(r.completed_at as string));
    };

    const [
      cadastrosFormulario,
      cadastrosManuais,
      mensagens,
      importadosIgnorados,
      contactDays,
      taskDays,
    ] = await Promise.all([
      countContacts(["recadastro", "inscricao"]),
      countContacts(["manual"]),
      countSentTasks(),
      countImported(),
      listContactDays(),
      listTaskDays(),
    ]);

    const daily: CampaignDay[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = keyOf(d.toISOString());
      daily.push({
        day: key,
        label: labelOf(d),
        mensagens: taskDays.filter((k) => k === key).length,
        cadastros: contactDays.filter((k) => k === key).length,
      });
    }

    const cadastros = cadastrosFormulario + cadastrosManuais;
    return {
      cadastrosFormulario,
      cadastrosManuais,
      cadastros,
      mensagens,
      conexoes: cadastros + mensagens,
      importadosIgnorados,
      daily,
    };

  });
