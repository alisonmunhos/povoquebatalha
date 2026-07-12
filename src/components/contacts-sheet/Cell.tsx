import { useState } from "react";

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
