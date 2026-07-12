import Cell from "./Cell";
import { getCatalogField } from "@/lib/form-field-catalog";
import { Link } from "@tanstack/react-router";

const SYSTEM_LABELS: Record<string, string> = {
  cidade: "Cidade",
  bairro: "Bairro",
  uf: "UF",
  tags: "Tags",
  origem: "Origem",
  lifecycle_status: "Status",
  created_at: "Criado em",
};
const READ_ONLY_SYSTEM = new Set(["cidade", "bairro", "uf"]);

export default function SheetContainer({ cols, rows, total, page, onEditCell, q }: any) {
  const errorMsg = q?.error ? (q.error instanceof Error ? q.error.message : String(q.error)) : null;
  return (
    <div className="sheet-container border rounded-md overflow-auto">
      <div className="data-grid-header flex border-b bg-muted/40 sticky top-0">
        <div className="header-cell select-cell p-2 w-8"><input type="checkbox" /></div>
        {cols.map((c: string) => {
          const f = getCatalogField(c);
          const label = f ? f.defaultLabel : (SYSTEM_LABELS[c] ?? c);
          return <div key={c} className="header-cell p-2 font-medium text-sm min-w-[140px]">{label}</div>;
        })}
      </div>

      <div className="virtualized-grid">
        {q.isLoading && <div className="p-4 text-sm text-muted-foreground">Carregando…</div>}
        {!q.isLoading && errorMsg && (
          <div className="p-4 text-sm text-destructive">Erro ao carregar: {errorMsg}</div>
        )}
        {!q.isLoading && !errorMsg && rows.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">Nenhum contato encontrado.</div>
        )}
        {!errorMsg && rows.map((r: any) => (
          <div key={r.contact_id} className="data-row flex border-b hover:bg-muted/20">
            <div className="cell select-cell p-2 w-8"><input type="checkbox" /></div>
            {cols.map((col: string) => {
              const field = getCatalogField(col);
              const isPhone = field?.targetColumns.includes("phone_raw") || col === "whatsapp";
              const isMulti = (field?.targetColumns.length ?? 0) > 1;
              const isReadOnlySystem = READ_ONLY_SYSTEM.has(col);
              if (isPhone || isMulti || isReadOnlySystem) {
                return (
                  <div key={col} className="cell composite p-2 min-w-[140px]">
                    <Link to="/contatos/$id" params={{ id: r.contact_id }} className="text-primary underline">
                      {isMulti ? previewComposite(r[col]) : String(r[col] ?? "—")}
                    </Link>
                  </div>
                );
              }
              return <Cell key={col} contactId={r.contact_id} fieldKey={col} value={r[col]} onEdit={onEditCell} />;
            })}
          </div>
        ))}
      </div>

      <footer className="p-2 text-sm text-muted-foreground">
        Resultados: {total} — Página {page}
      </footer>
    </div>
  );
}

function previewComposite(v: unknown) {
  if (!v) return "—";
  if (typeof v === "object") return Object.values(v as Record<string, any>).filter(Boolean).join(", ");
  return String(v);
}
