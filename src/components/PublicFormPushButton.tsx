import { Bell, BellOff, Loader2 } from "lucide-react";
import { usePublicPushSubscription } from "@/hooks/use-public-push-subscription";

export function PublicFormPushButton({ contactId }: { contactId: string }) {
  const push = usePublicPushSubscription(contactId);

  if (push.state.status === "unsupported") return null;

  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div>
        <div className="text-sm font-medium">Receber avisos da campanha</div>
        <p className="text-xs text-muted-foreground mt-1">
          Ative para receber lembretes e novidades no celular, mesmo com o navegador fechado.
        </p>
        {push.isIos && push.state.status !== "subscribed" && (
          <p className="text-xs text-amber-700 mt-2">
            No iPhone/iPad, notificações no navegador podem ser limitadas. Se não aparecer o pedido de permissão,
            adicione este site à tela inicial e tente de novo.
          </p>
        )}
      </div>

      {push.state.status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      )}

      {push.state.status === "denied" && (
        <p className="text-xs text-muted-foreground">
          Você bloqueou notificações neste navegador. Libere nas configurações do site para ativar.
        </p>
      )}

      {push.state.status === "prompt" && (
        <button
          type="button"
          onClick={async () => {
            try {
              await push.subscribe();
            } catch (e) {
              alert(e instanceof Error ? e.message : "Não foi possível ativar notificações.");
            }
          }}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
        >
          <Bell className="h-4 w-4" /> Ativar notificações
        </button>
      )}

      {push.state.status === "subscribed" && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-sm text-emerald-700">✓ Notificações ativadas neste dispositivo</span>
          <button
            type="button"
            onClick={() => push.unsubscribe()}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <BellOff className="h-3.5 w-3.5" /> Desativar notificações
          </button>
        </div>
      )}
    </div>
  );
}
