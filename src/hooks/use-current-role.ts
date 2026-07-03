import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "operador" | "vrm" | "comunicacao" | "territorio" | "agitador" | "leitor" | null;

/**
 * Lê o papel principal do usuário logado a partir de public.user_roles.
 * Cache leve em memória por sessão do módulo.
 */
let cache: { userId: string | null; role: AppRole } | null = null;

export function useCurrentUserRole(): AppRole {
  const [role, setRole] = useState<AppRole>(cache?.role ?? null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id ?? null;
      if (cache && cache.userId === userId) {
        if (!cancelled) setRole(cache.role);
        return;
      }
      if (!userId) {
        cache = { userId: null, role: null };
        if (!cancelled) setRole(null);
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const roles = (data ?? []).map((r) => r.role as string);
      // Prioridade: admin > operador > comunicacao > vrm > territorio > agitador > leitor
      const priority: AppRole[] = ["admin", "operador", "comunicacao", "vrm", "territorio", "agitador", "leitor"];
      const found = priority.find((p) => roles.includes(p as string)) ?? null;
      cache = { userId, role: found };
      if (!cancelled) setRole(found);
    })();
    return () => { cancelled = true; };
  }, []);

  return role;
}
