type BarValue = {
  key: string;
  value: number;
  color: string;
};

export type BarChartDatum = {
  label: string;
  values: BarValue[];
};

interface BarChartProps {
  data: BarChartDatum[];
  yLabel?: string;
  emptyLabel?: string;
}

export function BarChart({ data, yLabel = '', emptyLabel = 'No data in selected range' }: BarChartProps) {
  const width = 760;
  const height = 280;
  const paddingTop = 18;
  const paddingLeft = 42;
  const paddingRight = 16;
  const paddingBottom = 48;

  const hasValues = data.some((item) => item.values.some((value) => value.value > 0));
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

  const maxY = Math.max(...data.flatMap((item) => item.values.map((value) => value.value)), 1);
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const groupWidth = plotWidth / data.length;
  const barsPerGroup = Math.max(...data.map((item) => item.values.length), 1);
  const barWidth = Math.max(8, Math.min(28, (groupWidth * 0.8) / barsPerGroup));
  const barGap = Math.max(2, ((groupWidth * 0.8) - barWidth * barsPerGroup) / Math.max(barsPerGroup - 1, 1));

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxY * ratio));
  const xLabelEvery = data.length > 10 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Bar chart">
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

      {data.map((item, index) => {
        const groupX = paddingLeft + index * groupWidth + groupWidth * 0.1;
        return (
          <g key={`${item.label}-${index}`}>
            {item.values.map((entry, valueIndex) => {
              const h = (entry.value / maxY) * plotHeight;
              const x = groupX + valueIndex * (barWidth + barGap);
              const y = paddingTop + (plotHeight - h);

              return <rect key={`${item.label}-${entry.key}`} x={x} y={y} width={barWidth} height={h} rx="2" fill={entry.color} />;
            })}

            {index % xLabelEvery === 0 ? (
              <text
                x={paddingLeft + index * groupWidth + groupWidth / 2}
                y={height - paddingBottom + 16}
                textAnchor="middle"
                fontSize="10"
                fill="var(--muted)"
              >
                {item.label}
              </text>
            ) : null}
          </g>
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
