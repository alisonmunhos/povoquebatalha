import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: {
  supabase: { from: (t: string) => any };
  userId: string;
}) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Apenas administradores podem executar esta ação.");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw error;
    const ids = data.users.map((u) => u.id);
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const byUser = new Map<string, string[]>();
    (roles ?? []).forEach((r: { user_id: string; role: string }) => {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    });
    return {
      users: data.users.map((u) => ({
        id: u.id,
        email: u.email ?? "",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        confirmed_at: u.email_confirmed_at ?? u.confirmed_at ?? null,
        invited_at: u.invited_at ?? null,
        roles: byUser.get(u.id) ?? [],
      })),
    };
  });

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["admin", "operador", "leitor"]),
  redirectOrigin: z.string().url(),
});

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inviteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const originHeader = req.headers.get("origin");
    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const selfOrigin = (originHeader ?? (host ? `${proto}://${host}` : "")).replace(/\/+$/, "");
    let requested: string;
    try {
      requested = new URL(data.redirectOrigin).origin;
    } catch {
      throw new Error("Origem inválida.");
    }
    if (!selfOrigin || requested !== selfOrigin) {
      throw new Error("Origem de redirecionamento não permitida.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const redirectTo = `${selfOrigin}/aceitar-convite`;
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      { redirectTo },
    );
    if (error) throw new Error(error.message);
    const userId = invited.user?.id;
    if (userId) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: data.role }, { onConflict: "user_id,role" });
    }
    return { ok: true as const, userId };
  });

const deleteSchema = z.object({ userId: z.string().uuid() });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) {
      throw new Error("Você não pode remover a si mesmo.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const setRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "operador", "leitor", "vrm", "territorio"]),
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setRoleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

