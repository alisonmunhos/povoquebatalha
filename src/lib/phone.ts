// Client-safe phone helpers. Mirror of private.parse_phone_br in SQL.

export type PhoneStatus =
  | "valido"
  | "precisa_revisao"
  | "invalido"
  | "sem_ddd"
  | "sem_nono_digito"
  | "duplicado_possivel";

export type ParsedPhone = {
  phone_original: string;
  phone_digits: string;
  phone_ddi: string | null;
  phone_ddd: string | null;
  phone_e164: string | null;
  phone_last8: string | null;
  phone_last9: string | null;
  phone_whatsapp_candidate: string | null;
  phone_status: PhoneStatus;
};

export function onlyDigits(s: string): string {
  return (s ?? "").replace(/\D+/g, "");
}

/** Full parser matching the SQL private.parse_phone_br. */
export function parsePhoneBR(input: string | null | undefined, defaultDdd?: string | null): ParsedPhone {
  const original = (input ?? "").toString();
  const empty: ParsedPhone = {
    phone_original: original,
    phone_digits: "",
    phone_ddi: null,
    phone_ddd: null,
    phone_e164: null,
    phone_last8: null,
    phone_last9: null,
    phone_whatsapp_candidate: null,
    phone_status: "invalido",
  };
  if (!original.trim()) return empty;

  let digits = onlyDigits(original).replace(/^0+/, "");
  if (!digits) return { ...empty, phone_digits: digits };

  const ddi = "55";
  let ddd: string | null = null;
  let subscriber: string | null = null;
  let status: PhoneStatus = "invalido";

  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    ddd = digits.slice(2, 4);
    subscriber = digits.slice(4);
  } else if (digits.length === 10 || digits.length === 11) {
    ddd = digits.slice(0, 2);
    subscriber = digits.slice(2);
  } else if ((digits.length === 8 || digits.length === 9) && defaultDdd) {
    const dd = onlyDigits(defaultDdd);
    if (dd.length === 2) {
      ddd = dd;
      subscriber = digits;
      status = "precisa_revisao";
    }
  } else if (digits.length === 8 || digits.length === 9) {
    return {
      ...empty,
      phone_digits: digits,
      phone_status: "sem_ddd",
      phone_last8: digits.slice(-8),
      phone_last9: digits.length >= 9 ? digits.slice(-9) : null,
    };
  } else {
    return { ...empty, phone_digits: digits, phone_status: "invalido" };
  }

  if (!subscriber || (subscriber.length !== 8 && subscriber.length !== 9)) {
    return { ...empty, phone_digits: digits, phone_status: "invalido" };
  }

  const e164 = `+${ddi}${ddd}${subscriber}`;
  let candidate: string | null = null;

  if (subscriber.length === 8 && /[6-9]/.test(subscriber[0])) {
    candidate = `+${ddi}${ddd}9${subscriber}`;
    if (status === "invalido") status = "sem_nono_digito";
  } else if (subscriber.length === 9 && subscriber[0] === "9") {
    candidate = e164;
    if (status === "invalido") status = "valido";
  } else {
    candidate = e164;
    if (status === "invalido") status = "valido";
  }

  const e164Digits = e164.replace(/\D/g, "");
  return {
    phone_original: original,
    phone_digits: digits,
    phone_ddi: ddi,
    phone_ddd: ddd,
    phone_e164: e164,
    phone_last8: e164Digits.slice(-8),
    phone_last9: e164Digits.length >= 9 ? e164Digits.slice(-9) : null,
    phone_whatsapp_candidate: candidate,
    phone_status: status,
  };
}

/** Backwards-compat helper. */
export function normalizePhoneBR(input: string | null | undefined): string | null {
  return parsePhoneBR(input).phone_e164;
}

export function formatPhoneBR(input: string | null | undefined): string {
  const e = normalizePhoneBR(input ?? "");
  if (!e) return input ?? "";
  const rest = e.slice(3);
  const ddd = rest.slice(0, 2);
  const num = rest.slice(2);
  if (num.length === 9) return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  if (num.length === 8) return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  return e;
}
