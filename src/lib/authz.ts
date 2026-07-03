// Helpers de autorização por papel — usam o cliente autenticado (RLS) para checar
// papéis do usuário atual antes de operações privilegiadas via service-role.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AppRole } from "@/lib/roles";

type Client = SupabaseClient<Database>;

export async function hasRole(
  supabase: Client,
  userId: string,
  roles: AppRole[],
): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", roles)
    .maybeSingle();
  return Boolean(data);
}

export async function requireRole(
  supabase: Client,
  userId: string,
  roles: AppRole[],
  errorMsg?: string,
): Promise<void> {
  const ok = await hasRole(supabase, userId, roles);
  if (!ok) throw new Error(errorMsg ?? `Papel insuficiente. Requer: ${roles.join("/")}.`);
}

export async function requireStaff(supabase: Client, userId: string): Promise<void> {
  await requireRole(
    supabase,
    userId,
    ["admin", "vrm", "operador"],
    "Apenas admin/vrm/operador podem executar esta ação.",
  );
}

export async function requireAdmin(supabase: Client, userId: string, errorMsg?: string): Promise<void> {
  await requireRole(supabase, userId, ["admin"], errorMsg ?? "Apenas administradores podem executar esta ação.");
}

