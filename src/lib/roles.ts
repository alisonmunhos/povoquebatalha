// Tipo canônico de papel — derivado do enum `app_role` no banco.
// Fonte única de verdade para servidor (authz.ts) e cliente (hooks).
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
