import { TIMELINE_PERIODS, type DateRange, type TimelinePeriod } from '../lib/periods';

interface Props {
  period: TimelinePeriod;
  onPeriodChange: (period: TimelinePeriod) => void;
  customRange: DateRange;
  onCustomRangeChange: (range: DateRange) => void;
}

export default function Timeline({ period, onPeriodChange, customRange, onCustomRangeChange }: Props) {
  return (
    <div>
      <div className="period-tabs">
        {TIMELINE_PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`period-tab${period === p.key ? ' active' : ''}`}
            onClick={() => onPeriodChange(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="timeline-custom">
          <input
            type="date"
            value={customRange.start}
            max={customRange.end}
            onChange={(e) => onCustomRangeChange({ ...customRange, start: e.target.value })}
          />
          <span>to</span>
          <input
            type="date"
            value={customRange.end}
            min={customRange.start}
            onChange={(e) => onCustomRangeChange({ ...customRange, end: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
