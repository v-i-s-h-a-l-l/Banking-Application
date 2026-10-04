import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { accountApi } from '../api';
import { ArrowUpRight, ArrowDownLeft, TrendingUp, Wallet, Clock, Send } from 'lucide-react';

interface Account {
  id: string;
  accountNumber: string;
  accountType: string;
  balanceMinor: string;
  currency: string;
  status: string;
  createdAt: string;
}

interface LedgerEntry {
  id: string;
  entryType: 'CREDIT' | 'DEBIT';
  amountMinor: string;
  balanceAfter: string;
  description: string;
  transferId: string | null;
  createdAt: string;
}

function formatBalance(minor: string | number): string {
  return (Number(minor) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const CHART_COLORS = {
  credit: '#22d3ee',
  debit: '#f43f5e',
  balance: '#818cf8',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'rgba(15,17,35,0.95)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '10px',
        padding: '10px 14px',
        fontSize: '0.82rem',
      }}>
        <div style={{ color: 'var(--color-text-muted)', marginBottom: 4 }}>{label}</div>
        <div style={{ color: '#818cf8', fontWeight: 700 }}>
          ₹{(payload[0].value as number).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
      </div>
    );
  }
  return null;
};

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [account, setAccount] = useState<Account | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    Promise.all([
      accountApi.get(id),
      accountApi.ledger(id, 1, 50),
    ])
      .then(([accData, ledgerData]) => {
        setAccount(accData.data.account);
        setEntries(ledgerData.data ?? []);
      })
      .catch(() => setError('Failed to load account details'))
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
        <div className="empty-state-icon">⚠️</div>
        <div className="empty-state-title">{error || 'Account not found'}</div>
        <button className="btn btn-secondary mt-4" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  // Build balance chart data from ledger (oldest first)
  const chartData = [...entries].reverse().map((e) => ({
    date: formatDate(e.createdAt),
    balance: Number(e.balanceAfter) / 100,
  }));

  // Aggregate credit / debit totals
  const totalCredit = entries
    .filter((e) => e.entryType === 'CREDIT')
    .reduce((s, e) => s + Number(e.amountMinor), 0);
  const totalDebit = entries
    .filter((e) => e.entryType === 'DEBIT')
    .reduce((s, e) => s + Number(e.amountMinor), 0);

  const pieData = [
    { name: 'Credits', value: totalCredit },
    { name: 'Debits', value: totalDebit },
  ];

  const creditCount = entries.filter((e) => e.entryType === 'CREDIT').length;
  const debitCount = entries.filter((e) => e.entryType === 'DEBIT').length;
  const recentEntries = entries.slice(0, 6);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
        <button
          onClick={() => navigate('/dashboard')}
          className="btn btn-secondary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          ← Back
        </button>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Account Analytics</h1>
          <p className="page-subtitle">{account.accountNumber}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          <Link to={`/transfer?from=${account.id}`} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Send size={14} /> Send Money
          </Link>
          <Link to={`/transactions?accountId=${account.id}`} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={14} /> Full History
          </Link>
        </div>
      </div>

      {/* Account hero card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(6,182,212,0.12) 100%)',
        border: '1px solid rgba(99,102,241,0.35)',
        borderRadius: '20px',
        padding: '28px 32px',
        marginBottom: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <div>
          <div className="stat-label" style={{ marginBottom: '8px' }}>
            <Wallet size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            {account.accountType} Account
          </div>
          <div style={{ fontSize: '2.75rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--color-text)' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 500, color: 'var(--color-text-muted)', marginRight: '4px' }}>₹</span>
            {formatBalance(account.balanceMinor)}
          </div>
          <div className="text-muted text-sm mt-2">{account.accountNumber}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <span className={`status-badge status-${account.status}`}>{account.status}</span>
          <div className="text-muted text-xs">Opened {formatDate(account.createdAt)}</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid-3" style={{ marginBottom: '28px' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '20px 24px' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'rgba(34,211,238,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ArrowDownLeft size={20} style={{ color: '#22d3ee' }} />
          </div>
          <div>
            <div className="stat-label">Total Received</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#22d3ee' }}>₹{formatBalance(String(totalCredit))}</div>
            <div className="text-muted text-xs">{creditCount} credit{creditCount !== 1 ? 's' : ''}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '20px 24px' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'rgba(244,63,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ArrowUpRight size={20} style={{ color: '#f43f5e' }} />
          </div>
          <div>
            <div className="stat-label">Total Sent</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f43f5e' }}>₹{formatBalance(String(totalDebit))}</div>
            <div className="text-muted text-xs">{debitCount} debit{debitCount !== 1 ? 's' : ''}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '20px 24px' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'rgba(129,140,248,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <TrendingUp size={20} style={{ color: '#818cf8' }} />
          </div>
          <div>
            <div className="stat-label">Net Flow</div>
            <div style={{
              fontSize: '1.25rem', fontWeight: 700,
              color: totalCredit - totalDebit >= 0 ? '#22d3ee' : '#f43f5e',
            }}>
              {totalCredit - totalDebit >= 0 ? '+' : ''}₹{formatBalance(String(Math.abs(totalCredit - totalDebit)))}
            </div>
            <div className="text-muted text-xs">Over {entries.length} transactions</div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '24px', marginBottom: '28px', alignItems: 'start' }}>
        {/* Balance over time */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={16} style={{ color: '#818cf8' }} /> Balance Over Time
          </h2>
          {chartData.length < 2 ? (
            <div className="empty-state" style={{ padding: '32px' }}>
              <div className="empty-state-icon">📈</div>
              <div className="empty-state-title" style={{ fontSize: '0.9rem' }}>Not enough data yet</div>
              <p className="text-muted text-xs mt-2">Make a few transactions to see your balance chart</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#818cf8"
                  strokeWidth={2}
                  fill="url(#balanceGradient)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#818cf8', stroke: '#1a1f35', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Credit vs Debit donut */}
        <div className="card" style={{ padding: '24px', minWidth: '220px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px' }}>Flow Breakdown</h2>
          {totalCredit === 0 && totalDebit === 0 ? (
            <div className="empty-state" style={{ padding: '16px' }}>
              <div className="empty-state-icon" style={{ fontSize: '1.5rem' }}>🥧</div>
              <div className="empty-state-title" style={{ fontSize: '0.85rem' }}>No data</div>
            </div>
          ) : (
            <>
              <PieChart width={170} height={170}>
                <Pie
                  data={pieData}
                  cx={85}
                  cy={85}
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  <Cell fill={CHART_COLORS.credit} />
                  <Cell fill={CHART_COLORS.debit} />
                </Pie>
              </PieChart>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: CHART_COLORS.credit }} />
                  <span style={{ color: 'var(--color-text-muted)' }}>Credits</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 600, color: CHART_COLORS.credit }}>
                    ₹{formatBalance(String(totalCredit))}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: CHART_COLORS.debit }} />
                  <span style={{ color: 'var(--color-text-muted)' }}>Debits</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 600, color: CHART_COLORS.debit }}>
                    ₹{formatBalance(String(totalDebit))}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Recent Activity</h2>
          <Link to={`/transactions?accountId=${account.id}`} className="btn btn-secondary btn-sm">View All</Link>
        </div>
        {recentEntries.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px' }}>
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">No transactions yet</div>
          </div>
        ) : (
          recentEntries.map((entry) => (
            <div key={entry.id} className="transaction-item" id={`detail-entry-${entry.id}`}>
              <div className={`transaction-icon ${entry.entryType.toLowerCase()}`}>
                {entry.entryType === 'CREDIT' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
              </div>
              <div className="transaction-details">
                <div className="transaction-title">{entry.description}</div>
                <div className="transaction-meta">{formatDateTime(entry.createdAt)}</div>
              </div>
              <div className="transaction-amount-col" style={{ textAlign: 'right' }}>
                <div className={`transaction-amount ${entry.entryType.toLowerCase()}`}>
                  {entry.entryType === 'CREDIT' ? '+' : '−'}₹{formatBalance(entry.amountMinor)}
                </div>
                <div className="text-muted text-xs mt-1">Bal: ₹{formatBalance(entry.balanceAfter)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
