import { z } from "zod";

// Extraído do padrão duplicado em src/routes/api/public/forms/{inscrever,recadastro,cadastro-agitador}.ts.
// Os 3 formulários existentes continuam com sua própria cópia (fora de escopo mexer neles);
// isso aqui é usado pelo motor genérico do construtor de formulários.

const buckets = new Map<string, { count: number; reset: number }>();

/** Rate-limit em memória por chave (ex.: `${slug}:${ip}`). */
export function isRateLimited(key: string, limit = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export function getRequestIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/** Campo honeypot padrão: oculto no formulário, deve chegar vazio. */
export const honeypotSchema = { hp: z.string().max(0).optional() };

export function isHoneypotTripped(hp: string | undefined): boolean {
  return Boolean(hp);
}
