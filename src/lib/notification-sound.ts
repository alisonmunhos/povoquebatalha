// Toca um som exclusivo do Povo que Batalha usando Web Audio API.
// 3 notas ascendentes + batida grave. Não requer arquivo.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.05);
}

/** Toca a assinatura sonora: dois toques curtos + acorde de vitória. */
export function playPqbNotificationSound() {
  const ac = getCtx();
  if (!ac) return;
  // "Batida" grave inicial
  tone(ac, 180, 0.00, 0.14, 0.35, "square");
  // 3 notas ascendentes (dó, mi, sol)
  tone(ac, 523.25, 0.16, 0.18, 0.22, "triangle");
  tone(ac, 659.25, 0.30, 0.18, 0.22, "triangle");
  tone(ac, 783.99, 0.44, 0.28, 0.28, "triangle");
  // Reforço grave final
  tone(ac, 261.63, 0.44, 0.28, 0.18, "sine");

  // Vibração se disponível (Android)
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([120, 60, 120, 60, 260]);
    }
  } catch { /* ignore */ }
}

/** Habilita o AudioContext ao primeiro gesto do usuário (obrigatório para browsers). */
export function primeNotificationAudio() {
  const ac = getCtx();
  if (ac && ac.state === "suspended") ac.resume().catch(() => {});
}
