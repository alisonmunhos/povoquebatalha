import { supabase } from "@/integrations/supabase/client";

export type StoryEvent = "abriu" | "foto_escolhida" | "compartilhou" | "baixou";

function detectDevice(): "mobile" | "desktop" {
  try {
    if (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768) return "mobile";
  } catch {
    // ignora
  }
  return "desktop";
}

/** Registro anônimo, sem bloquear o fluxo: nunca lança erro. */
export function trackStoryEvent(event: StoryEvent) {
  try {
    void supabase
      .from("story_events")
      .insert({ event, device: detectDevice() })
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    // ignora falhas de medição
  }
}

export function trackStoryOpenOnce() {
  try {
    const key = "story_abriu_registrado";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // sem sessionStorage: registra mesmo assim
  }
  trackStoryEvent("abriu");
}
