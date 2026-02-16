type Segment = {
  key: string;
  value: number;
  color: string;
};

export type HorizontalBarDatum = {
  label: string;
  segments: Segment[];
};

interface HorizontalBarChartProps {
  data: HorizontalBarDatum[];
  emptyLabel?: string;
}

export function HorizontalBarChart({ data, emptyLabel = 'No data in selected range' }: HorizontalBarChartProps) {
  const sanitized = data
    .map((item) => ({
      ...item,
      segments: item.segments.filter((segment) => segment.value > 0),
    }))
    .filter((item) => item.segments.length > 0);

  if (sanitized.length === 0) {
    return (
      <div
        className="flex h-56 items-center justify-center rounded-lg border text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--bg-elevated)' }}
      >
        {emptyLabel}
      </div>
    );
  }

  const totals = sanitized.map((item) => item.segments.reduce((sum, segment) => sum + segment.value, 0));
  const maxTotal = Math.max(...totals, 1);

  return (
    <div className="space-y-3">
      {sanitized.map((item) => {
        const total = item.segments.reduce((sum, segment) => sum + segment.value, 0);
        const percent = (total / maxTotal) * 100;

        return (
          <div key={item.label} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm" style={{ color: 'var(--text)' }}>
                {item.label}
              </span>
              <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                {total}
              </span>
            </div>

            <div className="h-3 overflow-hidden rounded-full" style={{ background: 'var(--bg-elevated)' }}>
              <div className="flex h-full" style={{ width: `${percent}%` }}>
                {item.segments.map((segment) => (
                  <div
                    key={`${item.label}-${segment.key}`}
                    style={{
                      width: `${(segment.value / total) * 100}%`,
                      background: segment.color,
                    }}
                    title={`${segment.key}: ${segment.value}`}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
