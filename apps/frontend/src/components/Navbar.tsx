import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <nav className="navbar">
      <NavLink to="/dashboard" className="navbar-brand">
        <div className="brand-logo">N</div>
        NexBank
      </NavLink>

      <ul className="navbar-nav">
        <li><NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>Dashboard</NavLink></li>
        <li><NavLink to="/transfer" className={({ isActive }) => isActive ? 'active' : ''}>Transfer</NavLink></li>
        <li><NavLink to="/transactions" className={({ isActive }) => isActive ? 'active' : ''}>Transactions</NavLink></li>
      </ul>

      <div className="navbar-actions">
        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          {user.firstName} {user.lastName}
        </span>
        <button
          id="navbar-logout"
          onClick={() => { logout(); navigate('/login'); }}
          className="btn btn-secondary btn-sm"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
