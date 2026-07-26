import { useEffect, useState } from "react";
import { Download, Share, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

type BrowserKind =
  | "chrome-android"
  | "safari-ios"
  | "firefox"
  | "edge"
  | "chrome-desktop"
  | "samsung"
  | "other";

function detectBrowser(): BrowserKind {
  if (typeof window === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;
  if (isIOS) return "safari-ios";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Edg\//i.test(ua)) return "edge";
  if (/Firefox\//i.test(ua)) return "firefox";
  if (/Android/i.test(ua) && /Chrome\//i.test(ua)) return "chrome-android";
  if (/Chrome\//i.test(ua)) return "chrome-desktop";
  return "other";
}

// Guarda o evento em escopo de módulo pra não perder se o componente remontar.
let cachedInstallEvent: BIPEvent | null = null;
const listeners = new Set<(e: BIPEvent | null) => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    cachedInstallEvent = e as BIPEvent;
    listeners.forEach((fn) => fn(cachedInstallEvent));
  });
  window.addEventListener("appinstalled", () => {
    cachedInstallEvent = null;
    listeners.forEach((fn) => fn(null));
  });
}

type Variant = "card" | "chip";

export function InstallAppButton({ variant = "chip" }: { variant?: Variant }) {
  const [installEvent, setInstallEvent] = useState<BIPEvent | null>(
    cachedInstallEvent,
  );
  const [isStandalone, setIsStandalone] = useState(false);
  const [browser, setBrowser] = useState<BrowserKind>("other");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    setIsStandalone(!!standalone);
    setBrowser(detectBrowser());

    const fn = (e: BIPEvent | null) => setInstallEvent(e);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  if (isStandalone) return null;

  async function handleClick() {
    if (installEvent) {
      try {
        await installEvent.prompt();
        await installEvent.userChoice;
      } catch {
        /* ignore */
      }
      cachedInstallEvent = null;
      setInstallEvent(null);
      return;
    }
    setModalOpen(true);
  }

  const button =
    variant === "card" ? (
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90"
      >
        <Download className="h-4 w-4" />
        {installEvent ? "Instalar agora" : "Instalar app"}
      </button>
    ) : (
      <button
        type="button"
        onClick={handleClick}
        title="Instalar app"
        aria-label="Instalar app"
        className="inline-flex items-center gap-1.5 rounded-md border-2 border-foreground bg-primary text-primary-foreground px-2.5 py-1 text-xs font-semibold hover:opacity-90"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Instalar app</span>
      </button>
    );

  return (
    <>
      {button}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Instalar Povo que Batalha</DialogTitle>
            <DialogDescription>
              Siga o passo a passo pro seu navegador. Depois de instalado, o app
              abre direto do ícone na tela inicial.
            </DialogDescription>
          </DialogHeader>
          <InstructionsForBrowser browser={browser} />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90"
            >
              Entendi
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold inline-flex items-center justify-center">
        {n}
      </span>
      <div className="text-sm leading-relaxed pt-0.5">{children}</div>
    </li>
  );
}

function InstructionsForBrowser({ browser }: { browser: BrowserKind }) {
  if (browser === "safari-ios") {
    return (
      <ol className="space-y-3 mt-2">
        <Step n={1}>
          Toque no botão <strong>Compartilhar</strong>{" "}
          <Share className="inline h-4 w-4 align-text-bottom" /> na barra do
          Safari (embaixo da tela no iPhone).
        </Step>
        <Step n={2}>
          Role e toque em{" "}
          <strong>
            Adicionar à Tela de Início <Plus className="inline h-4 w-4 align-text-bottom" />
          </strong>
          .
        </Step>
        <Step n={3}>
          Confirme em <strong>Adicionar</strong>. Pronto, o app fica na sua tela
          inicial.
        </Step>
        <p className="text-xs text-muted-foreground pt-1">
          No iPhone só funciona pelo Safari — não use Chrome nem outro
          navegador.
        </p>
      </ol>
    );
  }
  if (browser === "chrome-android") {
    return (
      <ol className="space-y-3 mt-2">
        <Step n={1}>
          Toque no menu <strong>⋮</strong> no canto superior direito do Chrome.
        </Step>
        <Step n={2}>
          Escolha <strong>Instalar aplicativo</strong> (ou "Adicionar à tela
          inicial").
        </Step>
        <Step n={3}>Confirme. O ícone aparece na sua tela inicial.</Step>
      </ol>
    );
  }
  if (browser === "samsung") {
    return (
      <ol className="space-y-3 mt-2">
        <Step n={1}>Toque no menu <strong>☰</strong> do Samsung Internet.</Step>
        <Step n={2}>
          Escolha <strong>Adicionar página a</strong> → <strong>Tela inicial</strong>.
        </Step>
      </ol>
    );
  }
  if (browser === "firefox") {
    return (
      <ol className="space-y-3 mt-2">
        <Step n={1}>Toque no menu <strong>⋮</strong> do Firefox.</Step>
        <Step n={2}>
          Escolha <strong>Instalar</strong> ou <strong>Adicionar à tela inicial</strong>.
        </Step>
      </ol>
    );
  }
  if (browser === "edge") {
    return (
      <ol className="space-y-3 mt-2">
        <Step n={1}>
          Clique no ícone de instalação na barra de endereço (parece um monitor
          com uma seta).
        </Step>
        <Step n={2}>
          Ou abra o menu <strong>⋯</strong> → <strong>Aplicativos</strong> →{" "}
          <strong>Instalar este site como aplicativo</strong>.
        </Step>
      </ol>
    );
  }
  if (browser === "chrome-desktop") {
    return (
      <ol className="space-y-3 mt-2">
        <Step n={1}>
          Clique no ícone de instalação na barra de endereço (monitor com seta
          pra baixo).
        </Step>
        <Step n={2}>
          Ou menu <strong>⋮</strong> → <strong>Instalar Povo que Batalha</strong>.
        </Step>
      </ol>
    );
  }
  return (
    <ol className="space-y-3 mt-2">
      <Step n={1}>
        Abra o menu do seu navegador (geralmente <strong>⋮</strong> ou{" "}
        <strong>☰</strong>).
      </Step>
      <Step n={2}>
        Procure <strong>Instalar aplicativo</strong> ou{" "}
        <strong>Adicionar à tela inicial</strong>.
      </Step>
    </ol>
  );
}
