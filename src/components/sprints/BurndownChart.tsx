'use client';

interface BurndownPoint {
  date: string;
  completed: number;
  remaining: number;
}

interface BurndownChartProps {
  data: BurndownPoint[];
  totalPoints: number;
}

export function BurndownChart({ data, totalPoints }: BurndownChartProps) {
  const width = 640;
  const height = 220;
  const padding = 28;

  if (data.length === 0) {
    return (
      <div
        className="flex h-44 items-center justify-center rounded-lg border text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--bg-elevated)' }}
      >
        No burndown data yet
      </div>
    );
  }

  const maxY = Math.max(totalPoints, ...data.map((point) => point.remaining), 1);
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const stepX = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  const toPoint = (index: number, value: number) => {
    const x = padding + index * stepX;
    const y = padding + (1 - value / maxY) * plotHeight;
    return `${x},${y}`;
  };

  const actualPath = data
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${toPoint(index, point.remaining)}`)
    .join(' ');

  const idealPath = data
    .map((_, index) => {
      const remaining = totalPoints * (1 - index / Math.max(data.length - 1, 1));
      return `${index === 0 ? 'M' : 'L'} ${toPoint(index, remaining)}`;
    })
    .join(' ');

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible" role="img" aria-label="Sprint burndown chart">
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="var(--border)" strokeWidth="1" />
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="var(--border)"
          strokeWidth="1"
        />

        <path d={idealPath} fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="5 4" />
        <path d={actualPath} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />

        {data.map((point, index) => {
          const [x, y] = toPoint(index, point.remaining).split(',').map(Number);
          return <circle key={point.date} cx={x} cy={y} r="3" fill="var(--accent)" />;
        })}

        <text x={padding} y={padding - 8} fill="var(--muted)" fontSize="10">
          {maxY} pts
        </text>
        <text x={width - padding} y={height - 8} textAnchor="end" fill="var(--muted)" fontSize="10">
          Day {data.length}
        </text>
      </svg>
    </div>
  );
}
