import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import Drivers from './pages/Drivers';
import Compliance from './pages/Compliance';
import TripSheets from './pages/TripSheets';
import FuelLog from './pages/FuelLog';
import Economics from './pages/Economics';
import DriverLedger from './pages/DriverLedger';
import Layout from './components/Layout';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
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
        <Route path="compliance" element={<Compliance />} />
        <Route path="trip-sheets" element={<TripSheets />} />
        <Route path="fuel-log" element={<FuelLog />} />
        <Route path="economics" element={<Economics />} />
        <Route path="driver-ledger" element={<DriverLedger />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
