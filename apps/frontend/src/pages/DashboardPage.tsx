import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { accountApi } from '../api';

interface Account {
  id: string;
  accountNumber: string;
  accountType: string;
  balanceMinor: string;
  currency: string;
  status: string;
  createdAt: string;
}

function formatBalance(minor: string): string {
  const n = Number(minor) / 100;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const loadAccounts = async () => {
    try {
      const data = await accountApi.list();
      setAccounts(data.data.accounts ?? []);
    } catch {
      setError('Failed to load accounts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadAccounts(); }, []);

  const createAccount = async () => {
    setCreating(true);
    try {
      await accountApi.create('SAVINGS');
      await loadAccounts();
    } catch {
      setError('Failed to create account');
    } finally {
      setCreating(false);
    }
  };

  const totalBalance = accounts.reduce(
    (sum, acc) => sum + Number(acc.balanceMinor),
    0,
  );

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px',
        }}
      >
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">
            Good morning, {user?.firstName} 👋
          </h1>
          <p className="page-subtitle">Here's your financial overview</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link to="/transfer" className="btn btn-primary" id="go-to-transfer">
            ↗ Send Money
          </Link>
          <button onClick={() => logout()} className="btn btn-secondary btn-sm">
            Sign out
          </button>
        </div>
      </div>

      {/* Total balance */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(6,182,212,0.1))',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: '20px',
          padding: '28px',
          marginBottom: '28px',
        }}
      >
        <div className="stat-label">Total portfolio value</div>
        <div style={{ fontSize: '2.75rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--color-text)' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 500, color: 'var(--color-text-muted)', marginRight: '4px' }}>₹</span>
          {formatBalance(String(totalBalance))}
        </div>
        <div className="text-muted text-sm mt-2">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</div>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}

      {/* Accounts */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Your Accounts</h2>
        <button
          id="create-account-btn"
          onClick={createAccount}
          disabled={creating}
          className="btn btn-secondary btn-sm"
        >
          {creating ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Creating...</> : '+ New Account'}
        </button>
      </div>

      {isLoading ? (
        <div className="loading-screen"><div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} /></div>
      ) : accounts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🏦</div>
            <div className="empty-state-title">No accounts yet</div>
            <p className="text-muted text-sm mt-2">Create your first savings account to get started</p>
            <button
              onClick={createAccount}
              disabled={creating}
              className="btn btn-primary mt-4"
            >
              Create Savings Account
            </button>
          </div>
        </div>
      ) : (
        <div className="grid-2">
          {accounts.map((acc) => (
            <div key={acc.id} className="account-card" id={`account-${acc.id}`}>
              <div className="account-card-label">{acc.accountType} Account</div>
              <div className="account-card-number">{acc.accountNumber}</div>
              <div className="account-card-balance">
                <span className="account-card-currency">₹</span>
                {formatBalance(acc.balanceMinor)}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
                <div className="account-card-type">{acc.status}</div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                  <Link to={`/transactions?accountId=${acc.id}`} className="btn btn-secondary btn-sm">
                    History
                  </Link>
                  <Link to={`/transfer?from=${acc.id}`} className="btn btn-primary btn-sm">
                    Send
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
