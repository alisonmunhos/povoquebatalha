import { createFileRoute } from "@tanstack/react-router";
import { corsOptionsResponse, getRequestIp, handleUserSignup } from "@/lib/public-user-signup.server";

// Wrapper fino: delega para a mesma lógica de auto-cadastro do handler genérico
// (src/lib/public-user-signup.server.ts), com o papel sempre forçado para
// "agitador" — a URL pública não muda, só o que roda por trás dela.
export const Route = createFileRoute("/api/public/forms/cadastro-agitador")({
  server: {
    handlers: {
      OPTIONS: () => corsOptionsResponse(),
      POST: async ({ request }) =>
        handleUserSignup(request, { rateLimitKey: `cadastro-agitador:${getRequestIp(request)}`, forcedRole: "agitador" }),
    },
  },
});
