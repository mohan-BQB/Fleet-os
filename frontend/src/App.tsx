import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import Drivers from './pages/Drivers';
import TripSheets from './pages/TripSheets';
import FuelLog from './pages/FuelLog';
import Tyres from './pages/Tyres';
import Maintenance from './pages/Maintenance';
import Economics from './pages/Economics';
import DriverLedger from './pages/DriverLedger';
import Reports from './pages/Reports';
import Team from './pages/Team';
import AuditLog from './pages/AuditLog';
import Layout from './components/Layout';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Owner/Admin-only pages (Team, Audit Log). Backend capabilities are the
// real gate (403 otherwise) - this just keeps a direct URL hit from
// rendering the page shell for everyone else.
function RequireRole({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen">Loading…</div>;
  if (!user || (user.role !== 'owner' && user.role !== 'admin')) return <Navigate to="/" replace />;
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
        <Route path="economics" element={<Economics />} />
        <Route path="driver-ledger" element={<DriverLedger />} />
        <Route path="reports" element={<Reports />} />
        <Route path="team" element={<RequireRole><Team /></RequireRole>} />
        <Route path="audit-log" element={<RequireRole><AuditLog /></RequireRole>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
