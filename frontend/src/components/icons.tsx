type IconProps = { className?: string };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const TruckIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 16V9a1 1 0 0 1 1-1h9v8H3Z" />
    <path d="M13 11h4.5L20 14v3h-7" />
    <circle cx="7" cy="17" r="1.7" />
    <circle cx="17" cy="17" r="1.7" />
  </svg>
);

export const DriverIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M4.5 20c1-3.6 4-5.6 7.5-5.6s6.5 2 7.5 5.6" />
  </svg>
);

export const ComplianceIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M9 3h6l1 3h3v3l-2 1v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19V10L5 9V6h3l1-3Z" />
    <path d="M9.5 13.5 11 15l3.5-3.5" />
  </svg>
);

export const ClockIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
);

export const AlertIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 9v4M12 16.5h.01" />
    <path d="M10.3 3.9 2.7 17a1.8 1.8 0 0 0 1.6 2.7h15.4a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z" />
  </svg>
);

export const ProfitIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 20V10M11 20V4M18 20v-7" />
  </svg>
);

export const GpsIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);

export const ManualIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);

export const RouteIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M7 9h10M7 13h10M7 17h6" />
  </svg>
);

export const FuelIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M5 21V8l6-5 6 5v13" />
    <path d="M9 21v-6h4v6M14 10h3a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0v-4l-2-3" />
  </svg>
);

export const BellIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z" />
    <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
  </svg>
);
