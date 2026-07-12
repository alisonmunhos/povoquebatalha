export default function BulkActionBar({ selection, selectAllByFilter, onCreateTag, onApplyTag, onExportSelected }: any) {
  return (
    <div className="bulk-action-bar flex items-center gap-2 mt-3 p-2 border rounded-md">
      <div className="text-sm">Selecionados: {selection.size}</div>
      <button className="border rounded px-2 py-1 text-sm" onClick={() => selectAllByFilter()}>Selecionar tudo (até 2000)</button>
      <button
        className="border rounded px-2 py-1 text-sm"
        onClick={async () => {
          const tagName = prompt("Nome da nova tag:");
          if (!tagName) return;
          const tag = await onCreateTag(tagName);
          if (tag?.id) await onApplyTag(tag.id);
        }}
      >
        Criar e aplicar tag
      </button>
      <button className="border rounded px-2 py-1 text-sm" onClick={() => onExportSelected()}>Exportar CSV</button>
    </div>
  );
}
