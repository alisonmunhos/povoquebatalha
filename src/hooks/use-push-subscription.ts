import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getVapidPublicKey, subscribePush, unsubscribePush } from "@/lib/push-notifications.functions";

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

export type PushState =
  | { status: "unsupported" }
  | { status: "loading" }
  | { status: "denied" }
  | { status: "prompt" }
  | { status: "subscribed" };

export function usePushSubscription() {
  const [state, setState] = useState<PushState>({ status: "loading" });
  const getKey = useServerFn(getVapidPublicKey);
  const subscribeFn = useServerFn(subscribePush);
  const unsubscribeFn = useServerFn(unsubscribePush);

  const refresh = useCallback(async () => {
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
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const subscribe = useCallback(async () => {
    if (typeof window === "undefined") return false;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setState({ status: perm === "denied" ? "denied" : "prompt" });
      return false;
    }
    const { publicKey } = await getKey();
    if (!publicKey) throw new Error("VAPID não configurado");
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const raw = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
    const p256dh = raw.keys?.p256dh || toB64Url(sub.getKey("p256dh"));
    const auth = raw.keys?.auth || toB64Url(sub.getKey("auth"));
    await subscribeFn({
      data: {
        endpoint: sub.endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent,
      },
    });
    setState({ status: "subscribed" });
    return true;
  }, [getKey, subscribeFn]);

  const unsubscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      try { await unsubscribeFn({ data: { endpoint } }); } catch { /* ignore */ }
    }
    setState({ status: "prompt" });
  }, [unsubscribeFn]);

  return { state, subscribe, unsubscribe, refresh };
}
