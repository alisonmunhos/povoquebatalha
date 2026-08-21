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
    ["admin", "vrm", "operador", "comunicacao"],
    "Apenas admin/vrm/operador/comunicação podem executar esta ação.",
  );
}

export async function requireAdmin(supabase: Client, userId: string, errorMsg?: string): Promise<void> {
  await requireRole(supabase, userId, ["admin"], errorMsg ?? "Apenas administradores podem executar esta ação.");
}

// Mesma definição de "agitador exclusivo" já usada no client (route.tsx/AppShell.tsx):
// tem o papel agitador e nenhum papel de staff — usado pra restringir server-side o
// que esse papel pode editar, além do que a RLS já restringe por linha.
export async function isAgitadorOnly(supabase: Client, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as AppRole);
  return (
    roles.includes("agitador") &&
    !roles.some((r) => r === "admin" || r === "operador" || r === "vrm" || r === "comunicacao")
  );
}


// ---- Acesso ao Inbox (flag independente por usuário) ----
// Passa se o usuário já é staff (admin/vrm/operador/comunicação) OU se o perfil
// dele tem a flag `profiles.inbox_access` ligada na Central de Acesso.
export async function hasInboxAccess(supabase: Client, userId: string): Promise<boolean> {
  if (await hasRole(supabase, userId, ["admin", "vrm", "operador", "comunicacao"])) return true;
  const { data } = await supabase
    .from("profiles")
    .select("inbox_access")
    .eq("id", userId)
    .maybeSingle();
  return Boolean((data as { inbox_access?: boolean } | null)?.inbox_access);
}

export async function requireInboxAccess(supabase: Client, userId: string): Promise<void> {
  const ok = await hasInboxAccess(supabase, userId);
  if (!ok) throw new Error("Você não tem acesso ao Inbox. Peça a um administrador para liberar.");
}
