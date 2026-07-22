type Props = {
  contains: string;
  empty: boolean;
  onContainsChange: (value: string) => void;
  onEmptyChange: (value: boolean) => void;
  placeholder?: string;
};

export default function TextContainsFilterPanel({
  contains,
  empty,
  onContainsChange,
  onEmptyChange,
  placeholder = "Contém…",
}: Props) {
  return (
    <div className="text-contains-filter-panel space-y-2">
      <input
        className="border rounded px-2 py-1 text-sm w-full"
        type="search"
        value={contains}
        onChange={(e) => onContainsChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Texto contido"
      />
      <label className="flex items-center gap-2 text-sm py-0.5 italic text-muted-foreground cursor-pointer border-t pt-2">
        <input type="checkbox" checked={empty} onChange={(e) => onEmptyChange(e.target.checked)} />
        <span>(Vazio) — sem valor preenchido</span>
      </label>
    </div>
  );
}
