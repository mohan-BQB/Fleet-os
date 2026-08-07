import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, usePermission } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import Drivers from './pages/Drivers';
import TripSheets from './pages/TripSheets';
import FuelLog from './pages/FuelLog';
import Tyres from './pages/Tyres';
import Maintenance from './pages/Maintenance';
import PartsInventory from './pages/PartsInventory';
import Expense from './pages/Expense';
import Approvals from './pages/Approvals';
import Compliance from './pages/Compliance';
import CustomerVendor from './pages/CustomerVendor';
import VendorCustomerPayments from './pages/VendorCustomerPayments';
import VehicleEmi from './pages/VehicleEmi';
import DriverLedger from './pages/DriverLedger';
import Reports from './pages/Reports';
import Team from './pages/Team';
import CompanyProfile from './pages/CompanyProfile';
import DeveloperDashboard from './pages/DeveloperDashboard';
import ControlCenter from './pages/ControlCenter';
import Layout from './components/Layout';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Masters -> Users / Company profile. Backend `company_users` permission is
// the real gate (403 otherwise) - this just keeps a direct URL hit from
// rendering the page shell for someone who can't see it.
function RequireCompanyUsers({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  const canView = usePermission('company_users');
  if (loading) return <div className="center-screen">Loading…</div>;
  if (!canView) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Developer Dashboard / Control Center - platform-operator pages, not
// tenant admin pages (see RequireCompanyUsers above). Backend IsSuperuser is
// the real gate (403 otherwise) - this just keeps a direct URL hit from
// rendering the page shell for everyone else.
function RequireSuperuser({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen">Loading…</div>;
  if (!user || !user.is_superuser) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="drivers" element={<Drivers />} />
        <Route path="trip-sheets" element={<TripSheets />} />
        <Route path="fuel-log" element={<FuelLog />} />
        <Route path="tyres" element={<Tyres />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="parts-inventory" element={<PartsInventory />} />
        <Route path="expense" element={<Expense />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="compliance" element={<Compliance />} />
        <Route path="customer-vendor" element={<CustomerVendor />} />
        <Route path="vendor-customer-payments" element={<VendorCustomerPayments />} />
        <Route path="vehicle-emi" element={<VehicleEmi />} />
        <Route path="driver-ledger" element={<DriverLedger />} />
        <Route path="reports" element={<Reports />} />
        <Route path="masters/users" element={<RequireCompanyUsers><Team /></RequireCompanyUsers>} />
        <Route path="masters/company" element={<RequireCompanyUsers><CompanyProfile /></RequireCompanyUsers>} />
        <Route path="developer-dashboard" element={<RequireSuperuser><DeveloperDashboard /></RequireSuperuser>} />
        <Route path="control-center" element={<RequireSuperuser><ControlCenter /></RequireSuperuser>} />

        {/* Old paths, kept as redirects so existing bookmarks/links land
            somewhere sensible instead of 404-ing. */}
        <Route path="masters/tyres" element={<Navigate to="/tyres?tab=specs" replace />} />
        <Route path="masters/maintenance" element={<Navigate to="/maintenance?tab=schedules" replace />} />
        <Route path="economics" element={<Navigate to="/expense" replace />} />
        <Route path="expense-heads" element={<Navigate to="/expense" replace />} />
        <Route path="vendors" element={<Navigate to="/customer-vendor" replace />} />
        <Route path="customers" element={<Navigate to="/customer-vendor" replace />} />
        <Route path="vehicle-expenses" element={<Navigate to="/reports" replace />} />
        <Route path="audit-log" element={<Navigate to="/reports" replace />} />
        <Route path="team" element={<Navigate to="/masters/users" replace />} />
        <Route path="company-profile" element={<Navigate to="/masters/company" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
