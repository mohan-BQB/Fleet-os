import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChartIcon, ComplianceIcon, DriverIcon, FuelIcon, ProfitIcon, RouteIcon, TruckIcon, TyreIcon, WalletIcon } from './icons';
import './Layout.css';

export default function Layout() {
  const { user, logout } = useAuth();
  const initials = (user?.username ?? '?').slice(0, 2).toUpperCase();

  return (
    <div className="app">
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
          <NavLink to="/vehicles" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <TruckIcon />Vehicles
          </NavLink>
          <NavLink to="/drivers" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <DriverIcon />Drivers
          </NavLink>
          <NavLink to="/compliance" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <ComplianceIcon />Compliance
          </NavLink>
          <NavLink to="/trip-sheets" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <RouteIcon />Trip Sheets
          </NavLink>
          <NavLink to="/fuel-log" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <FuelIcon />Fuel Log
          </NavLink>
          <NavLink to="/tyres" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <TyreIcon />Tyres
          </NavLink>
          <NavLink to="/economics" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <ProfitIcon />Economics
          </NavLink>
          <NavLink to="/driver-ledger" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <WalletIcon />Driver Ledger
          </NavLink>
          <NavLink to="/reports" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <ChartIcon />Reports
          </NavLink>
        </div>

        <div className="rail-foot">
          <div className="avatar">{initials}</div>
          <div className="who">
            <div className="who-name">{user?.username}</div>
            <div className="who-role">{user?.role}</div>
          </div>
          <button className="logout-btn" onClick={() => logout()}>Sign out</button>
        </div>
      </nav>

      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
