import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Megaphone } from "lucide-react";
import { listAgitationMissions } from "@/lib/agitation-missions.functions";

export const Route = createFileRoute("/_authenticated/missoes-agitacao/")({
  head: () => ({ meta: [{ title: "Missões de Agitação" }] }),
  component: MissoesAgitacaoIndex,
});

type MissionRow = {
  id: string;
  title: string;
  created_at: string;
  total: number;
  atribuidos: number;
  pendentes: number;
  concluidos: number;
};

function MissoesAgitacaoIndex() {
  const listFn = useServerFn(listAgitationMissions);
  const q = useQuery({ queryKey: ["agitation-missions"], queryFn: () => listFn() });
  const missions = (q.data?.missions ?? []) as MissionRow[];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Missões de Agitação</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Crie uma missão selecionando contatos na Gestão da Base ("Criar Missão") e depois atribua
        pacotes de contatos manualmente a um responsável, gerando um link exclusivo pra ele enviar
        as mensagens pelo WhatsApp.
      </p>

      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!q.isLoading && missions.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma missão criada ainda.</p>
      )}

      <div className="space-y-2">
        {missions.map((m) => (
          <Link
            key={m.id}
            to="/missoes-agitacao/$missionId"
            params={{ missionId: m.id }}
            className="block rounded-lg border p-4 hover:bg-muted/40 transition"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{m.title}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(m.created_at).toLocaleDateString("pt-BR")}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{m.total} contato(s)</span>
              <span>{m.atribuidos} atribuído(s)</span>
              <span>{m.total - m.atribuidos} sem atribuição</span>
              <span>{m.concluidos} concluído(s)</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
