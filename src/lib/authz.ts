// Helpers de autorização por papel — usam o cliente autenticado (RLS) para checar
// papéis do usuário atual antes de operações privilegiadas via service-role.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;
type Role = "admin" | "vrm" | "operador" | "leitor" | "territorio";

async function hasAnyRole(supabase: Client, userId: string, roles: Role[]): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", roles)
    .maybeSingle();
  return Boolean(data);
}

export async function requireStaff(supabase: Client, userId: string): Promise<void> {
  const ok = await hasAnyRole(supabase, userId, ["admin", "vrm", "operador"]);
  if (!ok) throw new Error("Apenas admin/vrm/operador podem executar esta ação.");
}

export async function requireAdmin(supabase: Client, userId: string): Promise<void> {
  const ok = await hasAnyRole(supabase, userId, ["admin"]);
  if (!ok) throw new Error("Apenas administradores podem executar esta ação.");
}
