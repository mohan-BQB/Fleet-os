import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ComplianceIcon, DriverIcon, TruckIcon } from './icons';
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
        </div>

        <div className="nav-group">
          <div className="nav-label">Upcoming</div>
          <button className="nav-item soon" disabled>Trip Sheets<span className="nav-soon-tag">Soon</span></button>
          <button className="nav-item soon" disabled>Fuel Log<span className="nav-soon-tag">Soon</span></button>
          <button className="nav-item soon" disabled>Reports<span className="nav-soon-tag">Soon</span></button>
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
