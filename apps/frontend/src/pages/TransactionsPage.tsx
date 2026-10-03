import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { accountApi, transferApi } from '../api';

interface LedgerEntry {
  id: string;
  entryType: 'CREDIT' | 'DEBIT';
  amountMinor: string;
  balanceAfter: string;
  description: string;
  transferId: string | null;
  createdAt: string;
}

interface Transfer {
  id: string;
  status: string;
  amountMinor: string;
  description: string;
  sourceAccountId: string;
  destinationAccountId: string;
  createdAt: string;
  completedAt: string | null;
  failureReason: string | null;
}

interface Account {
  id: string;
  accountNumber: string;
  balanceMinor: string;
}

function formatAmount(minor: string): string {
  return (Number(minor) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TransactionsPage() {
  const [params] = useSearchParams();
  const accountId = params.get('accountId');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState(accountId ?? '');
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'ledger' | 'transfers'>('ledger');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  useEffect(() => {
    accountApi
      .list()
      .then((d) => {
        const accs = d.data.accounts ?? [];
        setAccounts(accs);
        if (!selectedAccount && accs.length > 0) {
          setSelectedAccount(accs[0].id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedAccount) return;
    setIsLoading(true);
    setPage(1);

    Promise.all([
      accountApi.ledger(selectedAccount, 1, LIMIT),
      transferApi.listForAccount(selectedAccount, 1),
    ])
      .then(([ledgerData, transferData]) => {
        setEntries(ledgerData.data ?? []);
        setTotal(ledgerData.pagination?.total ?? 0);
        setTransfers(transferData.data ?? []);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [selectedAccount]);

  const currentAccount = accounts.find((a) => a.id === selectedAccount);

  return (
    <div>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}
      >
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Transaction History</h1>
          <p className="page-subtitle">View ledger entries and transfer records</p>
        </div>
        <Link to="/transfer" className="btn btn-primary btn-sm">↗ New Transfer</Link>
      </div>

      {/* Account selector */}
      <div className="form-group" style={{ marginBottom: '24px', maxWidth: '360px' }}>
        <label className="form-label">Select account</label>
        <select
          id="account-selector"
          className="form-input form-select"
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.accountNumber} — ₹{formatAmount(acc.balanceMinor)}
            </option>
          ))}
        </select>
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          id="tab-ledger"
          className={`btn ${view === 'ledger' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setView('ledger')}
        >
          Ledger Entries
        </button>
        <button
          id="tab-transfers"
          className={`btn ${view === 'transfers' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setView('transfers')}
        >
          Transfers
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div className="loading-screen"><div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} /></div>
        ) : view === 'ledger' ? (
          entries.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <div className="empty-state-title">No transactions yet</div>
              <p className="text-muted text-sm mt-2">Make your first transfer to see entries here</p>
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="transaction-item" id={`entry-${entry.id}`}>
                <div className={`transaction-icon ${entry.entryType.toLowerCase()}`}>
                  {entry.entryType === 'CREDIT' ? '↓' : '↑'}
                </div>
                <div className="transaction-details">
                  <div className="transaction-title">{entry.description}</div>
                  <div className="transaction-meta">
                    {formatDate(entry.createdAt)}
                    {entry.transferId && <span style={{ marginLeft: 8, opacity: 0.7 }}>ID: {entry.transferId.slice(0, 8)}...</span>}
                  </div>
                </div>
                <div className="transaction-amount-col" style={{ textAlign: 'right' }}>
                  <div className={`transaction-amount ${entry.entryType.toLowerCase()}`}>
                    {entry.entryType === 'CREDIT' ? '+' : '−'}₹{formatAmount(entry.amountMinor)}
                  </div>
                  <div className="text-muted text-xs mt-1">Balance: ₹{formatAmount(entry.balanceAfter)}</div>
                </div>
              </div>
            ))
          )
        ) : (
          transfers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">↗</div>
              <div className="empty-state-title">No transfers yet</div>
            </div>
          ) : (
            transfers.map((t) => (
              <div key={t.id} className="transaction-item" id={`transfer-${t.id}`}>
                <div className={`transaction-icon ${t.sourceAccountId === selectedAccount ? 'debit' : 'credit'}`}>
                  {t.sourceAccountId === selectedAccount ? '↑' : '↓'}
                </div>
                <div className="transaction-details">
                  <div className="transaction-title">{t.description}</div>
                  <div className="transaction-meta">
                    {formatDate(t.createdAt)}
                    {t.failureReason && <span style={{ color: 'var(--color-danger)', marginLeft: 8 }}>{t.failureReason}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={`transaction-amount ${t.sourceAccountId === selectedAccount ? 'debit' : 'credit'}`}>
                    {t.sourceAccountId === selectedAccount ? '−' : '+'}₹{formatAmount(t.amountMinor)}
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <span className={`status-badge status-${t.status}`}>{t.status}</span>
                  </div>
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
