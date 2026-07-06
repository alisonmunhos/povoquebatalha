// Tipo canônico de papel — derivado do enum `app_role` no banco.
// Fonte única de verdade para servidor (authz.ts) e cliente (hooks).
// Nota: o valor "territorio" ainda existe no enum do banco (mantido inerte
// para não exigir recriar o tipo), mas foi descontinuado no produto — não é
// mais atribuído a ninguém nem exposto na UI.
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Exclude<Database["public"]["Enums"]["app_role"], "territorio">;

// Lista canônica dos 6 papéis ativos do produto — fonte única para validação
// (server) e para os seletores de papel (UI), evitando duplicar essa lista.
export const ALL_ROLES = [
  "admin",
  "operador",
  "leitor",
  "vrm",
  "agitador",
  "comunicacao",
] as const satisfies readonly AppRole[];

// Tipado como Record<string,...> (não Record<AppRole,...>) de propósito: é indexado
// em vários lugares com valores de string soltos vindos do banco (ex.: `roles[0]`),
// não necessariamente já estreitados para AppRole.
export const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  operador: "Operador",
  vrm: "VRM (Relacionamento)",
  comunicacao: "Comunicação",
  agitador: "Agitador",
  leitor: "Leitor",
};

// Papéis que podem ser sugeridos por um link público de auto-cadastro — "admin"
// fica de fora de propósito (não deve ser possível gerar/circular um link
// "vire admin"; esse papel só é atribuído manualmente na aprovação).
export const PUBLIC_SIGNUP_ROLES = [
  "operador",
  "leitor",
  "vrm",
  "agitador",
  "comunicacao",
] as const satisfies readonly AppRole[];
