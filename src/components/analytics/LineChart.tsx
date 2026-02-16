export type LineChartDatum = {
  label: string;
  value: number;
};

interface LineChartProps {
  data: LineChartDatum[];
  color?: string;
  fillColor?: string;
  yLabel?: string;
  emptyLabel?: string;
  showArea?: boolean;
}

export function LineChart({
  data,
  color = 'var(--accent)',
  fillColor = 'rgba(255, 92, 92, 0.1)',
  yLabel = '',
  emptyLabel = 'No data in selected range',
  showArea = false,
}: LineChartProps) {
  const width = 760;
  const height = 280;
  const paddingTop = 18;
  const paddingLeft = 42;
  const paddingRight = 16;
  const paddingBottom = 48;

  const hasValues = data.some((item) => item.value > 0);
  if (data.length === 0 || !hasValues) {
    return (
      <div
        className="flex h-56 items-center justify-center rounded-lg border text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--bg-elevated)' }}
      >
        {emptyLabel}
      </div>
    );
  }

  const maxY = Math.max(...data.map((point) => point.value), 1);
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const stepX = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  const point = (index: number, value: number) => {
    const x = paddingLeft + index * stepX;
    const y = paddingTop + (1 - value / maxY) * plotHeight;
    return { x, y };
  };

  const path = data
    .map((entry, index) => {
      const p = point(index, entry.value);
      return `${index === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
    })
    .join(' ');

  const first = point(0, data[0]?.value ?? 0);
  const last = point(data.length - 1, data[data.length - 1]?.value ?? 0);
  const area = `${path} L ${last.x} ${height - paddingBottom} L ${first.x} ${height - paddingBottom} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxY * ratio));
  const xLabelEvery = data.length > 10 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Line chart">
      {yTicks.map((tick, index) => {
        const y = paddingTop + (1 - index / (yTicks.length - 1)) * plotHeight;
        return (
          <g key={`${tick}-${index}`}>
            <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="var(--border)" strokeWidth="1" />
            <text x={paddingLeft - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted)">
              {tick}
            </text>
          </g>
        );
      })}

      <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} stroke="var(--border-strong)" strokeWidth="1" />
      <line
        x1={paddingLeft}
        y1={height - paddingBottom}
        x2={width - paddingRight}
        y2={height - paddingBottom}
        stroke="var(--border-strong)"
        strokeWidth="1"
      />

      {showArea ? <path d={area} fill={fillColor} /> : null}
      <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      {data.map((entry, index) => {
        const p = point(index, entry.value);
        return <circle key={`${entry.label}-${index}`} cx={p.x} cy={p.y} r="3" fill={color} />;
      })}

      {data.map((entry, index) => {
        if (index % xLabelEvery !== 0) {
          return null;
        }
        const p = point(index, 0);
        return (
          <text key={`${entry.label}-label`} x={p.x} y={height - paddingBottom + 16} textAnchor="middle" fontSize="10" fill="var(--muted)">
            {entry.label}
          </text>
        );
      })}

      {yLabel ? (
        <text x={12} y={paddingTop + 8} fontSize="10" fill="var(--muted)">
          {yLabel}
        </text>
      ) : null}
    </svg>
  );
}
