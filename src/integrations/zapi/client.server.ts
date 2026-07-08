// Z-API REST client — SERVER ONLY. Reads secrets from env at call time.
// Never import this from a route or *.functions.ts at module scope; require it
// inside a server-fn handler with `await import(...)`.

type ZapiEnv = {
  instanceId: string;
  token: string;
  clientToken: string;
};

function readEnv(): ZapiEnv {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!instanceId || !token || !clientToken) {
    throw new Error(
      "Z-API não configurada: defina ZAPI_INSTANCE_ID, ZAPI_TOKEN e ZAPI_CLIENT_TOKEN.",
    );
  }
  return { instanceId, token, clientToken };
}

function baseUrl(env: ZapiEnv) {
  return `https://api.z-api.io/instances/${env.instanceId}/token/${env.token}`;
}

async function zapiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const env = readEnv();
  const url = `${baseUrl(env)}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Client-Token", env.clientToken);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  if (!res.ok) {
    let msg = `Z-API HTTP ${res.status}`;
    if (json && typeof json === "object" && "error" in json) {
      const e = (json as Record<string, unknown>).error;
      if (typeof e === "string" && e.length > 0) msg = e;
    }
    throw new Error(msg);
  }
  return json as T;
}

export const zapi = {
  status: () =>
    zapiFetch<{ connected: boolean; smartphoneConnected?: boolean; session?: string }>(
      "/status",
    ),
  qrCodeImage: () => zapiFetch<{ value?: string }>("/qr-code/image"),
  disconnect: () => zapiFetch<{ value?: boolean }>("/disconnect", { method: "GET" }),
  sendText: (phone: string, message: string, delayMessage?: number) =>
    zapiFetch<{ zaapId?: string; messageId?: string; id?: string }>("/send-text", {
      method: "POST",
      body: JSON.stringify({ phone, message, linkPreview: true, ...(delayMessage ? { delayMessage } : {}) }),
    }),
  sendImage: (phone: string, image: string, caption?: string) =>
    zapiFetch<{ zaapId?: string; messageId?: string }>("/send-image", {
      method: "POST",
      body: JSON.stringify({ phone, image, caption }),
    }),
  // Envio de documento (PDF etc). Z-API espera /send-document/{extension}
  sendDocument: (phone: string, documentUrl: string, filename: string, extension: string) =>
    zapiFetch<{ zaapId?: string; messageId?: string }>(`/send-document/${extension}`, {
      method: "POST",
      body: JSON.stringify({ phone, document: documentUrl, fileName: filename }),
    }),
  sendAudio: (phone: string, audioUrl: string) =>
    zapiFetch<{ zaapId?: string; messageId?: string }>("/send-audio", {
      method: "POST",
      body: JSON.stringify({ phone, audio: audioUrl }),
    }),
  // Envio de link com preview forçado (título/descrição/imagem controlados).
  // Payload conforme Z-API: message, linkUrl, title, linkDescription, image, linkType.
  sendLink: (payload: {
    phone: string;
    message: string;
    linkUrl: string;
    title?: string;
    linkDescription?: string;
    image?: string;
    linkType?: string;
    delayMessage?: number;
  }) =>
    zapiFetch<{ zaapId?: string; messageId?: string; id?: string }>("/send-link", {
      method: "POST",
      body: JSON.stringify({
        phone: payload.phone,
        message: payload.message,
        linkUrl: payload.linkUrl,
        title: payload.title ?? "",
        linkDescription: payload.linkDescription ?? "",
        image: payload.image ?? "",
        linkType: payload.linkType ?? "LARGE",
        ...(payload.delayMessage ? { delayMessage: payload.delayMessage } : {}),
      }),
    }),
  // Verifica se um número existe no WhatsApp. Z-API: GET /phone-exists/{phone}
  phoneExists: (phone: string) =>
    zapiFetch<{ exists?: boolean; inputPhone?: string }>(`/phone-exists/${encodeURIComponent(phone)}`, {
      method: "GET",
    }),
  // Verificação em lote (até 50.000 números). Z-API: POST /phone-exists-batch
  phoneExistsBatch: (phones: string[]) =>
    zapiFetch<Array<{ exists?: boolean; inputPhone?: string; outputPhone?: string; lid?: string }>>(
      "/phone-exists-batch",
      { method: "POST", body: JSON.stringify({ phones }) },
    ),
};

export function hasZapiEnv(): boolean {
  return Boolean(
    process.env.ZAPI_INSTANCE_ID && process.env.ZAPI_TOKEN && process.env.ZAPI_CLIENT_TOKEN,
  );
}
