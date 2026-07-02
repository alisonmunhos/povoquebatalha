import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota legada: redireciona para o Inbox canônico em /comunicacao/inbox.
export const Route = createFileRoute("/_authenticated/inbox")({
  beforeLoad: () => {
    throw redirect({ to: "/comunicacao/inbox", replace: true });
  },
});
