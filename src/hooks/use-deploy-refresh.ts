// Auto-refresh quando um novo deploy é publicado.
//
// Como funciona:
// - No mount, faz um HEAD em `/` (mesmo origin) e lê o cabeçalho
//   `x-deployment-id` que a hospedagem (Cloudflare/Lovable) envia por deploy.
//   Esse é o identificador do build atualmente carregado pela aba.
// - A cada 60s e sempre que a aba volta a ficar visível (visibilitychange),
//   refaz o HEAD e compara. Se mudou, agenda um reload.
// - Para não recarregar no meio de alguém digitando: só recarrega
//   imediatamente quando o gatilho é "aba voltou a ficar visível"
//   (cenário típico: pessoa saiu pro WhatsApp e voltou). Nos check-ups
//   periódicos em foreground, só recarrega se a pessoa está ociosa
//   (sem digitar/clicar há pelo menos 30s).
import { useEffect } from "react";

const CHECK_INTERVAL_MS = 60_000;
const IDLE_THRESHOLD_MS = 30_000;

async function fetchDeploymentId(): Promise<string | null> {
  try {
    const res = await fetch("/", { method: "HEAD", cache: "no-store" });
    return res.headers.get("x-deployment-id");
  } catch {
    return null;
  }
}

export function useDeployRefresh() {
  useEffect(() => {
    let currentId: string | null = null;
    let cancelled = false;
    let lastInteractionAt = Date.now();

    const markInteraction = () => {
      lastInteractionAt = Date.now();
    };
    const interactionEvents: (keyof DocumentEventMap)[] = [
      "keydown",
      "input",
      "pointerdown",
      "touchstart",
    ];
    interactionEvents.forEach((ev) =>
      document.addEventListener(ev, markInteraction, { passive: true }),
    );

    const check = async (reason: "interval" | "visibility") => {
      const latest = await fetchDeploymentId();
      if (cancelled || !latest) return;
      if (currentId == null) {
        currentId = latest;
        return;
      }
      if (latest === currentId) return;
      // Nova versão detectada.
      if (reason === "visibility") {
        window.location.reload();
        return;
      }
      // Intervalo em foreground: só recarrega se ocioso.
      const idleFor = Date.now() - lastInteractionAt;
      if (idleFor >= IDLE_THRESHOLD_MS) {
        window.location.reload();
      }
      // Senão, tenta de novo no próximo tick — currentId permanece
      // no valor antigo pra continuar detectando "diferente".
    };

    // Captura o id inicial.
    void fetchDeploymentId().then((id) => {
      if (!cancelled) currentId = id;
    });

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void check("interval");
    }, CHECK_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void check("visibility");
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
      interactionEvents.forEach((ev) =>
        document.removeEventListener(ev, markInteraction),
      );
    };
  }, []);
}
