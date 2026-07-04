// Tipo canônico de papel — derivado do enum `app_role` no banco.
// Fonte única de verdade para servidor (authz.ts) e cliente (hooks).
// Nota: o valor "territorio" ainda existe no enum do banco (mantido inerte
// para não exigir recriar o tipo), mas foi descontinuado no produto — não é
// mais atribuído a ninguém nem exposto na UI.
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Exclude<Database["public"]["Enums"]["app_role"], "territorio">;
