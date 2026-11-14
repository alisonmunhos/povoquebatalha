/**
 * Caminho de retorno do fluxo OAuth, validado uma única vez.
 *
 * Aceita só caminhos locais do mesmo origen, preservando busca e fragmento.
 * Rejeita caminhos de rede (//host), barras invertidas e caracteres de controle.
 */
export function oauthReturnPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return "/";
  }
  // Um origen fixo de parsing mantém a validação da busca segura durante o SSR.
  const origin = "https://app.invalid";
  try {
    const target = new URL(value, origin);
    if (target.origin !== origin || target.pathname.startsWith("//")) return "/";
    return target.pathname + target.search + target.hash;
  } catch {
    return "/";
  }
}
