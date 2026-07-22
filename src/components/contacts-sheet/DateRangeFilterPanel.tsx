type Props = {
  from: string;
  to: string;
  quick: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onQuickChange: (value: string) => void;
};

export default function DateRangeFilterPanel({
  from,
  to,
  quick,
  onFromChange,
  onToChange,
  onQuickChange,
}: Props) {
  return (
    <div className="date-range-filter-panel space-y-3">
      <div className="grid grid-cols-1 gap-2">
        <label className="text-xs text-muted-foreground">
          De
          <input
            className="mt-1 border rounded px-2 py-1 text-sm w-full"
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Até
          <input
            className="mt-1 border rounded px-2 py-1 text-sm w-full"
            type="date"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
          />
        </label>
      </div>
      <div className="border-t pt-2">
        <label className="text-xs text-muted-foreground">
          Atalho (ano, mês ou dia)
          <input
            className="mt-1 border rounded px-2 py-1 text-sm w-full"
            type="text"
            value={quick}
            onChange={(e) => onQuickChange(e.target.value)}
            placeholder="AAAA, AAAA-MM ou AAAA-MM-DD"
          />
        </label>
      </div>
    </div>
  );
}
