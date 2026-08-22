// Motor dos Fluxos de cadastro pelo chat do WhatsApp (SERVER ONLY).
//
// Responsabilidades:
//  - decidir se uma mensagem recebida inicia um fluxo (palavra-chave, anúncio, 1º contato);
//  - conduzir pergunta -> resposta -> validação -> próxima pergunta, guardando o estado
//    em `whatsapp_flow_sessions`;
//  - no fim, gravar o cadastro usando exatamente a mesma rotina dos formulários públicos
//    (`saveFormContactFromAnswers`), pra origem, automações e normalizações valerem igual.
//
// Nunca importar deste arquivo no client.
import type { FormCatalogOption } from "@/lib/form-field-catalog";
import { getCatalogField } from "@/lib/form-field-catalog";
import type { FormQuestionRow } from "@/lib/public-form-contact.server";
import {
  FLOW_CANCEL_WORDS,
  FLOW_DEFAULT_PATH,
  FLOW_MULTI_DONE_ID,
  FLOW_MULTI_DONE_LABEL,
  FLOW_SKIP_WORDS,
  listRowFor,
  stepOptions,
  type Flow,
  type FlowResponseKind,
  type FlowStep,
  type FlowTriggerKind,
} from "@/lib/whatsapp-flow-shared";


type AnyRecord = Record<string, unknown>;
// O client admin é tipado no módulo gerado; aqui usamos uma forma estrutural mínima
// pra não acoplar o motor aos tipos gerados (que mudam a cada migração).
type Admin = {
  from: (table: string) => any;
  rpc: (fn: string, args?: AnyRecord) => any;
};

type SessionRow = {
  id: string;
  flow_id: string;
  contact_id: string | null;
  phone: string;
  status: string;
  current_step_index: number;
  answers: AnyRecord;
  pending_multi: string[];
  invalid_attempts: number;
  expires_at: string;
  /** Caminho (ramificação) em que a pessoa está. */
  path_key: string;
};


const ADDR_SUBSTEPS = ["cep", "endereco", "numero", "complemento", "bairro", "cidade", "uf"] as const;
type AddrSub = (typeof ADDR_SUBSTEPS)[number];

const YES_WORDS = ["sim", "s", "isso", "claro", "aceito", "autorizo", "pode", "ok", "positivo", "yes", "1"];
const NO_WORDS = ["nao", "não", "n", "negativo", "no", "2"];

function norm(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isCancel(text: string | null): boolean {
  const t = norm(text);
  return FLOW_CANCEL_WORDS.some((w) => t === w || t.startsWith(w + " "));
}

function isSkip(text: string | null): boolean {
  const t = norm(text);
  return FLOW_SKIP_WORDS.some((w) => t === w);
}

// ---------------------------------------------------------------- envio

async function sendFlowMessage(
  admin: Admin,
  args: {
    phone: string;
    contactId: string | null;
    body: string;
    buttons?: Array<{ id: string; title: string }>;
    listButtonText?: string;
    listRows?: Array<{ id: string; title: string; description?: string }>;
  },
): Promise<void> {
  const { whatsappCloud } = await import("@/integrations/whatsapp-cloud/client.server");
  let messageId: string | null = null;
  let erro: string | null = null;
  try {
    if (args.buttons?.length) {
      const r = await whatsappCloud.sendButtons(args.phone, args.body, args.buttons);
      messageId = r.messageId;
    } else if (args.listRows?.length) {
      const r = await whatsappCloud.sendList(
        args.phone,
        args.body,
        args.listButtonText ?? "Ver opções",
        [{ title: "Opções", rows: args.listRows }],
      );
      messageId = r.messageId;
    } else {
      const r = await whatsappCloud.sendText(args.phone, args.body, false);
      messageId = r.messageId;
    }
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  // Histórico no Inbox: grava sempre. Sem contato ainda, identifica pelo número
  // (to_phone) e o vínculo acontece quando o cadastro é criado.
  try {
    await admin.from("direct_messages").insert({
      contact_id: args.contactId,
      to_phone: args.contactId ? null : args.phone,
      sent_by: null,
      origem: "outro",
      conteudo: args.body,
      status: erro ? "erro" : "enviado",
      erro,
      message_id: messageId,
      endpoint_used: "whatsapp-flow",
    });
  } catch {
    /* histórico não pode derrubar o fluxo */
  }
}

/** Liga sessão e mensagens do robô ao contato assim que ele passa a existir. */
export async function linkFlowHistoryToContact(
  admin: Admin,
  phone: string,
  contactId: string,
): Promise<void> {
  try {
    await admin
      .from("direct_messages")
      .update({ contact_id: contactId, to_phone: null })
      .eq("to_phone", phone)
      .is("contact_id", null);
  } catch {
    /* não bloqueia o fluxo */
  }
  try {
    await admin
      .from("whatsapp_flow_sessions")
      .update({ contact_id: contactId })
      .eq("phone", phone)
      .is("contact_id", null);
  } catch {
    /* não bloqueia o fluxo */
  }
}

// ---------------------------------------------------------------- perguntas

function optionsWithNumbers(options: FormCatalogOption[]): string {
  return options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
}

/** Monta corpo + botões/lista da pergunta atual. */
function buildPrompt(
  step: FlowStep,
  session: SessionRow,
): { body: string; buttons?: Array<{ id: string; title: string }>; listRows?: Array<{ id: string; title: string }>; listButtonText?: string } {
  if (step.response_kind === "yes_no") {
    return {
      body: step.prompt,
      buttons: [
        { id: "sim", title: "Sim" },
        { id: "nao", title: "Não" },
        ...(step.required ? [] : [{ id: FLOW_MULTI_DONE_ID, title: "Prefiro não dizer" }]),
      ],
    };
  }

  if (step.response_kind === "address") {
    const sub = currentAddrSub(session, step.id);
    const labels: Record<AddrSub, string> = {
      cep: step.prompt,
      endereco: "Qual é o nome da sua rua/avenida?",
      numero: "Qual é o número da casa/apartamento?",
      complemento: 'Tem complemento? (bloco, apto, fundos) Se não tiver, responda "pular".',
      bairro: "Qual é o seu bairro?",
      cidade: "Qual é a sua cidade?",
      uf: "Qual é o estado? (as duas letras, ex.: RS)",
    };
    return { body: labels[sub] };
  }

  const opts = stepOptions(step);
  if (step.response_kind === "single_choice") {
    if (opts.length <= 3) {
      return { body: step.prompt, buttons: opts.map((o) => ({ id: o.value, title: o.label })) };
    }
    const rows = opts.slice(0, 10).map((o) => ({ id: o.value, title: o.label }));
    return {
      body: `${step.prompt}\n\n${optionsWithNumbers(opts)}\n\nToque em "Ver opções" ou responda com o número.`,
      listRows: rows,
      listButtonText: "Ver opções",
    };
  }

  if (step.response_kind === "multi_choice") {
    const chosen = session.pending_multi ?? [];
    const remaining = opts.filter((o) => !chosen.includes(o.value));
    const chosenLabels = opts.filter((o) => chosen.includes(o.value)).map((o) => o.label);
    const header = chosenLabels.length
      ? `Já anotei: ${chosenLabels.join(", ")}.\nQuer marcar mais alguma? Se terminou, toque em "${FLOW_MULTI_DONE_LABEL}".`
      : `${step.prompt}\nPode escolher uma por vez — quando terminar, toque em "${FLOW_MULTI_DONE_LABEL}".`;
    const rows = [
      ...remaining.slice(0, 9).map((o) => ({ id: o.value, title: o.label })),
      { id: FLOW_MULTI_DONE_ID, title: FLOW_MULTI_DONE_LABEL },
    ];
    return {
      body: `${header}\n\n${optionsWithNumbers(remaining)}`,
      listRows: rows,
      listButtonText: "Ver opções",
    };
  }

  const suffix = step.required ? "" : '\n\n(Se preferir não responder, escreva "pular".)';
  return { body: `${step.prompt}${suffix}` };
}

function currentAddrSub(session: SessionRow, stepId: string): AddrSub {
  const meta = session.answers[`__addr__${stepId}`] as { sub?: AddrSub } | undefined;
  return meta?.sub ?? "cep";
}

// ---------------------------------------------------------------- resposta

/** Extrai o id do botão/linha escolhida, quando a mensagem é interativa. */
function interactiveReplyId(message: AnyRecord | null): string | null {
  if (!message) return null;
  const inter = message.interactive as AnyRecord | undefined;
  if (!inter) return null;
  const br = inter.button_reply as AnyRecord | undefined;
  const lr = inter.list_reply as AnyRecord | undefined;
  const id = (br?.id ?? lr?.id) as string | undefined;
  return typeof id === "string" && id ? id : null;
}

/** Casa a resposta escrita com uma das opções (por número ou pelo texto). */
function matchOption(text: string | null, options: FormCatalogOption[]): string | null {
  const t = norm(text);
  if (!t) return null;
  const asNumber = Number(t);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) {
    return options[asNumber - 1]!.value;
  }
  const exact = options.find((o) => norm(o.label) === t || norm(o.value) === t);
  if (exact) return exact.value;
  const partial = options.filter((o) => norm(o.label).includes(t));
  return partial.length === 1 ? partial[0]!.value : null;
}

// ---------------------------------------------------------------- fluxo principal

export type FlowInboundInput = {
  admin: Admin;
  phone: string;
  contactId: string | null;
  /** Objeto `messages[i]` bruto da Cloud API (para respostas interativas). */
  message: AnyRecord | null;
  /** Texto já extraído (nulo para mídia). */
  text: string | null;
  /** `referral` do Click-to-WhatsApp, quando houver. */
  referral: AnyRecord | null;
};

/** Retorna true quando a mensagem foi consumida por um fluxo. */
export async function handleFlowInbound(input: FlowInboundInput): Promise<boolean> {
  const { admin, phone } = input;

  const { data: openSession } = await admin
    .from("whatsapp_flow_sessions")
    .select("*")
    .eq("phone", phone)
    .in("status", ["opening", "running", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let session = (openSession ?? null) as SessionRow | null;

  if (session && new Date(session.expires_at).getTime() < Date.now()) {
    await admin
      .from("whatsapp_flow_sessions")
      .update({ status: "abandoned" })
      .eq("id", session.id);
    session = null;
  }

  // O contato pode ter nascido depois do disparo: liga o histórico já existente.
  if (input.contactId && (!session || !session.contact_id)) {
    await linkFlowHistoryToContact(admin, phone, input.contactId);
    if (session) session = { ...session, contact_id: input.contactId };
  }



  if (session) {
    if (isCancel(input.text)) {
      await admin.from("whatsapp_flow_sessions").update({ status: "declined" }).eq("id", session.id);
      await sendFlowMessage(admin, {
        phone,
        contactId: session.contact_id ?? input.contactId,
        body: "Tudo bem, encerrei o cadastro por aqui. Se quiser retomar depois, é só mandar uma mensagem. 💜",
      });
      return true;
    }
    await advanceSession(input, session);
    return true;
  }

  return await maybeStartFlow(input);
}

async function loadSteps(admin: Admin, flowId: string): Promise<FlowStep[]> {
  const { data } = await admin
    .from("whatsapp_flow_steps")
    .select("*")
    .eq("flow_id", flowId)
    .order("order_index", { ascending: true });
  return ((data ?? []) as FlowStep[]).map((s) => ({ ...s, options: (s.options ?? []) as FormCatalogOption[] }));
}

async function maybeStartFlow(input: FlowInboundInput): Promise<boolean> {
  const { admin, phone, text, referral } = input;

  const { data: flowsData } = await admin
    .from("whatsapp_flows")
    .select("*")
    .eq("active", true)
    .order("priority", { ascending: false });
  const flows = (flowsData ?? []) as Flow[];
  if (!flows.length) return false;

  const adId =
    (referral?.["source_id"] as string | undefined) ??
    (referral?.["ctwa_clid"] as string | undefined) ??
    null;

  let isFirstContact: boolean | null = null;
  const checkFirstContact = async () => {
    if (isFirstContact !== null) return isFirstContact;
    const { count } = await admin
      .from("inbound_messages")
      .select("id", { count: "exact", head: true })
      .eq("from_phone", phone);
    // A mensagem atual já foi gravada antes de chegar aqui.
    isFirstContact = (count ?? 0) <= 1;
    return isFirstContact;
  };

  let chosen: { flow: Flow; trigger: FlowTriggerKind } | null = null;
  for (const flow of flows) {
    const t = norm(text);
    const keywordHit =
      !!t && flow.trigger_keywords.some((k) => {
        const kk = norm(k);
        return kk.length > 0 && (t === kk || t.includes(kk));
      });
    if (keywordHit) {
      chosen = { flow, trigger: "keyword" };
      break;
    }
    if (flow.trigger_on_ad && referral) {
      const idOk = flow.trigger_ad_ids.length === 0 || (adId != null && flow.trigger_ad_ids.includes(adId));
      if (idOk) {
        chosen = { flow, trigger: "ad" };
        break;
      }
    }
    if (flow.trigger_on_first_contact && (await checkFirstContact())) {
      chosen = { flow, trigger: "first_contact" };
      break;
    }
  }

  if (!chosen) return false;

  // Já cadastrado e o fluxo não atualiza quem já existe: não incomoda.
  if (input.contactId && !chosen.flow.allow_update_existing) {
    const { data: contact } = await admin
      .from("contacts")
      .select("lifecycle_status")
      .eq("id", input.contactId)
      .maybeSingle();
    if ((contact as { lifecycle_status?: string } | null)?.lifecycle_status === "recadastro_concluido") {
      return false;
    }
  }

  const steps = await loadSteps(admin, chosen.flow.id);
  if (!steps.length) return false;

  const { data: created } = await admin
    .from("whatsapp_flow_sessions")
    .insert({
      flow_id: chosen.flow.id,
      contact_id: input.contactId,
      phone,
      status: "running",
      current_step_index: 0,
      trigger_kind: chosen.trigger,
      ad_referral: referral,
      last_prompt_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  const session = created as SessionRow | null;
  if (!session) return false;

  await sendFlowMessage(admin, {
    phone,
    contactId: input.contactId,
    body: chosen.flow.opening_message,
  });
  await askStep(admin, session, steps[0]!, input.contactId);
  return true;
}

/**
 * Início manual de um fluxo (teste ou disparo pela equipe): encerra sessões
 * abertas do número, cria uma nova e manda abertura + 1ª pergunta.
 * Só funciona dentro da janela de 24h da Meta (a pessoa precisa ter falado antes).
 */
export async function startFlowManually(args: {
  admin: Admin;
  flowId: string;
  phone: string;
  contactId: string | null;
}): Promise<{ ok: true }> {
  const { admin, flowId, phone, contactId } = args;

  const { data: flowData } = await admin
    .from("whatsapp_flows")
    .select("*")
    .eq("id", flowId)
    .maybeSingle();
  const flow = flowData as Flow | null;
  if (!flow) throw new Error("Fluxo não encontrado.");

  const steps = await loadSteps(admin, flowId);
  if (!steps.length) throw new Error("Este fluxo ainda não tem perguntas.");

  await admin
    .from("whatsapp_flow_sessions")
    .update({ status: "abandoned" })
    .eq("phone", phone)
    .in("status", ["opening", "running", "paused"]);

  const { data: created } = await admin
    .from("whatsapp_flow_sessions")
    .insert({
      flow_id: flowId,
      contact_id: contactId,
      phone,
      status: "running",
      current_step_index: 0,
      trigger_kind: "manual",
      last_prompt_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  const session = created as SessionRow | null;
  if (!session) throw new Error("Não consegui abrir a sessão do fluxo.");

  await sendFlowMessage(admin, { phone, contactId, body: flow.opening_message });
  await askStep(admin, session, steps[0]!, contactId);
  return { ok: true };
}

async function askStep(
  admin: Admin,
  session: SessionRow,
  step: FlowStep,
  contactId: string | null,
): Promise<void> {
  const prompt = buildPrompt(step, session);
  await sendFlowMessage(admin, {
    phone: session.phone,
    contactId: session.contact_id ?? contactId,
    body: prompt.body,
    buttons: prompt.buttons,
    listRows: prompt.listRows,
    listButtonText: prompt.listButtonText,
  });
  await admin
    .from("whatsapp_flow_sessions")
    .update({ last_prompt_at: new Date().toISOString(), invalid_attempts: 0 })
    .eq("id", session.id);
}

async function advanceSession(input: FlowInboundInput, session: SessionRow): Promise<void> {
  const { admin } = input;
  const steps = await loadSteps(admin, session.flow_id);
  const step = steps[session.current_step_index];
  if (!step) {
    await finishSession(input, session, steps);
    return;
  }

  const replyId = interactiveReplyId(input.message);
  const answers: AnyRecord = { ...session.answers };
  let pendingMulti = [...(session.pending_multi ?? [])];
  let moveOn = true;

  const invalid = async (msg: string) => {
    const attempts = (session.invalid_attempts ?? 0) + 1;
    await admin
      .from("whatsapp_flow_sessions")
      .update({ invalid_attempts: attempts })
      .eq("id", session.id);
    await sendFlowMessage(admin, {
      phone: session.phone,
      contactId: session.contact_id ?? input.contactId,
      body: msg,
    });
    if (attempts >= 3 && !step.required) {
      // Não trava a pessoa numa pergunta opcional.
      await admin
        .from("whatsapp_flow_sessions")
        .update({ current_step_index: session.current_step_index + 1, invalid_attempts: 0 })
        .eq("id", session.id);
      const next = steps[session.current_step_index + 1];
      if (next) {
        await askStep(admin, { ...session, current_step_index: session.current_step_index + 1, answers, pending_multi: [] }, next, input.contactId);
      } else {
        await finishSession(input, { ...session, answers }, steps);
      }
    }
  };

  const skipRequested = isSkip(input.text) || replyId === FLOW_MULTI_DONE_ID;

  // ---- endereço: sequência interna de sub-perguntas
  if (step.response_kind === "address") {
    const metaKey = `__addr__${step.id}`;
    const meta = (answers[metaKey] as { sub?: AddrSub; data?: AnyRecord } | undefined) ?? {};
    const sub: AddrSub = meta.sub ?? "cep";
    const data: AnyRecord = { ...(meta.data ?? {}) };
    const raw = (input.text ?? "").trim();
    let nextSub: AddrSub | null = null;

    if (skipRequested && sub === "cep") {
      answers[step.id] = data;
      answers[metaKey] = { sub: "cep", data };
    } else if (sub === "cep") {
      const digits = raw.replace(/\D/g, "");
      if (digits.length !== 8) {
        await invalid('Não reconheci esse CEP. Manda só os 8 números, ex.: 90000000. Se não souber, escreva "pular".');
        return;
      }
      const { lookupCep } = await import("@/lib/cep.server");
      const found = await lookupCep(digits);
      data.cep = digits;
      if (found) {
        data.endereco = found.endereco ?? undefined;
        data.bairro = found.bairro ?? undefined;
        data.cidade = found.cidade ?? undefined;
        data.uf = found.uf ?? undefined;
        await sendFlowMessage(admin, {
          phone: session.phone,
          contactId: session.contact_id ?? input.contactId,
          body: `Achei: ${[found.endereco, found.bairro, found.cidade, found.uf].filter(Boolean).join(", ")}.`,
        });
        nextSub = found.endereco ? "numero" : "endereco";
      } else {
        nextSub = "endereco";
      }
    } else if (sub === "complemento") {
      if (!skipRequested && raw && raw !== "-") data.complemento = raw;
      nextSub = data.bairro ? (data.cidade ? (data.uf ? null : "uf") : "cidade") : "bairro";
    } else {
      if (!raw && step.required) {
        await invalid("Preciso dessa informação pra completar o endereço. Pode escrever?");
        return;
      }
      if (raw) data[sub] = sub === "uf" ? raw.toUpperCase().slice(0, 2) : raw;
      const order: AddrSub[] = ["endereco", "numero", "complemento", "bairro", "cidade", "uf"];
      const idx = order.indexOf(sub);
      nextSub = order.slice(idx + 1).find((s) => !data[s]) ?? null;
      if (sub === "endereco") nextSub = "numero";
    }

    if (nextSub) {
      answers[metaKey] = { sub: nextSub, data };
      await admin.from("whatsapp_flow_sessions").update({ answers }).eq("id", session.id);
      await askStep(admin, { ...session, answers }, step, input.contactId);
      return;
    }
    answers[step.id] = data;
    answers[metaKey] = { sub: "cep", data };
  }
  // ---- sim/não
  else if (step.response_kind === "yes_no") {
    if (replyId === "sim" || replyId === "nao") {
      answers[step.id] = replyId === "sim";
    } else if (skipRequested && !step.required) {
      moveOn = true;
    } else {
      const t = norm(input.text);
      if (YES_WORDS.includes(t)) answers[step.id] = true;
      else if (NO_WORDS.includes(t)) answers[step.id] = false;
      else {
        await invalid('Não entendi. Responda "sim" ou "não", por favor.');
        return;
      }
    }
    if (step.required && answers[step.id] !== true && step.catalog_field_key.startsWith("consentimento")) {
      await sendFlowMessage(admin, {
        phone: session.phone,
        contactId: session.contact_id ?? input.contactId,
        body: "Sem essa autorização eu não consigo concluir o cadastro. Se mudar de ideia, é só me chamar de novo. 💜",
      });
      await admin.from("whatsapp_flow_sessions").update({ status: "declined", answers }).eq("id", session.id);
      return;
    }
  }
  // ---- escolha única
  else if (step.response_kind === "single_choice") {
    const opts = stepOptions(step);
    const value = replyId && replyId !== FLOW_MULTI_DONE_ID ? replyId : matchOption(input.text, opts);
    if (!value) {
      if (skipRequested && !step.required) {
        // segue sem responder
      } else {
        await invalid("Não achei essa opção. Responda com o número da opção da lista.");
        return;
      }
    } else {
      answers[step.id] = value;
    }
  }
  // ---- múltipla escolha (rodadas)
  else if (step.response_kind === "multi_choice") {
    const opts = stepOptions(step);
    if (replyId === FLOW_MULTI_DONE_ID || isSkip(input.text) || norm(input.text) === "pronto") {
      if (pendingMulti.length) answers[step.id] = pendingMulti;
      pendingMulti = [];
    } else {
      const value = replyId ?? matchOption(input.text, opts);
      if (!value || !opts.some((o) => o.value === value)) {
        await invalid(`Não achei essa opção. Responda com o número, ou toque em "${FLOW_MULTI_DONE_LABEL}" pra seguir.`);
        return;
      }
      if (!pendingMulti.includes(value)) pendingMulti.push(value);
      const remaining = opts.filter((o) => !pendingMulti.includes(o.value));
      if (remaining.length > 0) {
        await admin
          .from("whatsapp_flow_sessions")
          .update({ pending_multi: pendingMulti, answers })
          .eq("id", session.id);
        await askStep(admin, { ...session, pending_multi: pendingMulti, answers }, step, input.contactId);
        return;
      }
      answers[step.id] = pendingMulti;
      pendingMulti = [];
    }
  }
  // ---- texto / e-mail / número / data
  else {
    const raw = (input.text ?? "").trim();
    if (skipRequested && !step.required) {
      moveOn = true;
    } else if (!raw) {
      await invalid("Não recebi nenhum texto. Pode escrever a resposta?");
      return;
    } else if (step.catalog_field_key === "whatsapp") {
      const useCurrent = YES_WORDS.includes(norm(raw));
      const candidate = useCurrent ? session.phone : raw;
      const { data: normalized } = await admin.rpc("normalize_phone_br", { input: candidate });
      if (!normalized) {
        await invalid("Esse número não parece válido. Manda com DDD, ex.: (51) 99999-9999.");
        return;
      }
      answers[step.id] = normalized as string;
    } else if (step.response_kind === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw)) {
        await invalid('Esse e-mail parece incompleto. Pode conferir? Ou escreva "pular".');
        return;
      }
      answers[step.id] = raw;
    } else if (step.response_kind === "number") {
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n)) {
        await invalid("Preciso de um número aqui. Pode responder só com números?");
        return;
      }
      answers[step.id] = String(n);
    } else {
      if (step.catalog_field_key === "nome" && raw.replace(/\s+/g, "").length < 3) {
        await invalid("Pode escrever seu nome completo, por favor?");
        return;
      }
      answers[step.id] = raw;
    }
  }

  if (!moveOn) return;

  const nextIndex = session.current_step_index + 1;
  await admin
    .from("whatsapp_flow_sessions")
    .update({ answers, pending_multi: pendingMulti, current_step_index: nextIndex, invalid_attempts: 0 })
    .eq("id", session.id);

  const next = steps[nextIndex];
  const updated: SessionRow = {
    ...session,
    answers,
    pending_multi: pendingMulti,
    current_step_index: nextIndex,
  };
  if (next) {
    await askStep(admin, updated, next, input.contactId);
    return;
  }
  await finishSession(input, updated, steps);
}

async function finishSession(
  input: FlowInboundInput,
  session: SessionRow,
  steps: FlowStep[],
): Promise<void> {
  const { admin } = input;
  const { data: flowData } = await admin
    .from("whatsapp_flows")
    .select("*")
    .eq("id", session.flow_id)
    .maybeSingle();
  const flow = flowData as Flow | null;

  const questions: FormQuestionRow[] = steps.map((s) => ({
    id: s.id,
    order_index: s.order_index,
    source: "catalog",
    catalog_field_key: s.catalog_field_key,
    label: s.prompt,
    help_text: null,
    required: false, // a validação já aconteceu na conversa
    section_id: null,
    custom_response_type: null,
    custom_options: null,
  }));

  // Garante o WhatsApp mesmo quando o roteiro não perguntou o número.
  const answers: Record<string, unknown> = {};
  for (const s of steps) {
    const value = session.answers[s.id];
    if (value == null) continue;
    const catalog = getCatalogField(s.catalog_field_key);
    if (catalog?.filterKind === "multiselect" && !Array.isArray(value)) {
      answers[s.id] = [value];
    } else {
      answers[s.id] = value;
    }
  }
  const hasWhatsappStep = steps.some((s) => s.catalog_field_key === "whatsapp");
  const syntheticPhoneId = "__phone__";
  if (!hasWhatsappStep) {
    questions.push({
      id: syntheticPhoneId,
      order_index: 999,
      source: "catalog",
      catalog_field_key: "whatsapp",
      label: "WhatsApp",
      help_text: null,
      required: false,
      section_id: null,
      custom_response_type: null,
      custom_options: null,
    });
    answers[syntheticPhoneId] = session.phone;
  }

  const { saveFormContactFromAnswers } = await import("@/lib/public-form-contact.server");
  const result = await saveFormContactFromAnswers({
    form: {
      id: session.flow_id,
      title: flow?.nome ? `WhatsApp: ${flow.nome}` : "Cadastro pelo WhatsApp",
      source_form_type: "cadastro_completo",
      tracking_name: flow?.nome ?? null,
    },
    questions,
    answers: answers as never,
    finalize: true,
  });

  const failed = "ok" in result && result.ok === false;
  const contactId = failed ? session.contact_id : (result as { contactId: string | null }).contactId;

  // Cadastro criado agora: adota as mensagens que o robô mandou antes disso.
  if (contactId) await linkFlowHistoryToContact(admin, session.phone, contactId);



  await admin
    .from("whatsapp_flow_sessions")
    .update({
      status: failed ? "paused" : "completed",
      completed_at: failed ? null : new Date().toISOString(),
      contact_id: contactId,
      answers: session.answers,
    })
    .eq("id", session.id);

  await sendFlowMessage(admin, {
    phone: session.phone,
    contactId: contactId ?? input.contactId,
    body: failed
      ? "Recebi tudo, mas deu um problema aqui pra salvar seu cadastro. Nossa equipe vai te chamar pra finalizar. 🙏"
      : (flow?.closing_message ?? "Prontinho! Seu cadastro foi feito. Obrigado por fazer parte. 💪"),
  });
}
