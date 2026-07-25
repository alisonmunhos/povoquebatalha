import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone } from "lucide-react";

const MAIN_SECTIONED_FORM_SLUG = "seja-um-apoiador-a-da-campanha-do-povo-que-batalha";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Campanha do Povo que Batalha" },
      {
        name: "description",
        content:
          "Faça parte da Campanha do Povo que Batalha. Cadastre-se e receba as próximas ações.",
      },
      { property: "og:title", content: "Campanha do Povo que Batalha" },
      {
        property: "og:description",
        content: "Faça parte da Campanha do Povo que Batalha. Cadastre-se e receba as próximas ações.",
      },
    ],
  }),
  ssr: false,
  component: Landing,
});

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function Landing() {
  const navigate = useNavigate();
  const [installEvent, setInstallEvent] = useState<BIPEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(!!standalone);

    const ua = window.navigator.userAgent || "";
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(iOS);

    const onBIP = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BIPEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    try {
      await installEvent.userChoice;
    } catch {
      // ignore
    }
    setInstallEvent(null);
  }

  const showInstallBlock = !isStandalone && (installEvent || isIOS);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <span className="font-semibold">Campanha do Povo que Batalha</span>
          </div>
          <Link
            to="/auth"
            className="text-sm rounded-md bg-primary text-primary-foreground px-4 py-1.5 font-medium hover:bg-primary/90 transition-colors"
          >
            Entrar
          </Link>
        </div>
      </header>
      <section className="max-w-5xl mx-auto px-6 py-20">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight max-w-3xl">
          Organize sua base e mobilize apoiadores pelo WhatsApp.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
          Faça parte da Campanha do Povo que Batalha. Cadastre-se, receba as próximas ações
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/f/$slug"
            params={{ slug: MAIN_SECTIONED_FORM_SLUG }}
            className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-medium hover:bg-primary/90"
          >
            Participar da campanha
          </Link>
        </div>
        {showInstallBlock && (
          <div className="mt-10 border rounded-xl p-5 bg-card max-w-xl">
            <h2 className="font-semibold text-base">Instalar app</h2>
            {installEvent ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Instale o app para acessar rapidamente da sua tela inicial.
                </p>
                <button
                  type="button"
                  onClick={handleInstall}
                  className="mt-3 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
                >
                  Instalar app
                </button>
              </>
            ) : isIOS ? (
              <p className="mt-1 text-sm text-muted-foreground">
                No iPhone: toque em compartilhar e depois em “Adicionar à Tela de Início”.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
