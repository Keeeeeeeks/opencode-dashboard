export type DonutChartDatum = {
  label: string;
  value: number;
  color: string;
};

interface DonutChartProps {
  data: DonutChartDatum[];
  emptyLabel?: string;
}

export function DonutChart({ data, emptyLabel = 'No data in selected range' }: DonutChartProps) {
  const filtered = data.filter((item) => item.value > 0);
  const total = filtered.reduce((sum, item) => sum + item.value, 0);

  if (filtered.length === 0 || total === 0) {
    return (
      <div
        className="flex h-56 items-center justify-center rounded-lg border text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--bg-elevated)' }}
      >
        {emptyLabel}
      </div>
    );
  }

  const size = 220;
  const radius = 72;
  const strokeWidth = 28;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  let dashOffset = 0;
  const segments = filtered.map((item) => {
    const segmentLength = (item.value / total) * circumference;
    const segment = {
      ...item,
      dasharray: `${segmentLength} ${circumference - segmentLength}`,
      dashoffset: -dashOffset,
      percent: Math.round((item.value / total) * 100),
    };
    dashOffset += segmentLength;
    return segment;
  });

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr] md:items-center">
      <div className="relative mx-auto h-[220px] w-[220px]">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" role="img" aria-label="Donut chart">
          <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--bg-hover)" strokeWidth={strokeWidth} />
          {segments.map((item) => (
            <circle
              key={item.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth={strokeWidth}
              strokeDasharray={item.dasharray}
              strokeDashoffset={item.dashoffset}
              transform={`rotate(-90 ${center} ${center})`}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold" style={{ color: 'var(--text-strong)' }}>
            {total}
          </span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            total
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {segments.map((item) => (
          <div key={`${item.label}-legend`} className="flex items-center justify-between gap-3 rounded-md px-3 py-2" style={{ background: 'var(--bg-elevated)' }}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
              <span className="text-sm capitalize" style={{ color: 'var(--text)' }}>
                {item.label.replace('_', ' ')}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                {item.percent}%
              </span>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                {item.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
