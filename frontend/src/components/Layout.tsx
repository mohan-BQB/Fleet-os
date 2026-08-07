import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, usePermission } from '../context/AuthContext';
import { stopImpersonation } from '../api/console';
import ChangePasswordModal from './ChangePasswordModal';
import {
  ApprovalIcon, BoxIcon, BuildingIcon, ChartIcon, ChevronIcon, ComplianceIcon, DriverIcon, FuelIcon, ProfitIcon,
  ReceiptIcon, RouteIcon, ServerIcon, ShieldIcon, StoreIcon, TeamIcon, TruckIcon, TyreIcon, WalletIcon, WrenchIcon,
} from './icons';
import './Layout.css';

function NavGroup({
  label, defaultOpen = true, children,
}: { label: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <button
        type="button"
        className={`nav-label-btn${open ? ' expanded' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronIcon className="nav-chevron" />
        <span className="nav-label">{label}</span>
      </button>
      {open && <div className="nav-collapsible">{children}</div>}
    </>
  );
}

export default function Layout() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [showChangePassword, setShowChangePassword] = useState(false);
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

  const showOperations =
    (canSeeTripWorkCards && !disabledModules.has('trip_work_cards'))
    || (canSeeFuelLog && !disabledModules.has('fuel_log'))
    || (canSeeVehicles && !disabledModules.has('tyres'))
    || (canSeeVehicles && !disabledModules.has('maintenance'));
  const showSettlements =
    (canSeeExpenses && !disabledModules.has('economics'))
    || (canSeeMoneyBox && !disabledModules.has('driver_ledger'))
    || canSeeCustomersVendors
    || canSeeVehicles;
  const showMasters =
    canSeeVehicles || canSeeDrivers || canSeeExpenses || canSeeCustomersVendors || canSeeCompanyUsers;

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
      <nav className="rail" aria-label="Primary">
        <div className="brand">
          <div className="brand-mark"><TruckIcon /></div>
          <div>
            <div className="brand-name">VELAN</div>
            <div className="brand-sub">Freight Carriers</div>
          </div>
        </div>

        <div className="nav-group">
          <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <TruckIcon />Dashboard
          </NavLink>

          {canSeeApprovals && (
            <NavLink to="/approvals" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <ApprovalIcon />Approvals
            </NavLink>
          )}

          {canSeeCompliance && (
            <NavLink to="/compliance" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <ComplianceIcon />Compliance
            </NavLink>
          )}

          {showOperations && (
            <>
              <div className="nav-label">Operations</div>
              {canSeeTripWorkCards && !disabledModules.has('trip_work_cards') && (
                <NavLink to="/trip-sheets" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <RouteIcon />Trip &amp; work cards
                </NavLink>
              )}
              {canSeeFuelLog && !disabledModules.has('fuel_log') && (
                <NavLink to="/fuel-log" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <FuelIcon />Fuel log
                </NavLink>
              )}
              {canSeeVehicles && !disabledModules.has('tyres') && (
                <NavLink to="/tyres" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <TyreIcon />Tyres
                </NavLink>
              )}
              {canSeeVehicles && !disabledModules.has('maintenance') && (
                <NavLink to="/maintenance" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <WrenchIcon />Maintenance
                </NavLink>
              )}
            </>
          )}

          {showSettlements && (
            <>
              <div className="nav-label">Settlements</div>
              {canSeeExpenses && !disabledModules.has('economics') && (
                <NavLink to="/expense?tab=all" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <ReceiptIcon />Expenses
                </NavLink>
              )}
              {canSeeMoneyBox && !disabledModules.has('driver_ledger') && (
                <NavLink to="/driver-ledger" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <WalletIcon />Driver ledger
                </NavLink>
              )}
              {canSeeCustomersVendors && (
                <NavLink to="/vendor-customer-payments" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <StoreIcon />Vendor &amp; customer payments
                </NavLink>
              )}
              {canSeeVehicles && (
                <NavLink to="/vehicle-emi" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <ProfitIcon />Vehicle EMI
                </NavLink>
              )}
            </>
          )}

          {canSeeReports && !disabledModules.has('reports') && (
            <NavLink to="/reports" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <ChartIcon />Reports
            </NavLink>
          )}

          {showMasters && (
            <NavGroup label="Masters">
              {canSeeVehicles && (
                <NavLink to="/vehicles" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <TruckIcon />Vehicle
                </NavLink>
              )}
              {canSeeDrivers && (
                <NavLink to="/drivers" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <DriverIcon />Driver
                </NavLink>
              )}
              {canSeeExpenses && !disabledModules.has('economics') && (
                <NavLink to="/expense?tab=heads" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <ReceiptIcon />Expense heads
                </NavLink>
              )}
              {canSeeCustomersVendors && (!disabledModules.has('vendors') || !disabledModules.has('customers')) && (
                <NavLink to="/customer-vendor" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <StoreIcon />Customer &amp; Vendor
                </NavLink>
              )}
              {canSeeVehicles && !disabledModules.has('parts_inventory') && (
                <NavLink to="/parts-inventory" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <BoxIcon />Parts
                </NavLink>
              )}
              {canSeeVehicles && !disabledModules.has('tyres') && (
                <NavLink to="/masters/tyres" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <TyreIcon />Tyres
                </NavLink>
              )}
              {canSeeVehicles && !disabledModules.has('maintenance') && (
                <NavLink to="/masters/maintenance" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <WrenchIcon />Maintenance
                </NavLink>
              )}
              {canSeeCompanyUsers && (
                <>
                  <NavLink to="/masters/users" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                    <TeamIcon />Users
                  </NavLink>
                  <NavLink to="/masters/company" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                    <BuildingIcon />Company profile
                  </NavLink>
                </>
              )}
            </NavGroup>
          )}

          {isSuperuser && (
            <>
              <div className="nav-label">Platform</div>
              <NavLink to="/developer-dashboard" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <ServerIcon />Developer Dashboard
              </NavLink>
              <NavLink to="/control-center" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
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

      <div className="main">
        <Outlet />
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
