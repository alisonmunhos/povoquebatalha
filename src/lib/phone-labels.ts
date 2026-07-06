// Rótulos amigáveis para status de telefone, cadastro e WhatsApp.
// Os valores no banco permanecem intactos — só a UI muda.

export const PHONE_STATUS_LABEL: Record<string, string> = {
  valido: "Número OK",
  precisa_revisao: "Falta DDD",
  sem_ddd: "Falta DDD",
  sem_nono_digito: "Falta 9º dígito",
  invalido: "Número inválido",
  duplicado_possivel: "Possível duplicado",
};

export const PHONE_STATUS_BADGE: Record<string, string> = {
  valido: "bg-emerald-100 text-emerald-700",
  precisa_revisao: "bg-amber-100 text-amber-800",
  sem_ddd: "bg-amber-100 text-amber-800",
  sem_nono_digito: "bg-amber-100 text-amber-800",
  invalido: "bg-red-100 text-red-700",
  duplicado_possivel: "bg-orange-100 text-orange-700",
};

export const LIFECYCLE_LABEL: Record<string, string> = {
  importado_aguardando_recadastro: "Só importado (sem cadastro)",
  link_enviado: "Link enviado",
  recadastro_iniciado: "Cadastro iniciado",
  recadastro_concluido: "Cadastro completo",
  nao_respondeu: "Não respondeu",
  telefone_invalido: "Marcado telefone inválido (manual)",
  precisa_revisao: "Precisa revisão (manual)",
  duplicado_possivel: "Possível duplicado (manual)",
  duplicado_mesclado: "Mesclado",
  nao_enviar: "Bloqueado (não enviar)",
};

export const WHATSAPP_STATUS_LABEL: Record<string, string> = {
  desconhecido: "Não verificado",
  confirmado: "Confirmado no WhatsApp",
  invalido: "Não tem WhatsApp",
  erro_envio: "Erro no envio",
  opt_out: "Opt-out",
};

// DDDs sugeridos a partir do nome da cidade (subset comum). Fallback = UF -> primeiro DDD da capital.
export const DDD_BY_CITY: Record<string, string> = {
  "sao paulo": "11", "são paulo": "11", "guarulhos": "11", "campinas": "19", "santos": "13",
  "sao bernardo do campo": "11", "são bernardo do campo": "11", "osasco": "11", "santo andre": "11", "santo andré": "11",
  "sao jose dos campos": "12", "são josé dos campos": "12", "ribeirao preto": "16", "ribeirão preto": "16",
  "sorocaba": "15", "bauru": "14", "piracicaba": "19",
  "rio de janeiro": "21", "niteroi": "21", "niterói": "21", "sao goncalo": "21", "são gonçalo": "21",
  "duque de caxias": "21", "nova iguacu": "21", "nova iguaçu": "21", "petropolis": "24", "petrópolis": "24",
  "campos dos goytacazes": "22", "volta redonda": "24", "cabo frio": "22",
  "belo horizonte": "31", "contagem": "31", "betim": "31", "juiz de fora": "32",
  "uberlandia": "34", "uberlândia": "34", "montes claros": "38", "uberaba": "34",
  "salvador": "71", "feira de santana": "75", "camacari": "71", "camaçari": "71", "vitoria da conquista": "77",
  "recife": "81", "olinda": "81", "jaboatao dos guararapes": "81", "jaboatão dos guararapes": "81", "caruaru": "81",
  "fortaleza": "85", "caucaia": "85", "juazeiro do norte": "88", "sobral": "88",
  "brasilia": "61", "brasília": "61", "goiania": "62", "goiânia": "62", "anapolis": "62", "anápolis": "62",
  "curitiba": "41", "londrina": "43", "maringa": "44", "maringá": "44", "cascavel": "45", "foz do iguacu": "45", "foz do iguaçu": "45",
  "porto alegre": "51", "caxias do sul": "54", "pelotas": "53", "canoas": "51", "santa maria": "55",
  "florianopolis": "48", "florianópolis": "48", "joinville": "47", "blumenau": "47", "chapeco": "49", "chapecó": "49",
  "vitoria": "27", "vitória": "27", "vila velha": "27", "serra": "27", "cariacica": "27",
  "manaus": "92", "belem": "91", "belém": "91", "sao luis": "98", "são luís": "98", "teresina": "86",
  "natal": "84", "joao pessoa": "83", "joão pessoa": "83", "maceio": "82", "maceió": "82", "aracaju": "79",
  "campo grande": "67", "cuiaba": "65", "cuiabá": "65", "varzea grande": "65", "várzea grande": "65",
  "porto velho": "69", "rio branco": "68", "boa vista": "95", "macapa": "96", "macapá": "96", "palmas": "63",
};

export const DDD_BY_UF: Record<string, string> = {
  AC: "68", AL: "82", AM: "92", AP: "96", BA: "71", CE: "85", DF: "61", ES: "27",
  GO: "62", MA: "98", MG: "31", MS: "67", MT: "65", PA: "91", PB: "83", PE: "81",
  PI: "86", PR: "41", RJ: "21", RN: "84", RO: "69", RR: "95", RS: "51", SC: "48",
  SE: "79", SP: "11", TO: "63",
};

const normalizeKey = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export function suggestDddFor(cidade?: string | null, uf?: string | null): string | null {
  if (cidade) {
    const key = normalizeKey(cidade);
    if (key && DDD_BY_CITY[key]) return DDD_BY_CITY[key];
  }
  if (uf) {
    const up = uf.trim().toUpperCase();
    if (DDD_BY_UF[up]) return DDD_BY_UF[up];
  }
  return null;
}

// Todos os DDDs válidos no Brasil, para dropdown manual.
export const ALL_DDDS: string[] = [
  "11","12","13","14","15","16","17","18","19",
  "21","22","24","27","28",
  "31","32","33","34","35","37","38",
  "41","42","43","44","45","46","47","48","49",
  "51","53","54","55",
  "61","62","63","64","65","66","67","68","69",
  "71","73","74","75","77","79",
  "81","82","83","84","85","86","87","88","89",
  "91","92","93","94","95","96","97","98","99",
];
