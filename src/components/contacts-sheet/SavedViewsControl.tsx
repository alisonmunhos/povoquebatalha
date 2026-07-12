export default function SavedViewsControl({ saved, onSave }: { saved: Array<{ name: string; payload: any }>; onSave: (name: string) => void }) {
  return (
    <div className="saved-views-control flex items-center gap-2">
      <select className="border rounded px-2 py-1 text-sm">
        <option>Views salvas</option>
        {saved.map((s) => <option key={s.name}>{s.name}</option>)}
      </select>
      <button
        className="border rounded px-2 py-1 text-sm"
        onClick={() => {
          const name = prompt("Nome da view:");
          if (name) onSave(name);
        }}
      >
        Salvar view
      </button>
    </div>
  );
}
