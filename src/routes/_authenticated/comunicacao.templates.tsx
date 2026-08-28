import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota legada: os modelos aprovados pela Meta viraram uma aba de /mensagens
// (Templates oficiais) em vez de tela própria — redireciona pra lá, pra
// links salvos/favoritados pela equipe continuarem funcionando.
export const Route = createFileRoute("/_authenticated/comunicacao/templates")({
  beforeLoad: () => {
    throw redirect({ to: "/mensagens", search: { tab: "templates" }, replace: true });
  },
});
