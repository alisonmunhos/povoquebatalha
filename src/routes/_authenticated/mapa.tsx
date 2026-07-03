import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/mapa")({
  beforeLoad: () => {
    throw redirect({ to: "/territorio" });
  },
  component: () => null,
});
