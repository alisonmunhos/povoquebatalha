// Painel sobreposto usado no fluxo público (evento + cadastro por seções).
// No celular ocupa a tela inteira; no desktop vira um cartão centralizado.
// Sempre com cabeçalho fixo (Voltar / título / etapa) e rodapé fixo de ação.
import { useEffect, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";

export function StepOverlay({
  title,
  subtitle,
  onBack,
  onClose,
  backLabel = "Voltar",
  footer,
  onSubmit,
  children,
}: {
  title: string;
  subtitle?: string | null;
  /** Quando definido, mostra a seta de voltar no cabeçalho. */
  onBack?: () => void;
  /** Quando definido, mostra o X de fechar no canto direito. */
  onClose?: () => void;
  backLabel?: string;
  /** Conteúdo do rodapé fixo (normalmente o botão principal). */
  footer?: ReactNode;
  /** Quando definido, o painel inteiro é um <form> (para o botão do rodapé enviar). */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  // Trava a rolagem do fundo enquanto o painel estiver aberto.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Botão/gesto "voltar" do celular recua uma etapa em vez de sair da página.
  useEffect(() => {
    if (!onBack) return;
    window.history.pushState({ stepOverlay: true }, "");
    const onPop = () => onBack();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [onBack]);

  const Panel = onSubmit ? "form" : "div";

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-background/70 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <Panel
        {...(onSubmit ? { onSubmit } : {})}
        className="animate-in slide-in-from-right-4 fade-in flex h-[100dvh] w-full flex-col bg-background shadow-xl sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl sm:border"
      >
        <header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-3 py-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <span className="w-9" />
          )}
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-semibold">{title}</p>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            <span className="w-9" />
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <div
            className="shrink-0 border-t bg-background px-5 py-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            {footer}
          </div>
        )}
      </Panel>
    </div>
  );
}
