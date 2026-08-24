/**
 * Notificações da janela de 24h do WhatsApp (SERVER ONLY).
 *
 * Duas rotinas, chamadas pelo job agendado `inbox-window-reminders`:
 *  - warnExpiringWindows: avisa o responsável quando faltam ~4h pra fechar
 *    uma janela de uma conversa atribuída a ele.
 *  - sendDailyWindowSummary: resumo diário ("N na janela, M expirando") pra
 *    quem tem acesso ao Inbox (staff ou `profiles.inbox_access`).
 *
 * Segue o mesmo padrão de `mission-release.server.ts` / `weekly-impact.server.ts`:
 * grava em `notifications` (sino do app) e tenta push best-effort via
 * `push_subscriptions` — uma falha de push nunca derruba o job.
 */
import { WINDOW_MS, EXPIRING_MS, windowClosesAtLabel } from "@/lib/inbox-window";

type AdminClient = { from: (table: string) => any };

const STAFF_ROLES = ["admin", "vrm", "operador", "comunicacao"];
/** kind das notificações desta rotina, usado também pra deduplicar. */
const EXPIRY_KIND = "inbox_window_expiring";
const SUMMARY_KIND = "inbox_window_summary";

/** Quem tem acesso ao Inbox: papel de staff OU a flag avulsa `profiles.inbox_access`. */
async function listInboxAccessUserIds(admin: AdminClient): Promise<string[]> {
  const [{ data: roleRows }, { data: profileRows }] = await Promise.all([
    admin.from("user_roles").select("user_id").in("role", STAFF_ROLES),
    admin.from("profiles").select("id").eq("inbox_access", true),
  ]);
  const ids = new Set<string>();
  for (const r of (roleRows ?? []) as { user_id: string }[]) if (r.user_id) ids.add(r.user_id);
  for (const r of (profileRows ?? []) as { id: string }[]) if (r.id) ids.add(r.id);
  return [...ids];
}

/** Manda push best-effort para um usuário; remove a inscrição se ela expirou (410/404). */
async function pushToUser(
  admin: AdminClient,
  userId: string,
  payload: { title: string; body: string; url: string; notificationId: string; tag: string },
): Promise<void> {
  try {
    const { sendWebPush } = await import("@/lib/web-push.server");
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);
    await Promise.allSettled(
      ((subs ?? []) as { endpoint: string; p256dh: string; auth: string }[]).map(async (s) => {
        const r = await sendWebPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload);
        if (r.gone) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }),
    );
  } catch (e) {
    console.error("[inbox-window-notify] push falhou", e);
  }
}

export type WarnExpiringResult = { avisados: number; candidatas: number };

/**
 * Avisa o responsável de cada conversa atribuída cuja janela de 24h fecha em
 * até `EXPIRING_MS`. No máximo um aviso por conversa por "rodada de janela"
 * (deduplicado desde a última mensagem recebida — se a pessoa escrever de
 * novo e a janela renovar, um novo aviso pode ser mandado mais tarde).
 */
export async function warnExpiringWindows(admin: AdminClient): Promise<WarnExpiringResult> {
  const now = Date.now();
  const openSince = new Date(now - WINDOW_MS).toISOString();
  const expiringBefore = new Date(now - WINDOW_MS + EXPIRING_MS).toISOString();

  const { data: rows, error } = await admin
    .from("conversations")
    .select("id, contact_id, from_phone, assigned_to, last_inbound_at")
    .in("status", ["aberta", "aguardando"])
    .not("assigned_to", "is", null)
    .gt("last_inbound_at", openSince)
    .lte("last_inbound_at", expiringBefore);
  if (error) throw error;

  const conversations = (rows ?? []) as {
    id: string; contact_id: string | null; from_phone: string | null;
    assigned_to: string; last_inbound_at: string;
  }[];
  if (!conversations.length) return { avisados: 0, candidatas: 0 };

  const contactIds = [...new Set(conversations.map((c) => c.contact_id).filter((x): x is string => Boolean(x)))];
  const nameById = new Map<string, string>();
  if (contactIds.length) {
    const { data: contacts } = await admin.from("contacts").select("id, nome").in("id", contactIds);
    for (const c of (contacts ?? []) as { id: string; nome: string | null }[]) {
      if (c.nome) nameById.set(c.id, c.nome);
    }
  }

  let avisados = 0;
  for (const conv of conversations) {
    // Já avisamos sobre esta janela específica (desde a última mensagem dela)?
    const { data: recent } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", conv.assigned_to)
      .eq("kind", EXPIRY_KIND)
      .filter("cta_payload->>conversation_id", "eq", conv.id)
      .gte("created_at", conv.last_inbound_at)
      .limit(1);
    if (recent?.length) continue;

    const nome = (conv.contact_id && nameById.get(conv.contact_id)) || conv.from_phone || "essa pessoa";
    const closesAt = windowClosesAtLabel(conv.last_inbound_at);
    const title = "A janela de 24h está fechando";
    const body = closesAt
      ? `Responda ${nome} antes de ${closesAt} — depois disso só chega template aprovado.`
      : `Responda ${nome} logo — a janela de 24h dele(a) está fechando.`;
    const url = `/comunicacao${conv.contact_id ? `?contact=${conv.contact_id}` : ""}`;

    const { data: inserted, error: insErr } = await admin
      .from("notifications")
      .insert({
        user_id: conv.assigned_to,
        kind: EXPIRY_KIND,
        title,
        body,
        cta_kind: "link",
        cta_label: "Abrir conversa",
        cta_payload: { url, conversation_id: conv.id },
        created_by: null,
      })
      .select("id")
      .single();
    if (insErr) {
      console.error("[inbox-window-notify] falha ao criar aviso de janela expirando:", insErr.message);
      continue;
    }
    avisados++;
    if (inserted?.id) {
      await pushToUser(admin, conv.assigned_to, {
        title,
        body,
        url,
        notificationId: inserted.id as string,
        tag: `pqb-inbox-window-${inserted.id as string}`,
      });
    }
  }

  return { avisados, candidatas: conversations.length };
}

export type DailySummaryResult = { enviados: number; janela_aberta: number; janela_expirando: number };

/**
 * Resumo diário de janelas abertas/expirando para quem tem acesso ao Inbox.
 * No máximo um por pessoa por dia (mesmo que o job rode mais de uma vez).
 */
export async function sendDailyWindowSummary(admin: AdminClient): Promise<DailySummaryResult> {
  const now = Date.now();
  const windowCutoff = new Date(now - WINDOW_MS).toISOString();
  const expiringCutoff = new Date(now - WINDOW_MS + EXPIRING_MS).toISOString();

  const { data: rows, error } = await admin
    .from("conversations")
    .select("id, last_inbound_at")
    .in("status", ["aberta", "aguardando"])
    .gt("last_inbound_at", windowCutoff);
  if (error) throw error;

  const openConvs = (rows ?? []) as { id: string; last_inbound_at: string }[];
  const janela_aberta = openConvs.length;
  const janela_expirando = openConvs.filter((c) => c.last_inbound_at <= expiringCutoff).length;
  if (janela_aberta === 0) return { enviados: 0, janela_aberta, janela_expirando };

  const recipientIds = await listInboxAccessUserIds(admin);
  if (!recipientIds.length) return { enviados: 0, janela_aberta, janela_expirando };

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: already } = await admin
    .from("notifications")
    .select("user_id")
    .eq("kind", SUMMARY_KIND)
    .gte("created_at", todayStart.toISOString())
    .in("user_id", recipientIds);
  const alreadySent = new Set(((already ?? []) as { user_id: string }[]).map((r) => r.user_id));
  const targets = recipientIds.filter((id) => !alreadySent.has(id));
  if (!targets.length) return { enviados: 0, janela_aberta, janela_expirando };

  const title = "Resumo do Inbox: janela de 24h";
  const body =
    janela_expirando > 0
      ? `${janela_aberta} conversa${janela_aberta === 1 ? "" : "s"} na janela de 24h, ${janela_expirando} expirando em breve.`
      : `${janela_aberta} conversa${janela_aberta === 1 ? "" : "s"} na janela de 24h agora.`;
  const url = "/comunicacao";

  const { data: inserted, error: insErr } = await admin
    .from("notifications")
    .insert(
      targets.map((uid) => ({
        user_id: uid,
        kind: SUMMARY_KIND,
        title,
        body,
        cta_kind: "link",
        cta_label: "Abrir Inbox",
        cta_payload: { url },
        created_by: null,
      })),
    )
    .select("id, user_id");
  if (insErr) throw insErr;

  await Promise.allSettled(
    ((inserted ?? []) as { id: string; user_id: string }[]).map((n) =>
      pushToUser(admin, n.user_id, {
        title,
        body,
        url,
        notificationId: n.id,
        tag: `pqb-inbox-window-summary-${n.id}`,
      }),
    ),
  );

  return { enviados: inserted?.length ?? 0, janela_aberta, janela_expirando };
}
