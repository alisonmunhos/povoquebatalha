import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Origem absoluta da requisição (ex.: https://povoquebatalha.lovable.app).
 * Usada para montar URLs absolutas de og:image — robôs de pré-visualização
 * não resolvem caminhos relativos.
 */
export const getRequestOrigin = createServerFn({ method: "GET" }).handler(() => {
  try {
    const req = getRequest();
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("host");
    if (host) return `${proto}://${host}`;
  } catch {
    /* ignore */
  }
  return "https://povoquebatalha.lovable.app";
});
