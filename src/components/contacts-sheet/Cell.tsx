import React, { useState } from "react";

const DAYS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
const DAY_LABELS: Record<string, string> = { segunda: "Seg", terca: "Ter", quarta: "Qua", quinta: "Qui", sexta: "Sex", sabado: "Sáb", domingo: "Dom" };

export default function Cell({ contactId, fieldKey, value, onEdit }: any) {
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

  // --- TAGS rendering (chips) ---
  if (fieldKey === "tags" && Array.isArray(value)) {
    const tags = value as Array<{ id: string; nome: string; cor?: string | null }>;
    return (
      <div className="cell p-2 min-w-[140px]">
        <div className="flex flex-wrap gap-1">
          {tags.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                style={{
                  backgroundColor: t.cor ? `${t.cor}22` : undefined,
                  color: t.cor ?? undefined,
                  border: t.cor ? `1px solid ${t.cor}55` : undefined,
                }}
              >
                {t.nome}
              </span>
            ))
          )}
        </div>
      </div>
    );
  }

  // --- DISPONIBILIDADE rendering (compact week markers) ---
  if (fieldKey === "disponibilidade" && Array.isArray(value)) {
    const arr = value as string[]; // ex.: ['segunda_manha','segunda_tarde','terca_manha',...]
    const daysSet = new Set(arr.map((s) => String(s).split("_")[0]));
    const tooltip = arr.map((s) => {
      const [day, period] = String(s).split("_");
      const dayLabel = DAY_LABELS[day] ?? day;
      const periodLabel = period === "manha" ? "Manhã" : period === "tarde" ? "Tarde" : period === "noite" ? "Noite" : period;
      return `${dayLabel} - ${periodLabel}`;
    }).join("\n");

    return (
      <div className="cell p-2 min-w-[140px]" title={tooltip}>
        <div className="flex items-center gap-1">
          {DAYS.map((d) => {
            const active = daysSet.has(d);
            return (
              <span key={d} title={DAY_LABELS[d]} className={`w-3 h-3 rounded-full ${active ? "bg-primary" : "bg-muted/40"}`} />
            );
          })}
          {arr.length === 0 && <span className="ml-2 text-muted-foreground text-xs">Nenhuma</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="cell p-2 min-w-[140px]">
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
  if (v == null) return "—";
  if (Array.isArray(v)) return `${v.length} itens`;
  return String(v);
}
