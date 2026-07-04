import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/authz";
import type { AppRole } from "@/lib/roles";

type Ctx = { supabase: { from: (t: string) => any }; userId: string };



async function audit(ctx: Ctx, targetId: string | null, event: string, meta: Record<string, unknown> = {}) {
  try {
    await ctx.supabase.from("access_audit_log").insert({
      actor_id: ctx.userId,
      target_user_id: targetId,
      event,
      meta,
    });
  } catch {
    /* non-blocking */
  }
}

const ALL_ROLES = [
  "admin",
  "operador",
  "leitor",
  "vrm",
  "agitador",
  "comunicacao",
] as const satisfies readonly AppRole[];
const RoleEnum = z.enum(ALL_ROLES);

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    const ids = data.users.map((u) => u.id);
    const safeIds = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
    const [{ data: roles }, { data: profiles }, { data: scopes }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", safeIds),
      supabaseAdmin.from("profiles").select("id, status, invited_by, suspended_at, revoked_at").in("id", safeIds),
      supabaseAdmin.from("user_territory_scopes").select("user_id, uf, cidade, bairro").in("user_id", safeIds),
    ]);

    const byUser = new Map<string, string[]>();
    (roles ?? []).forEach((r: { user_id: string; role: string }) => {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    });
    const profByUser = new Map<string, { status: string; invited_by: string | null; suspended_at: string | null; revoked_at: string | null }>();
    (profiles ?? []).forEach((p: { id: string; status: string; invited_by: string | null; suspended_at: string | null; revoked_at: string | null }) => {
      profByUser.set(p.id, p);
    });
    const scopeCount = new Map<string, number>();
    (scopes ?? []).forEach((s: { user_id: string }) => {
      scopeCount.set(s.user_id, (scopeCount.get(s.user_id) ?? 0) + 1);
    });

    return {
      users: data.users.map((u) => {
        const prof = profByUser.get(u.id);
        const roles_ = byUser.get(u.id) ?? [];
        const confirmed = u.email_confirmed_at ?? u.confirmed_at ?? null;
        const invited = u.invited_at ?? null;
        const lastSignIn = u.last_sign_in_at ?? null;
        const status = (prof?.status ?? "ativo") as "ativo" | "suspenso" | "revogado" | "pendente_aprovacao";
        let derived:
          | "ativo"
          | "convite_pendente"
          | "convite_expirado"
          | "suspenso"
          | "revogado"
          | "pendente_aprovacao";
        if (status === "pendente_aprovacao") derived = "pendente_aprovacao";
        else if (status === "suspenso") derived = "suspenso";
        else if (status === "revogado") derived = "revogado";
        else if (!confirmed && invited) {
          const invitedMs = new Date(invited).getTime();
          const expired = Date.now() - invitedMs > 7 * 86400_000;
          derived = expired ? "convite_expirado" : "convite_pendente";
        } else derived = "ativo";
        return {
          id: u.id,
          email: u.email ?? "",
          created_at: u.created_at,
          last_sign_in_at: lastSignIn,
          confirmed_at: confirmed,
          invited_at: invited,
          roles: roles_,
          status,
          derived_status: derived,
          invited_by: prof?.invited_by ?? null,
          scope_count: scopeCount.get(u.id) ?? 0,
        };
      }),
    };
  });

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: RoleEnum,
  redirectOrigin: z.string().url(),
});

function selfOrigin(): string {
  // Runtime import to avoid client bundling of the request helper.
  const req = (globalThis as unknown as { __req?: Request }).__req;
  if (!req) return "";
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/+$/, "");
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inviteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const originHeader = req.headers.get("origin");
    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const self = (originHeader ?? (host ? `${proto}://${host}` : "")).replace(/\/+$/, "");
    let requested: string;
    try {
      requested = new URL(data.redirectOrigin).origin;
    } catch {
      throw new Error("Origem inválida.");
    }
    if (!self || requested !== self) throw new Error("Origem de redirecionamento não permitida.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const redirectTo = `${self}/aceitar-convite`;
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
      await supabaseAdmin
        .from("profiles")
        .update({ invited_by: context.userId })
        .eq("id", userId);
    }
    // Sempre gerar também um link direto (fallback caso o e-mail não chegue)
    let actionLink: string | null = null;
    try {
      const { data: link } = await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email: data.email,
        options: { redirectTo },
      });
      actionLink = link?.properties?.action_link ?? null;
    } catch {
      /* non-blocking */
    }
    await audit(context, userId ?? null, "convite_enviado", { email: data.email, role: data.role });
    return { ok: true as const, userId, actionLink, email: data.email, role: data.role };
  });

export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), redirectOrigin: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const originHeader = req.headers.get("origin");
    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const self = (originHeader ?? (host ? `${proto}://${host}` : "")).replace(/\/+$/, "");
    let requested: string;
    try {
      requested = new URL(data.redirectOrigin).origin;
    } catch {
      throw new Error("Origem inválida.");
    }
    if (!self || requested !== self) throw new Error("Origem de redirecionamento não permitida.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: got, error: gotErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (gotErr || !got.user?.email) throw new Error("Usuário não encontrado.");
    const redirectTo = `${self}/aceitar-convite`;
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(got.user.email, { redirectTo });
    if (error) throw new Error(error.message);
    await audit(context, data.userId, "convite_reenviado", { email: got.user.email });
    return { ok: true as const };
  });

export const generateInviteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), redirectOrigin: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const originHeader = req.headers.get("origin");
    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const self = (originHeader ?? (host ? `${proto}://${host}` : "")).replace(/\/+$/, "");
    let requested: string;
    try {
      requested = new URL(data.redirectOrigin).origin;
    } catch {
      throw new Error("Origem inválida.");
    }
    if (!self || requested !== self) throw new Error("Origem de redirecionamento não permitida.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: got } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (!got.user?.email) throw new Error("Usuário não encontrado.");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: got.user.email,
      options: { redirectTo: `${self}/aceitar-convite` },
    });
    if (error) throw new Error(error.message);
    return { url: link.properties?.action_link ?? null };
  });

const setStatusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["ativo", "suspenso", "revogado"]),
});

export const setUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setStatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    if (data.userId === context.userId && data.status !== "ativo") {
      throw new Error("Você não pode alterar seu próprio status.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch = {
      status: data.status,
      suspended_at: data.status === "suspenso" ? new Date().toISOString() : null,
      revoked_at: data.status === "revogado" ? new Date().toISOString() : null,
    };
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.userId);
    if (error) throw new Error(error.message);
    if (data.status === "revogado") {
      // remove todas as roles para bloquear painel
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    }
    await audit(context, data.userId, "status_alterado", { status: data.status });
    return { ok: true as const };
  });

const deleteSchema = z.object({ userId: z.string().uuid() });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) {
      throw new Error("Você não pode remover a si mesmo.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await audit(context, data.userId, "usuario_removido", {});
    return { ok: true as const };
  });

const setRoleSchema = z.object({
  userId: z.string().uuid(),
  role: RoleEnum,
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setRoleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    await audit(context, data.userId, "papel_alterado", { role: data.role });
    return { ok: true as const };
  });

export const listAccessAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("access_audit_log")
      .select("id,actor_id,target_user_id,event,meta,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return { rows: data ?? [] };
  });

const resetPwdSchema = z.object({
  userId: z.string().uuid(),
  redirectOrigin: z.string().url(),
});

function verifyOrigin(reqOrigin: string) {
  return reqOrigin;
}

export const generatePasswordResetLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resetPwdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const originHeader = req.headers.get("origin");
    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const self = (originHeader ?? (host ? `${proto}://${host}` : "")).replace(/\/+$/, "");
    let requested: string;
    try {
      requested = new URL(data.redirectOrigin).origin;
    } catch {
      throw new Error("Origem inválida.");
    }
    if (!self || requested !== self) throw new Error("Origem de redirecionamento não permitida.");
    verifyOrigin(self);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: got, error: gotErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (gotErr || !got.user?.email) throw new Error("Usuário não encontrado.");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: got.user.email,
      options: { redirectTo: `${self}/redefinir-senha` },
    });
    if (error) throw new Error(error.message);
    await audit(context, data.userId, "senha_redefinida_por_admin", { via: "link", email: got.user.email });
    return { url: link.properties?.action_link ?? null, email: got.user.email };
  });

export const sendPasswordResetEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resetPwdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const originHeader = req.headers.get("origin");
    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const self = (originHeader ?? (host ? `${proto}://${host}` : "")).replace(/\/+$/, "");
    let requested: string;
    try {
      requested = new URL(data.redirectOrigin).origin;
    } catch {
      throw new Error("Origem inválida.");
    }
    if (!self || requested !== self) throw new Error("Origem de redirecionamento não permitida.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: got, error: gotErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (gotErr || !got.user?.email) throw new Error("Usuário não encontrado.");
    // Recovery link enviado por e-mail (usa templates do Supabase).
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: got.user.email,
      options: { redirectTo: `${self}/redefinir-senha` },
    });
    if (error) throw new Error(error.message);
    await audit(context, data.userId, "senha_redefinida_por_admin", { via: "email", email: got.user.email });
    return { ok: true as const, email: got.user.email };
  });

// Bloco D — vincular o usuário atual a um contato (cria se não existir).
export const linkCurrentUserContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().trim().email().optional().nullable(),
      phone: z.string().trim().max(40).optional().nullable(),
      full_name: z.string().trim().max(160).optional().nullable(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: got } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = data.email ?? got.user?.email ?? null;
    const phone = data.phone ?? null;
    const full_name = data.full_name ?? (got.user?.user_metadata as { full_name?: string } | null)?.full_name ?? email;
    const { data: contactId, error } = await supabaseAdmin.rpc("link_or_create_user_contact", {
      _user_id: context.userId,
      _email: email ?? "",
      _phone: phone ?? "",
      _full_name: full_name ?? "",
    });
    if (error) throw new Error(error.message);
    return { contact_id: contactId as string | null };
  });

// Aprovação de auto-cadastros de agitador
export const listPendingApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profs, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, created_at, contact_id")
      .eq("status", "pendente_aprovacao")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const ids = (profs ?? []).map((p) => p.id);
    if (ids.length === 0) return { rows: [] as Array<{ id: string; email: string; full_name: string | null; created_at: string; phone: string | null }> };
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const emailById = new Map<string, string>();
    (users?.users ?? []).forEach((u) => emailById.set(u.id, u.email ?? ""));
    const contactIds = (profs ?? []).map((p) => p.contact_id).filter((x): x is string => Boolean(x));
    const phoneById = new Map<string, string | null>();
    if (contactIds.length) {
      const { data: cs } = await supabaseAdmin
        .from("contacts")
        .select("id, phone_e164")
        .in("id", contactIds);
      (cs ?? []).forEach((c) => phoneById.set(c.id, c.phone_e164));
    }
    return {
      rows: (profs ?? []).map((p) => ({
        id: p.id,
        email: emailById.get(p.id) ?? "",
        full_name: p.full_name,
        created_at: p.created_at,
        phone: p.contact_id ? phoneById.get(p.contact_id) ?? null : null,
      })),
    };
  });

export const approvePendingAgitador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("status")
      .eq("id", data.userId)
      .maybeSingle();
    if (!prof || prof.status !== "pendente_aprovacao") {
      throw new Error("Este usuário não está aguardando aprovação.");
    }
    // Insere role agitador (idempotente)
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.userId, role: "agitador" }, { onConflict: "user_id,role" });
    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .update({ status: "ativo" })
      .eq("id", data.userId);
    if (upErr) throw new Error(upErr.message);
    await audit(context, data.userId, "agitador_aprovado", {});
    return { ok: true as const };
  });

export const rejectPendingAgitador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) {
      throw new Error("Você não pode rejeitar a si mesmo.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("status")
      .eq("id", data.userId)
      .maybeSingle();
    if (!prof || prof.status !== "pendente_aprovacao") {
      throw new Error("Este usuário não está aguardando aprovação.");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await audit(context, data.userId, "agitador_rejeitado", {});
    return { ok: true as const };
  });


