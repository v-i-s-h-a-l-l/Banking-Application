import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { accountApi } from '../api';
import { Bell, LayoutDashboard, ArrowRightLeft, List, CreditCard, User, PiggyBank, Landmark, Banknote, Target } from 'lucide-react';

function useUnreadCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const compute = async () => {
      try {
        const readRaw = localStorage.getItem('nexbank_notif_read');
        const readIds: Set<string> = readRaw ? new Set(JSON.parse(readRaw)) : new Set();

        const accData = await accountApi.list();
        const accounts = accData.data.accounts ?? [];

        const allEntries = await Promise.all(
          accounts.map((acc: { id: string }) =>
            accountApi
              .ledger(acc.id, 1, 10)
              .then((d: any) => d.data ?? [])
              .catch(() => [])
          )
        );

        const total = allEntries.flat().filter((e: any) => !readIds.has(e.id)).length;
        setCount(total);
      } catch {}
    };

    compute();
    const interval = setInterval(compute, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  return count;
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  if (!user) return null;

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();

  const navItems = [
    { to: '/dashboard', icon: <LayoutDashboard size={15} />, label: 'Dashboard' },
    { to: '/transfer', icon: <ArrowRightLeft size={15} />, label: 'Transfer' },
    { to: '/transactions', icon: <List size={15} />, label: 'Transactions' },
    { to: '/payments', icon: <CreditCard size={15} />, label: 'Payments' },
    { to: '/rd', icon: <PiggyBank size={15} />, label: 'RD' },
    { to: '/fd', icon: <Landmark size={15} />, label: 'FD' },
    { to: '/loans', icon: <Banknote size={15} />, label: 'Loans' },
    { to: '/goals', icon: <Target size={15} />, label: 'Goals' },
  ];

  return (
    <nav className="navbar">
      <NavLink to="/dashboard" className="navbar-brand">
        <div className="brand-logo">N</div>
        NexBank
      </NavLink>

      <ul className="navbar-nav">
        {navItems.map(({ to, icon, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              id={`nav-${label.toLowerCase()}`}
              className={({ isActive }) => isActive ? 'active' : ''}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px', fontSize: '0.84rem' }}
            >
              {icon}
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="navbar-actions">
        {/* Notifications bell */}
        <NavLink
          to="/notifications"
          id="nav-notifications"
          className={({ isActive }) => isActive ? 'active' : ''}
          style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '6px 8px', borderRadius: '8px', color: 'var(--color-text-muted)', textDecoration: 'none', transition: 'color 0.2s' }}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              id="notif-badge"
              style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                minWidth: '16px',
                height: '16px',
                borderRadius: '999px',
                background: '#6366f1',
                color: '#fff',
                fontSize: '0.65rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
                lineHeight: 1,
                border: '2px solid var(--bg-body, #0f1123)',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </NavLink>

        {/* Profile avatar button */}
        <NavLink
          to="/profile"
          id="nav-profile"
          className={({ isActive }) => isActive ? 'active' : ''}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'var(--color-text-muted)', borderRadius: '8px', padding: '4px 8px', transition: 'color 0.2s' }}
        >
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1, #22d3ee)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            {initials || <User size={14} />}
          </div>
          <span style={{ fontSize: '0.875rem' }}>{user.firstName}</span>
        </NavLink>

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
