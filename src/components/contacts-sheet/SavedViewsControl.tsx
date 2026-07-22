export type SavedSheetViewPayload = {
  cols: string;
  sort?: string;
  filtersEncoded?: string;
  pageSize?: number | "all";
};

export default function SavedViewsControl({
  saved,
  onSave,
  onLoad,
}: {
  saved: Array<{ name: string; payload: SavedSheetViewPayload }>;
  onSave: (name: string) => void;
  onLoad: (payload: SavedSheetViewPayload) => void;
}) {
  return (
    <div className="saved-views-control flex items-center gap-2">
      <select
        className="border rounded px-2 py-1 text-sm max-w-[180px]"
        defaultValue=""
        onChange={(e) => {
          const name = e.target.value;
          if (!name) return;
          const view = saved.find((s) => s.name === name);
          if (view) onLoad(view.payload);
          e.currentTarget.value = "";
        }}
      >
        <option value="">Views salvas</option>
        {saved.map((s) => (
          <option key={s.name} value={s.name}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="border rounded px-2 py-1 text-sm whitespace-nowrap"
        onClick={() => {
          const name = prompt("Nome da view:");
          if (name?.trim()) onSave(name.trim());
        }}
      >
        Salvar view
      </button>
    </div>
  );
}
