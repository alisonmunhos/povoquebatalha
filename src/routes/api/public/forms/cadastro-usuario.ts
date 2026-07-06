import { createFileRoute } from "@tanstack/react-router";
import { corsOptionsResponse, getRequestIp, handleUserSignup } from "@/lib/public-user-signup.server";

// Handler genérico de auto-cadastro de usuário do sistema — aceita um `role`
// opcional no corpo (sugestão vinda do link compartilhado, ex.: ?role=vrm na
// página pública), gravado em `profiles.requested_role`. O papel de verdade só
// é atribuído depois, quando um admin aprova o cadastro em "Usuários".
export const Route = createFileRoute("/api/public/forms/cadastro-usuario")({
  server: {
    handlers: {
      OPTIONS: () => corsOptionsResponse(),
      POST: async ({ request }) =>
        handleUserSignup(request, { rateLimitKey: `cadastro-usuario:${getRequestIp(request)}` }),
    },
  },
});
