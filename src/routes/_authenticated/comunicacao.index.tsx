import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/comunicacao/")({
  beforeLoad: () => {
    throw redirect({ to: "/comunicacao/inbox" });
  },
});
