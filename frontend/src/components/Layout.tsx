import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, usePermission } from '../context/AuthContext';
import { stopImpersonation } from '../api/console';
import ChangePasswordModal from './ChangePasswordModal';
import CommandPalette, { type NavDestination } from './CommandPalette';
import {
  ApprovalIcon, BoxIcon, BuildingIcon, ChartIcon, ChevronIcon, ComplianceIcon, DriverIcon, FuelIcon, MenuIcon,
  ProfitIcon, ReceiptIcon, RouteIcon, SearchIcon, ServerIcon, ShieldIcon, StoreIcon, TeamIcon, TruckIcon, TyreIcon,
  WalletIcon, WrenchIcon,
} from './icons';
import './Layout.css';

// Collapse state persists per user/browser (not per session) and per
// group id - an accountant who always wants Settlements open just leaves
// it that way once. The group containing the page you're currently on
// still auto-expands on top of that (see the effect below), without
// overwriting what you chose for the others.
function useNavGroupOpen(id: string, activeNow: boolean) {
  const key = `velan.nav.${id}.open`;
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) return saved === '1';
    } catch {
      /* localStorage unavailable (private mode etc.) - fall through to the default */
    }
    return activeNow;
  });

  useEffect(() => {
    if (activeNow) setOpen(true);
  }, [activeNow]);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      try { localStorage.setItem(key, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  return [open, toggle] as const;
}

function NavGroup({
  id, label, activeNow, count, children,
}: { id: string; label: string; activeNow: boolean; count: number; children: ReactNode }) {
  const [open, toggle] = useNavGroupOpen(id, activeNow);
  return (
    <>
      <button
        type="button"
        className={`nav-label-btn${open ? ' expanded' : ''}`}
        onClick={toggle}
        aria-expanded={open}
      >
        <ChevronIcon className="nav-chevron" />
        <span className="nav-label">{label}</span>
        {!open && <span className="count-badge">{count}</span>}
      </button>
      {open && <div className="nav-collapsible">{children}</div>}
    </>
  );
}

export default function Layout() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showChangePassword, setShowChangePassword] = useState(false);
  // Below 980px the .rail becomes a fixed slide-in drawer instead of a
  // grid column (see Layout.css) - this just tracks whether it's open.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const initials = (user?.username ?? '?').slice(0, 2).toUpperCase();
  const isSuperuser = user?.is_superuser === true;
  const disabledModules = new Set(user?.organization_disabled_modules ?? []);

  // A driver's own trip sheets/fuel logs are an object-level carve-out on
  // the backend (operations.permissions.OwnRecordsPermission), not a
  // section grant - core.permissions.ROLE_DEFAULTS gives Driver nothing at
  // the section-grid level at all. Mirrored here so the nav item still
  // shows up for them.
  const isDriver = user?.role === 'driver';
  const canSeeTripWorkCards = usePermission('trip_work_cards') || isDriver;
  const canSeeFuelLog = usePermission('fuel_log') || isDriver;
  const canSeeMoneyBox = usePermission('money_box_settlement');
  const canSeeReports = usePermission('reports');
  const showReportsLink = canSeeReports && !disabledModules.has('reports');
  const canSeeVehicles = usePermission('vehicles');
  const canSeeDrivers = usePermission('drivers');
  const canSeeExpenses = usePermission('expenses');
  const canSeeCustomersVendors = usePermission('customers_vendors');
  const canSeeCompanyUsers = usePermission('company_users');
  // Approvals is a cross-cutting inbox (Expense/Fuel Log/Trip Sheet), not
  // its own section - shown only to someone who can actually act on at
  // least one of those, not just view them. All three hooks called
  // unconditionally (rules-of-hooks) before combining with ||.
  const canApproveExpenses = usePermission('expenses', 'change_status');
  const canApproveFuel = usePermission('fuel_log', 'change_status');
  const canApproveTrips = usePermission('trip_work_cards', 'change_status');
  const canSeeApprovals = canApproveExpenses || canApproveFuel || canApproveTrips;
  // Compliance is cross-cutting too (vehicle + driver documents in one
  // list) - visible to anyone who can already see either holder type,
  // same reasoning as canSeeApprovals above.
  const canSeeCompliance = canSeeVehicles || canSeeDrivers;

  const showTripWorkCards = canSeeTripWorkCards && !disabledModules.has('trip_work_cards');
  const showFuelLog = canSeeFuelLog && !disabledModules.has('fuel_log');
  const showTyres = canSeeVehicles && !disabledModules.has('tyres');
  const showMaintenance = canSeeVehicles && !disabledModules.has('maintenance');
  const showOperations = showTripWorkCards || showFuelLog || showTyres || showMaintenance;
  const operationsCount = [showTripWorkCards, showFuelLog, showTyres, showMaintenance].filter(Boolean).length;

  const showExpensesLink = canSeeExpenses && !disabledModules.has('economics');
  const showDriverLedger = canSeeMoneyBox && !disabledModules.has('driver_ledger');
  const showVendorCustomerPayments = canSeeCustomersVendors;
  const showVehicleEmi = canSeeVehicles;
  const showSettlements = showExpensesLink || showDriverLedger || showVendorCustomerPayments || showVehicleEmi;
  const settlementsCount = [showExpensesLink, showDriverLedger, showVendorCustomerPayments, showVehicleEmi].filter(Boolean).length;

  const showCustomerVendor = canSeeCustomersVendors && (!disabledModules.has('vendors') || !disabledModules.has('customers'));
  const showParts = canSeeVehicles && !disabledModules.has('parts_inventory');
  const showMasters =
    canSeeVehicles || canSeeDrivers || canSeeExpenses || canSeeCustomersVendors || canSeeCompanyUsers;
  const mastersCount = [
    canSeeVehicles, canSeeDrivers, showExpensesLink, showCustomerVendor, showParts, canSeeCompliance,
    canSeeCompanyUsers, canSeeCompanyUsers,
  ].filter(Boolean).length;

  const OPERATIONS_PATHS = ['/trip-sheets', '/fuel-log', '/tyres', '/maintenance'];
  const SETTLEMENTS_PATHS = ['/expense', '/driver-ledger', '/vendor-customer-payments', '/vehicle-emi'];
  const MASTERS_PATHS = [
    '/vehicles', '/drivers', '/expense', '/customer-vendor', '/parts-inventory', '/compliance',
    '/masters/users', '/masters/company',
  ];
  const operationsActive = OPERATIONS_PATHS.includes(location.pathname);
  const settlementsActive = SETTLEMENTS_PATHS.includes(location.pathname);
  const mastersActive = MASTERS_PATHS.includes(location.pathname);

  // Flattened for the "Jump to..." palette (⌘K / Ctrl K, or the search
  // pill below) - built from the same visibility flags the rail itself
  // uses, so the palette never offers a destination the rail wouldn't.
  const destinations = useMemo(() => {
    const list: NavDestination[] = [
      { label: 'Dashboard', path: '/', icon: <TruckIcon />, section: 'General' },
    ];
    if (canSeeApprovals) list.push({ label: 'Approvals', path: '/approvals', icon: <ApprovalIcon />, section: 'General' });
    if (showTripWorkCards) list.push({ label: 'Trip & work cards', path: '/trip-sheets', icon: <RouteIcon />, section: 'Operations' });
    if (showFuelLog) list.push({ label: 'Fuel log', path: '/fuel-log', icon: <FuelIcon />, section: 'Operations' });
    if (showTyres) list.push({ label: 'Tyres', path: '/tyres', icon: <TyreIcon />, section: 'Operations' });
    if (showMaintenance) list.push({ label: 'Maintenance', path: '/maintenance', icon: <WrenchIcon />, section: 'Operations' });
    if (showExpensesLink) list.push({ label: 'Expenses', path: '/expense', icon: <ReceiptIcon />, section: 'Settlements' });
    if (showDriverLedger) list.push({ label: 'Driver ledger', path: '/driver-ledger', icon: <WalletIcon />, section: 'Settlements' });
    if (showVendorCustomerPayments) list.push({ label: 'Vendor & customer payments', path: '/vendor-customer-payments', icon: <StoreIcon />, section: 'Settlements' });
    if (showVehicleEmi) list.push({ label: 'Vehicle EMI', path: '/vehicle-emi', icon: <ProfitIcon />, section: 'Settlements' });
    if (showReportsLink) list.push({ label: 'Reports', path: '/reports', icon: <ChartIcon />, section: 'General' });
    if (canSeeVehicles) list.push({ label: 'Vehicle', path: '/vehicles', icon: <TruckIcon />, section: 'Masters' });
    if (canSeeDrivers) list.push({ label: 'Driver', path: '/drivers', icon: <DriverIcon />, section: 'Masters' });
    if (showExpensesLink) list.push({ label: 'Expense categories', path: '/expense?categories=1', icon: <ReceiptIcon />, section: 'Masters' });
    if (showCustomerVendor) list.push({ label: 'Customer & Vendor', path: '/customer-vendor', icon: <StoreIcon />, section: 'Masters' });
    if (showParts) list.push({ label: 'Parts', path: '/parts-inventory', icon: <BoxIcon />, section: 'Masters' });
    if (canSeeCompliance) list.push({ label: 'Compliance', path: '/compliance', icon: <ComplianceIcon />, section: 'Masters' });
    if (canSeeCompanyUsers) {
      list.push({ label: 'Users', path: '/masters/users', icon: <TeamIcon />, section: 'Masters' });
      list.push({ label: 'Company profile', path: '/masters/company', icon: <BuildingIcon />, section: 'Masters' });
    }
    if (isSuperuser) {
      list.push({ label: 'Developer Dashboard', path: '/developer-dashboard', icon: <ServerIcon />, section: 'Platform' });
      list.push({ label: 'Control Center', path: '/control-center', icon: <ShieldIcon />, section: 'Platform' });
    }
    return list;
  }, [
    canSeeApprovals, showTripWorkCards, showFuelLog, showTyres, showMaintenance, showExpensesLink, showDriverLedger,
    showVendorCustomerPayments, showVehicleEmi, showReportsLink, canSeeVehicles, canSeeDrivers,
    showCustomerVendor, showParts, canSeeCompliance, canSeeCompanyUsers, isSuperuser,
  ]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowPalette(true);
        setMobileNavOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function handleExitImpersonation() {
    await stopImpersonation();
    await refreshUser();
    navigate('/');
  }

  return (
    <div className="app">
      {user?.impersonating && (
        <div className="impersonation-banner">
          Viewing as <strong>{user.organization_name}</strong>
          <button className="btn" onClick={handleExitImpersonation}>Exit impersonation</button>
        </div>
      )}
      {mobileNavOpen && (
        <div className="nav-drawer-backdrop" onClick={() => setMobileNavOpen(false)} />
      )}
      <nav
        className={`rail${mobileNavOpen ? ' open' : ''}`}
        aria-label="Primary"
        onClick={(e) => {
          // Close on an actual nav link (an <a>, via NavLink), not on a
          // NavGroup expand/collapse button - same element, different
          // intent, so this can't just be a click handler on <NavLink>
          // without touching all eighteen of them individually.
          if ((e.target as HTMLElement).closest('a')) setMobileNavOpen(false);
        }}
      >
        <div className="brand">
          <div className="brand-mark"><TruckIcon /></div>
          <div>
            <div className="brand-name">VELAN</div>
            <div className="brand-sub">Freight Carriers</div>
          </div>
        </div>

        <button
          type="button" className="nav-search-pill"
          onClick={() => { setShowPalette(true); setMobileNavOpen(false); }}
        >
          <SearchIcon />
          Jump to…
          <span className="kbd">⌘K</span>
        </button>

        <div className="nav-group">
          <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <TruckIcon />Dashboard
          </NavLink>

          {canSeeApprovals && (
            <NavLink to="/approvals" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <ApprovalIcon />Approvals
            </NavLink>
          )}

          {showOperations && (
            <NavGroup id="operations" label="Operations" activeNow={operationsActive} count={operationsCount}>
              {showTripWorkCards && (
                <NavLink to="/trip-sheets" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <RouteIcon />Trip &amp; work cards
                </NavLink>
              )}
              {showFuelLog && (
                <NavLink to="/fuel-log" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <FuelIcon />Fuel log
                </NavLink>
              )}
              {showTyres && (
                <NavLink to="/tyres" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <TyreIcon />Tyres
                </NavLink>
              )}
              {showMaintenance && (
                <NavLink to="/maintenance" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <WrenchIcon />Maintenance
                </NavLink>
              )}
            </NavGroup>
          )}

          {showSettlements && (
            <NavGroup id="settlements" label="Settlements" activeNow={settlementsActive} count={settlementsCount}>
              {showExpensesLink && (
                <NavLink to="/expense" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <ReceiptIcon />Expenses
                </NavLink>
              )}
              {showDriverLedger && (
                <NavLink to="/driver-ledger" className={({ isActive }) => `nav-item secondary${isActive ? ' active' : ''}`}>
                  <WalletIcon />Driver ledger
                </NavLink>
              )}
              {showVendorCustomerPayments && (
                <NavLink to="/vendor-customer-payments" className={({ isActive }) => `nav-item secondary${isActive ? ' active' : ''}`}>
                  <StoreIcon />Vendor &amp; customer payments
                </NavLink>
              )}
              {showVehicleEmi && (
                <NavLink to="/vehicle-emi" className={({ isActive }) => `nav-item secondary${isActive ? ' active' : ''}`}>
                  <ProfitIcon />Vehicle EMI
                </NavLink>
              )}
            </NavGroup>
          )}

          {showReportsLink && (
            <NavLink to="/reports" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <ChartIcon />Reports
            </NavLink>
          )}

          {showMasters && (
            <NavGroup id="masters" label="Masters" activeNow={mastersActive} count={mastersCount}>
              {canSeeVehicles && (
                <NavLink to="/vehicles" className={({ isActive }) => `nav-item secondary${isActive ? ' active' : ''}`}>
                  <TruckIcon />Vehicle
                </NavLink>
              )}
              {canSeeDrivers && (
                <NavLink to="/drivers" className={({ isActive }) => `nav-item secondary${isActive ? ' active' : ''}`}>
                  <DriverIcon />Driver
                </NavLink>
              )}
              {showExpensesLink && (
                <NavLink to="/expense?categories=1" className={({ isActive }) => `nav-item secondary${isActive ? ' active' : ''}`}>
                  <ReceiptIcon />Expense categories
                </NavLink>
              )}
              {showCustomerVendor && (
                <NavLink to="/customer-vendor" className={({ isActive }) => `nav-item secondary${isActive ? ' active' : ''}`}>
                  <StoreIcon />Customer &amp; Vendor
                </NavLink>
              )}
              {showParts && (
                <NavLink to="/parts-inventory" className={({ isActive }) => `nav-item secondary${isActive ? ' active' : ''}`}>
                  <BoxIcon />Parts
                </NavLink>
              )}
              {canSeeCompliance && (
                <NavLink to="/compliance" className={({ isActive }) => `nav-item secondary${isActive ? ' active' : ''}`}>
                  <ComplianceIcon />Compliance
                </NavLink>
              )}
              {canSeeCompanyUsers && (
                <>
                  <NavLink to="/masters/users" className={({ isActive }) => `nav-item secondary${isActive ? ' active' : ''}`}>
                    <TeamIcon />Users
                  </NavLink>
                  <NavLink to="/masters/company" className={({ isActive }) => `nav-item secondary${isActive ? ' active' : ''}`}>
                    <BuildingIcon />Company profile
                  </NavLink>
                </>
              )}
            </NavGroup>
          )}

          {isSuperuser && (
            <>
              <div className="nav-label">Platform</div>
              <NavLink to="/developer-dashboard" className={({ isActive }) => `nav-item secondary${isActive ? ' active' : ''}`}>
                <ServerIcon />Developer Dashboard
              </NavLink>
              <NavLink to="/control-center" className={({ isActive }) => `nav-item secondary${isActive ? ' active' : ''}`}>
                <ShieldIcon />Control Center
              </NavLink>
            </>
          )}
        </div>

        <div className="rail-foot">
          <div className="avatar">{initials}</div>
          <div className="who">
            <div className="who-name">{user?.username}</div>
            <div className="who-role">{user?.role}</div>
          </div>
          <button className="logout-btn" onClick={() => setShowChangePassword(true)}>Password</button>
          <button className="logout-btn" onClick={() => logout()}>Sign out</button>
        </div>
      </nav>

      <div className="mobile-topbar">
        <button
          type="button" className="mobile-nav-toggle"
          onClick={() => setMobileNavOpen((o) => !o)}
          aria-label="Toggle navigation" aria-expanded={mobileNavOpen}
        >
          <MenuIcon />
        </button>
        <span className="mobile-topbar-brand">VELAN</span>
        <button
          type="button" className="mobile-nav-toggle" style={{ marginLeft: 'auto' }}
          onClick={() => setShowPalette(true)}
          aria-label="Jump to…"
        >
          <SearchIcon />
        </button>
      </div>

      <div className="main">
        <Outlet />
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
      {showPalette && <CommandPalette destinations={destinations} onClose={() => setShowPalette(false)} />}
    </div>
  );
}
