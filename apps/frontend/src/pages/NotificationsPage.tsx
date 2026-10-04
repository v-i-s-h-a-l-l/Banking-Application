import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { accountApi, transferApi } from '../api';
import {
  Bell,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  CheckCircle,
  Trash2,
  Settings,
  RefreshCw,
} from 'lucide-react';

interface LedgerEntry {
  id: string;
  entryType: 'CREDIT' | 'DEBIT';
  amountMinor: string;
  balanceAfter: string;
  description: string;
  transferId: string | null;
  createdAt: string;
  accountId?: string;
  accountNumber?: string;
}

interface Account {
  id: string;
  accountNumber: string;
  balanceMinor: string;
}

interface AlertConfig {
  enabled: boolean;
  threshold: number; // in rupees
}

const STORAGE_READ = 'nexbank_notif_read';
const STORAGE_ALERT = 'nexbank_balance_alert';

function loadReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_READ);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function saveReadIds(ids: Set<string>) {
  localStorage.setItem(STORAGE_READ, JSON.stringify([...ids]));
}

function loadAlertConfig(): AlertConfig {
  try {
    const raw = localStorage.getItem(STORAGE_ALERT);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: false, threshold: 5000 };
}

function saveAlertConfig(c: AlertConfig) {
  localStorage.setItem(STORAGE_ALERT, JSON.stringify(c));
}

function formatAmount(minor: string): string {
  return (Number(minor) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'Just now';
}

export default function NotificationsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [feed, setFeed] = useState<LedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(loadReadIds());
  const [alertConfig, setAlertConfig] = useState<AlertConfig>(loadAlertConfig());
  const [showAlertSettings, setShowAlertSettings] = useState(false);
  const [thresholdInput, setThresholdInput] = useState(String(alertConfig.threshold));
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const loadFeed = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const accData = await accountApi.list();
      const accs: Account[] = accData.data.accounts ?? [];
      setAccounts(accs);

      // Fetch last 10 ledger entries for each account in parallel
      const allEntries = await Promise.all(
        accs.map((acc) =>
          accountApi
            .ledger(acc.id, 1, 10)
            .then((d) =>
              (d.data ?? []).map((e: LedgerEntry) => ({
                ...e,
                accountId: acc.id,
                accountNumber: acc.accountNumber,
              }))
            )
            .catch(() => [])
        )
      );

      const merged: LedgerEntry[] = allEntries
        .flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setFeed(merged);
      setLastRefreshed(new Date());
    } catch {
      // silently fail on refresh
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => loadFeed(true), 30000);
    return () => clearInterval(interval);
  }, [loadFeed]);

  const unreadCount = feed.filter((e) => !readIds.has(e.id)).length;

  const markRead = (id: string) => {
    const updated = new Set(readIds).add(id);
    setReadIds(updated);
    saveReadIds(updated);
  };

  const markAllRead = () => {
    const updated = new Set(feed.map((e) => e.id));
    setReadIds(updated);
    saveReadIds(updated);
  };

  const clearRead = () => {
    setReadIds(new Set());
    saveReadIds(new Set());
  };

  const handleAlertSave = () => {
    const thresh = parseFloat(thresholdInput);
    if (isNaN(thresh) || thresh < 0) return;
    const updated = { ...alertConfig, threshold: thresh };
    setAlertConfig(updated);
    saveAlertConfig(updated);
    setShowAlertSettings(false);
  };

  const handleAlertToggle = () => {
    const updated = { ...alertConfig, enabled: !alertConfig.enabled };
    setAlertConfig(updated);
    saveAlertConfig(updated);
  };

  // Balance alerts — accounts below threshold
  const triggeredAlerts = alertConfig.enabled
    ? accounts.filter((acc) => Number(acc.balanceMinor) / 100 < alertConfig.threshold)
    : [];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Bell size={26} />
            Notifications
            {unreadCount > 0 && (
              <span style={{
                background: '#6366f1',
                color: '#fff',
                borderRadius: '999px',
                padding: '2px 10px',
                fontSize: '0.85rem',
                fontWeight: 700,
              }}>
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="page-subtitle">
            Activity feed across all accounts ·{' '}
            <span className="text-muted text-xs">
              Refreshed {timeAgo(lastRefreshed.toISOString())}
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => loadFeed(true)}
            className="btn btn-secondary btn-sm"
            disabled={isRefreshing}
            id="refresh-feed-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="btn btn-secondary btn-sm" id="mark-all-read">
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Balance Alerts Banner */}
      {triggeredAlerts.length > 0 && (
        <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {triggeredAlerts.map((acc) => (
            <div
              key={acc.id}
              style={{
                background: 'rgba(244,63,94,0.08)',
                border: '1px solid rgba(244,63,94,0.35)',
                borderRadius: '12px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <AlertTriangle size={18} style={{ color: '#f43f5e', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f43f5e' }}>Low Balance Alert</div>
                <div className="text-muted text-xs mt-1">
                  Account {acc.accountNumber} has ₹{formatAmount(acc.balanceMinor)} — below your ₹{alertConfig.threshold.toLocaleString('en-IN')} threshold
                </div>
              </div>
              <Link to={`/transfer`} className="btn btn-sm" style={{ background: 'rgba(244,63,94,0.2)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.35)', borderRadius: '8px', padding: '5px 12px', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none' }}>
                Add Funds
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Alert Settings Card */}
      <div className="card" style={{ padding: '18px 20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AlertTriangle size={16} style={{ color: '#818cf8' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Balance Alert</div>
              <div className="text-muted text-xs mt-1">
                {alertConfig.enabled
                  ? `Alerting when below ₹${alertConfig.threshold.toLocaleString('en-IN')}`
                  : 'Click to enable balance alerts'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setShowAlertSettings(!showAlertSettings)}
              className="btn btn-secondary btn-sm"
              id="alert-settings-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Settings size={13} /> Configure
            </button>
            {/* Toggle */}
            <button
              id="alert-toggle"
              role="switch"
              aria-checked={alertConfig.enabled}
              onClick={handleAlertToggle}
              style={{
                width: '44px', height: '24px', borderRadius: '12px',
                background: alertConfig.enabled ? '#6366f1' : 'rgba(255,255,255,0.12)',
                border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: '3px',
                left: alertConfig.enabled ? '23px' : '3px',
                width: '18px', height: '18px',
                borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </button>
          </div>
        </div>

        {showAlertSettings && (
          <div style={{
            marginTop: '16px', paddingTop: '16px',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', gap: '12px', alignItems: 'flex-end',
          }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Alert when balance drops below (₹)</label>
              <input
                id="alert-threshold-input"
                type="number"
                min="0"
                step="100"
                className="form-input"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
              />
            </div>
            <button onClick={handleAlertSave} className="btn btn-primary" id="save-alert-btn" style={{ flexShrink: 0 }}>
              Save
            </button>
            <button onClick={() => setShowAlertSettings(false)} className="btn btn-secondary" style={{ flexShrink: 0 }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Activity Feed */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Activity Feed</h2>
        {readIds.size > 0 && (
          <button onClick={clearRead} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Trash2 size={12} /> Clear read
          </button>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div className="loading-screen">
            <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
          </div>
        ) : feed.length === 0 ? (
          <div className="empty-state" style={{ padding: '48px' }}>
            <div className="empty-state-icon">🔔</div>
            <div className="empty-state-title">No activity yet</div>
            <p className="text-muted text-sm mt-2">Make a transfer to see your activity feed here</p>
            <Link to="/transfer" className="btn btn-primary mt-4">Make a Transfer</Link>
          </div>
        ) : (
          feed.map((entry) => {
            const isRead = readIds.has(entry.id);
            return (
              <div
                key={entry.id}
                id={`notif-${entry.id}`}
                className="transaction-item"
                style={{
                  background: isRead ? 'transparent' : 'rgba(99,102,241,0.04)',
                  borderLeft: isRead ? 'none' : '3px solid rgba(99,102,241,0.5)',
                  cursor: 'default',
                  transition: 'background 0.2s',
                }}
                onClick={() => markRead(entry.id)}
              >
                <div className={`transaction-icon ${entry.entryType.toLowerCase()}`}>
                  {entry.entryType === 'CREDIT'
                    ? <ArrowDownLeft size={16} />
                    : <ArrowUpRight size={16} />
                  }
                </div>
                <div className="transaction-details">
                  <div className="transaction-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {entry.description}
                    {!isRead && (
                      <span style={{
                        width: '7px', height: '7px', borderRadius: '50%',
                        background: '#6366f1', display: 'inline-block', flexShrink: 0,
                      }} />
                    )}
                  </div>
                  <div className="transaction-meta">
                    {entry.accountNumber} · {timeAgo(entry.createdAt)}
                  </div>
                </div>
                <div className="transaction-amount-col" style={{ textAlign: 'right' }}>
                  <div className={`transaction-amount ${entry.entryType.toLowerCase()}`}>
                    {entry.entryType === 'CREDIT' ? '+' : '−'}₹{formatAmount(entry.amountMinor)}
                  </div>
                  <div className="text-muted text-xs mt-1">
                    Bal: ₹{formatAmount(entry.balanceAfter)}
                  </div>
                  {!isRead && (
                    <button
                      onClick={(ev) => { ev.stopPropagation(); markRead(entry.id); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', marginLeft: 'auto' }}
                    >
                      <CheckCircle size={12} /> Mark read
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
