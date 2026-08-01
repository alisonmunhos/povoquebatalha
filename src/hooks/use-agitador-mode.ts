// Regra única de "modo agitação": quem só tem o papel de agitador enxerga o app
// reduzido (sem menu do sistema). Antes essa conta estava duplicada em
// AppShell.tsx e em routes/_authenticated/route.tsx.
import { useAuth, useRoles, type AppRole } from "@/hooks/use-auth";

const SYSTEM_ROLES: AppRole[] = ["admin", "operador", "vrm", "comunicacao"];

export function isAgitadorOnlyRoles(roles: AppRole[] | null): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.includes("agitador") && !roles.some((r) => SYSTEM_ROLES.includes(r));
}

/** Rotas que fazem parte do "app da Agitação". */
export const AGITACAO_PREFIXES = ["/agitacao", "/minhas-missoes", "/meu-impacto", "/minha-semana"];

export function isAgitacaoPath(path: string): boolean {
  return AGITACAO_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

export function useAgitadorMode() {
  const { user } = useAuth();
  const rolesRaw = useRoles(user?.id);
  const roles = rolesRaw ?? [];
  const isAgitadorOnly = isAgitadorOnlyRoles(rolesRaw);
  // Tem acesso a outras abas do sistema (Dashboard etc.)?
  const hasSystemAccess = roles.some((r) => SYSTEM_ROLES.includes(r));
  return { roles, rolesLoaded: rolesRaw !== null, isAgitadorOnly, hasSystemAccess };
}
