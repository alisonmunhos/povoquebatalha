import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lê a flag `profiles.inbox_access` do usuário logado — liberação avulsa de
 * acesso ao Inbox, independente do papel (role) que a pessoa tem.
 */
let cache: { userId: string | null; value: boolean } | null = null;

/** Versão que também informa se a leitura da flag já terminou. */
export function useInboxAccessState(): { flag: boolean; loaded: boolean } {
  const [flag, setFlag] = useState<boolean>(cache?.value ?? false);
  const [loaded, setLoaded] = useState<boolean>(cache !== null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id ?? null;
      if (cache && cache.userId === userId) {
        if (!cancelled) { setFlag(cache.value); setLoaded(true); }
        return;
      }
      if (!userId) {
        cache = { userId: null, value: false };
        if (!cancelled) { setFlag(false); setLoaded(true); }
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("inbox_access")
        .eq("id", userId)
        .maybeSingle();
      const value = Boolean((data as { inbox_access?: boolean } | null)?.inbox_access);
      cache = { userId, value };
      if (!cancelled) { setFlag(value); setLoaded(true); }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { flag, loaded };
}

export function useInboxAccessFlag(): boolean {
  return useInboxAccessState().flag;
}
