import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function toB64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type PublicPushState =
  | { status: "unsupported" }
  | { status: "loading" }
  | { status: "denied" }
  | { status: "prompt" }
  | { status: "subscribed" };

export function isIosPushLimited(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function usePublicPushSubscription(contactId: string | null) {
  const [state, setState] = useState<PublicPushState>({ status: "loading" });

  const refresh = useCallback(async () => {
    if (!contactId) {
      setState({ status: "unsupported" });
      return;
    }
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState({ status: "unsupported" });
      return;
    }
    if (Notification.permission === "denied") {
      setState({ status: "denied" });
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing && Notification.permission === "granted") {
        setState({ status: "subscribed" });
      } else {
        setState({ status: "prompt" });
      }
    } catch {
      setState({ status: "prompt" });
    }
  }, [contactId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    if (!contactId) return false;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setState({ status: perm === "denied" ? "denied" : "prompt" });
      return false;
    }

    const vapidRes = await fetch("/api/public/push/vapid");
    const vapidJson = (await vapidRes.json()) as { publicKey?: string };
    if (!vapidJson.publicKey) throw new Error("Notificações não configuradas.");

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidJson.publicKey) as BufferSource,
      });
    }

    const raw = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
    const p256dh = raw.keys?.p256dh || toB64Url(sub.getKey("p256dh"));
    const auth = raw.keys?.auth || toB64Url(sub.getKey("auth"));

    const res = await fetch("/api/public/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: contactId,
        endpoint: sub.endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent,
        hp: "",
      }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) throw new Error(json.error ?? "Erro ao ativar notificações.");

    setState({ status: "subscribed" });
    return true;
  }, [contactId]);

  const unsubscribe = useCallback(async () => {
    if (!contactId || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      try {
        await fetch("/api/public/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contact_id: contactId, endpoint, hp: "" }),
        });
      } catch {
        /* ignore */
      }
    }
    setState({ status: "prompt" });
  }, [contactId]);

  return { state, subscribe, unsubscribe, refresh, isIos: isIosPushLimited() };
}
