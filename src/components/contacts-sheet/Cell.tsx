import React, { useState } from "react";
import { getCatalogField } from "@/lib/form-field-catalog";
import { LIFECYCLE_LABEL, WHATSAPP_STATUS_LABEL, PHONE_STATUS_LABEL, PHONE_STATUS_BADGE } from "@/lib/phone-labels";

const DAY_LABELS: Record<string, string> = {
  segunda: "Seg", terca: "Ter", quarta: "Qua", quinta: "Qui",
  sexta: "Sex", sabado: "Sáb", domingo: "Dom",
};
const PERIOD_LABELS: Record<string, string> = { manha: "manhã", tarde: "tarde", noite: "noite" };
const PERIOD_TONE: Record<string, string> = {
  manha: "bg-amber-100 text-amber-800 border-amber-200",
  tarde: "bg-sky-100 text-sky-800 border-sky-200",
  noite: "bg-indigo-100 text-indigo-800 border-indigo-200",
};

// Label lookup for enum/multiple_choice fields (formas_ajuda, faixa_etaria, etc.)
function labelForOption(fieldKey: string, value: string): string {
  const f = getCatalogField(fieldKey);
  if (!f?.options) return value;
  return f.options.find((o) => o.value === value)?.label ?? value;
}

export default function Cell({ contactId, fieldKey, value, onEdit, activeFilterValues }: any) {
  const filterSet: Set<string> | null = Array.isArray(activeFilterValues) && activeFilterValues.length
    ? new Set(activeFilterValues as string[])
    : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(value);

  async function confirm() {
    try {
      const res = await onEdit(contactId, fieldKey, draft);
      if (res && res.success === false) {
        alert(res.error ?? "Erro ao salvar");
        return;
      }
      setEditing(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro");
    }
  }

  // --- TAGS ---
  if (fieldKey === "tags" && Array.isArray(value)) {
    const allTags = value as Array<{ id: string; nome: string; cor?: string | null }>;
    const tags = filterSet ? allTags.filter((t) => filterSet.has(t.id)) : allTags;
    if (tags.length === 0) return <div className="p-2 text-muted-foreground">—</div>;
    const visible = tags.slice(0, 3);
    const extra = tags.length - visible.length;
    const tooltip = tags.map((t) => t.nome).join(", ");
    return (
      <div className="p-2 min-w-[160px]" title={tooltip}>
        <div className="flex flex-wrap gap-1">
          {visible.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border"
              style={{
                backgroundColor: t.cor ? `${t.cor}1a` : "hsl(var(--muted))",
                color: t.cor ?? "hsl(var(--foreground))",
                borderColor: t.cor ? `${t.cor}55` : "hsl(var(--border))",
              }}
            >
              {t.nome}
            </span>
          ))}
          {extra > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
              +{extra}
            </span>
          )}
        </div>
      </div>
    );
  }

  // --- DISPONIBILIDADE (chips agrupados por dia com turnos) ---
  if (fieldKey === "disponibilidade" && Array.isArray(value)) {
    const arrAll = value as string[];
    const arr = filterSet ? arrAll.filter((v) => filterSet.has(v)) : arrAll;
    if (arr.length === 0) return <div className="p-2 text-muted-foreground">—</div>;

    // Agrupa: { segunda: ["manha","tarde"], ... }
    const byDay: Record<string, string[]> = {};
    for (const raw of arr) {
      const [day, period] = String(raw).split("_");
      if (!day || !period) continue;
      (byDay[day] ??= []).push(period);
    }
    const orderedDays = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]
      .filter((d) => byDay[d]);

    const tooltip = orderedDays
      .map((d) => `${DAY_LABELS[d]}: ${byDay[d].map((p) => PERIOD_LABELS[p] ?? p).join(", ")}`)
      .join("\n");

    return (
      <div className="p-2 min-w-[180px]" title={tooltip}>
        <div className="flex flex-wrap gap-1">
          {orderedDays.map((d) =>
            byDay[d].map((p) => (
              <span
                key={`${d}_${p}`}
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${PERIOD_TONE[p] ?? "bg-muted text-foreground border-border"}`}
              >
                {DAY_LABELS[d]} {PERIOD_LABELS[p] ?? p}
              </span>
            )),
          )}
        </div>
      </div>
    );
  }

  // --- FORMAS DE AJUDA / listas de valores ---
  if (fieldKey === "formas_ajuda" && Array.isArray(value)) {
    const arrAll = value as string[];
    const arr = filterSet ? arrAll.filter((v) => filterSet.has(v)) : arrAll;
    if (arr.length === 0) return <div className="p-2 text-muted-foreground">—</div>;
    const visible = arr.slice(0, 4);
    const extra = arr.length - visible.length;
    const tooltip = arr.map((v) => labelForOption("formas_ajuda", v)).join(", ");
    return (
      <div className="p-2 min-w-[180px]" title={tooltip}>
        <div className="flex flex-wrap gap-1">
          {visible.map((v) => (
            <span
              key={v}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-foreground border border-border"
            >
              {labelForOption("formas_ajuda", v)}
            </span>
          ))}
          {extra > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
              +{extra}
            </span>
          )}
        </div>
      </div>
    );
  }

  // --- STATUS BADGES ---
  if (fieldKey === "lifecycle_status" && typeof value === "string") {
    return (
      <div className="p-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-foreground border border-border">
          {LIFECYCLE_LABEL[value] ?? value}
        </span>
      </div>
    );
  }
  if (fieldKey === "whatsapp_status" && typeof value === "string") {
    return (
      <div className="p-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-foreground border border-border">
          {WHATSAPP_STATUS_LABEL[value] ?? value}
        </span>
      </div>
    );
  }
  if (fieldKey === "phone_status" && typeof value === "string") {
    return (
      <div className="p-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${PHONE_STATUS_BADGE[value] ?? "bg-muted text-foreground"}`}>
          {PHONE_STATUS_LABEL[value] ?? value}
        </span>
      </div>
    );
  }

  // --- Enum simples (faixa_etaria, tipo_contato) ---
  if (typeof value === "string" && getCatalogField(fieldKey)?.options) {
    const label = labelForOption(fieldKey, value);
    return (
      <div className="p-2 cursor-pointer" onClick={() => setEditing(true)}>
        {editing ? (
          <div className="inline-editor flex gap-1">
            <input className="border rounded px-1 text-sm w-full" value={draft ?? ""} onChange={(e) => setDraft(e.target.value)} />
            <button className="text-xs text-primary" onClick={confirm}>Salvar</button>
            <button className="text-xs text-muted-foreground" onClick={() => { setDraft(value); setEditing(false); }}>Cancelar</button>
          </div>
        ) : label}
      </div>
    );
  }

  return (
    <div className="p-2 min-w-[140px]">
      {!editing ? (
        <div onClick={() => setEditing(true)} className="cursor-pointer">{displayCellValue(value)}</div>
      ) : (
        <div className="inline-editor flex gap-1">
          <input className="border rounded px-1 text-sm w-full" value={draft ?? ""} onChange={(e) => setDraft(e.target.value)} />
          <button className="text-xs text-primary" onClick={confirm}>Salvar</button>
          <button className="text-xs text-muted-foreground" onClick={() => { setDraft(value); setEditing(false); }}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

function displayCellValue(v: unknown) {
  if (v == null || v === "") return <span className="text-muted-foreground">—</span>;
  if (Array.isArray(v)) return `${v.length} itens`;
  return String(v);
}
