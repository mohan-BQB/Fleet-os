type IconProps = { className?: string };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const MenuIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </svg>
);

export const TruckIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 16V9a1 1 0 0 1 1-1h9v8H3Z" />
    <path d="M13 11h4.5L20 14v3h-7" />
    <circle cx="7" cy="17" r="1.7" />
    <circle cx="17" cy="17" r="1.7" />
  </svg>
);

export const WrenchIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-2.2 2.2-2-2 2.2-2.2Z" />
  </svg>
);

export const TyreIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3v5.8M12 15.2V21M3 12h5.8M15.2 12H21" />
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

export const ApprovalIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5 10.5 15 16 9.5" />
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

export const WalletIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3" />
    <path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-4a2.5 2.5 0 0 1 0-5H21" />
  </svg>
);

export const ReceiptIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M6 2.5h12v19l-2.5-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21.5Z" />
    <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" />
  </svg>
);

export const ChartIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M8 16v-4M12 16V8M16 16v-6" />
  </svg>
);

export const DownloadIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M4 19h16" />
  </svg>
);

export const PrinterIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M6 9V3h12v6" />
    <rect x="4" y="9" width="16" height="8" rx="1.5" />
    <path d="M6 15h12v6H6z" />
  </svg>
);

export const BellIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z" />
    <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
  </svg>
);

export const TeamIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <circle cx="17" cy="9" r="2.3" />
    <path d="M15.5 12.3A4.5 4.5 0 0 1 20.5 16.5" />
  </svg>
);

export const HistoryIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 12a8 8 0 1 0 2.3-5.6" />
    <path d="M4 4v4h4" />
    <path d="M12 8v4l3 2" />
  </svg>
);

export const ExpandIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
  </svg>
);

export const CollapseIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);

export const ChevronIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const BuildingIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M5 21V4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v17" />
    <path d="M14 10h4a1 1 0 0 1 1 1v10" />
    <path d="M8 7h1M8 11h1M8 15h1M19 14h1M19 18h1" />
  </svg>
);

export const StoreIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 8.5 5.2 4h13.6l1.2 4.5" />
    <path d="M3.5 8.5a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
    <path d="M5 8.5V20h14V8.5" />
    <path d="M9.5 20v-6h5v6" />
  </svg>
);

export const BoxIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3.5 7.5 12 3l8.5 4.5V16.5L12 21l-8.5-4.5Z" />
    <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
  </svg>
);

export const ServerIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="3.5" y="4" width="17" height="6" rx="1.5" />
    <rect x="3.5" y="14" width="17" height="6" rx="1.5" />
    <path d="M7 7h.01M7 17h.01" />
  </svg>
);

export const SearchIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const ShieldIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 3.5 5 6v6c0 4.2 3 7.4 7 8.5 4-1.1 7-4.3 7-8.5V6l-7-2.5Z" />
    <path d="M9.5 12 11 13.5l3.5-3.5" />
  </svg>
);
