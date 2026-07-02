import { createFileRoute, redirect, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useAuth, useRoles } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: { next: location.pathname + (location.searchStr ?? "") },
      });
    }
    return { user: data.user };
  },
  component: AuthenticatedShell,
});

// Territorio-only users must stay under /territorio.
const TERRITORIO_ALLOWED_PREFIXES = ["/territorio"];

function AuthenticatedShell() {
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const roles = useRoles(user?.id);

  useEffect(() => {
    if (!roles) return;
    const isTerritorioOnly =
      roles.includes("territorio") &&
      !roles.some((r) => r === "admin" || r === "operador" || r === "vrm");
    if (!isTerritorioOnly) return;
    const allowed = TERRITORIO_ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
    if (!allowed) router.navigate({ to: "/territorio", replace: true });
  }, [roles, path, router]);

  return <AppShell />;
}
