import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import SheetContainer from "@/components/contacts-sheet/SheetContainer";
import ColumnPickerPanel from "@/components/contacts-sheet/ColumnPickerPanel";

export const Route = createFileRoute("/filter-component-test")({ component: FilterComponentTest });

function FilterComponentTest() {
  const [columnsOpen, setColumnsOpen] = useState(false);
  return (
    <div className="p-8">
      <button type="button" aria-label="Alternar colunas" aria-expanded={columnsOpen} onClick={() => setColumnsOpen((open) => !open)}>
        Colunas {columnsOpen ? "▴" : "▾"}
      </button>
      {columnsOpen && <ColumnPickerPanel chosen={["cidade", "tags"]} onToggleColumn={() => undefined} />}
      <SheetContainer cols={["cidade", "tags"]} rows={[]} total={0} page={1} selection={new Set()} setSelection={() => undefined} currentFilters={{}} pushSearch={() => undefined} q={{ isLoading: false, error: null }} />
    </div>
  );
}