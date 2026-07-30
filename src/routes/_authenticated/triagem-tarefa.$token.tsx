// Abre uma tarefa de triagem compartilhada. Exige login (rota autenticada):
// o token só diz qual segmento triar; o acesso aos dados segue as permissões
// do usuário que entrou.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { resolveSegmentTriageShare } from "@/lib/segment-triage.functions";

export const Route = createFileRoute("/_authenticated/triagem-tarefa/$token")({
  head: () => ({ meta: [{ title: "Tarefa de triagem" }] }),
  component: TriageSharePage,
});

const REASON_TEXT: Record<string, string> = {
  nao_encontrado: "Este link de triagem não existe.",
  revogado: "Este link foi desativado por quem o criou.",
  expirado: "Este link expirou.",
  sem_acesso: "Você não tem permissão para ver este segmento. Fale com um administrador.",
};

function TriageSharePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const resolveFn = useServerFn(resolveSegmentTriageShare);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await resolveFn({ data: { token } });
        if (cancelled) return;
        if (r.ok) navigate({ to: "/triagem/$segmentId", params: { segmentId: r.segmentId }, replace: true });
        else setErro(REASON_TEXT[r.reason] ?? "Link inválido.");
      } catch (e) {
        if (!cancelled) setErro(e instanceof Error ? e.message : "Não foi possível abrir a tarefa.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="grid min-h-[60vh] place-items-center p-6 text-center">
      {erro ? (
        <div className="space-y-3">
          <p className="text-lg font-black">Não foi possível abrir a triagem</p>
          <p className="text-sm text-muted-foreground">{erro}</p>
          <Link to="/segmentos" className="text-sm font-bold text-primary hover:underline">
            Ir para Segmentos
          </Link>
        </div>
      ) : (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Abrindo a tarefa de triagem…
        </p>
      )}
    </div>
  );
}
