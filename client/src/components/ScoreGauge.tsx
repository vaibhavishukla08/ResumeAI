import { useEffect, useState } from 'react';
import { toneClass, bandLabel } from '@/lib/format';

interface ScoreGaugeProps {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  label?: string | null;
  showBand?: boolean;
  animate?: boolean;
}

/**
 * The circular score dial from the Stitch analysis screens, with the arc drawn
 * in a gradient and swept in on mount.
 */
export default function ScoreGauge({
  value,
  max = 100,
  size = 176,
  stroke = 13,
  label = '/ 100',
  showBand = true,
  animate = true,
}: ScoreGaugeProps) {
  const [shown, setShown] = useState(animate ? 0 : value);

  useEffect(() => {
    if (!animate) {
      setShown(value);
      return;
    }
    // Two frames: the first paints at zero, the second triggers the transition.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(value)));
    return () => cancelAnimationFrame(id);
  }, [value, animate]);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, shown / max));
  const tone = toneClass(value);
  const gradientId = `gauge-${Math.round(value)}-${size}`;

  return (
    <div className="flex flex-col items-center gap-md">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
          role="img"
          aria-label={`Score ${Math.round(value)} out of ${max}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgb(var(--grad-a))" />
              <stop offset="55%" stopColor="rgb(var(--grad-b))" />
              <stop offset="100%" stopColor="rgb(var(--grad-c))" />
            </linearGradient>
          </defs>

          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            style={{ stroke: 'rgb(var(--gauge-track))' }}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
            stroke={`url(#${gradientId})`}
            style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-display gradient-text tabular-nums"
            style={{ fontSize: size * 0.29, lineHeight: 1 }}
          >
            {Math.round(shown)}
          </span>
          {label && (
            <span className="font-body text-body-sm text-on-surface-variant mt-xs">{label}</span>
          )}
        </div>
      </div>

      {showBand && (
        <span className={`chip ${tone.bg} ${tone.border} ${tone.text} font-semibold`}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {value >= 70 ? 'verified' : value >= 50 ? 'info' : 'warning'}
          </span>
          {bandLabel(value)}
        </span>
      )}
    </div>
  );
}

interface ScoreBarProps {
  value: number;
  max?: number;
  tone?: string;
  className?: string;
  gradient?: boolean;
}

/** Compact horizontal meter used in list rows and breakdown tables. */
export function ScoreBar({ value, max = 1, tone, className = '', gradient }: ScoreBarProps) {
  const [width, setWidth] = useState(0);
  const ratio = Math.max(0, Math.min(1, value / max));

  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(ratio));
    return () => cancelAnimationFrame(id);
  }, [ratio]);

  return (
    <div
      className={`h-1.5 w-full rounded-full bg-surface-container-highest overflow-hidden ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-smooth ${
          gradient ? 'gradient-surface' : ''
        }`}
        style={{
          width: `${width * 100}%`,
          background: gradient ? undefined : tone || 'rgb(var(--primary))',
        }}
      />
    </div>
  );
}
