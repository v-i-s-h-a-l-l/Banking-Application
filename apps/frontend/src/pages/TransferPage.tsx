import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { accountApi, transferApi } from '../api';
import { uuidv4 } from '../uuid';

interface Account {
  id: string;
  accountNumber: string;
  accountType: string;
  balanceMinor: string;
  currency: string;
}

interface Transfer {
  id: string;
  status: 'CREATED' | 'PROCESSING' | 'DEBITED' | 'CREDITED' | 'COMPLETED' | 'FAILED';
  failureReason?: string;
  amountMinor: string;
}

function formatBalance(minor: string): string {
  return (Number(minor) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

// Poll transfer status every 2s until terminal state
function useTransferPolling(transferId: string | null) {
  const [transfer, setTransfer] = useState<Transfer | null>(null);

  useEffect(() => {
    if (!transferId) return;
    let cancelled = false;

    const poll = async () => {
      while (!cancelled) {
        try {
          const data = await transferApi.get(transferId);
          const t: Transfer = data.data.transfer;
          setTransfer(t);
          if (t.status === 'COMPLETED' || t.status === 'FAILED') break;
        } catch { break; }
        await new Promise((r) => setTimeout(r, 2000));
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [transferId]);

  return transfer;
}

export default function TransferPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({
    sourceAccountId: params.get('from') ?? '',
    destinationAccountId: '',
    amount: '',
    description: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTransferId, setPendingTransferId] = useState<string | null>(null);

  const polledTransfer = useTransferPolling(pendingTransferId);

  useEffect(() => {
    accountApi
      .list()
      .then((d) => setAccounts(d.data.accounts ?? []))
      .catch(() => {});
  }, []);

  const sourceAccount = accounts.find((a) => a.id === form.sourceAccountId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const amountFloat = parseFloat(form.amount);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    const amountMinor = Math.round(amountFloat * 100);
    const destAcc = accounts.find((a) => a.accountNumber === form.destinationAccountId || a.id === form.destinationAccountId);
    const destTarget = destAcc ? destAcc.id : form.destinationAccountId;

    if (form.sourceAccountId === destTarget || (sourceAccount && sourceAccount.accountNumber === form.destinationAccountId)) {
      setError('Source and destination must be different accounts');
      return;
    }

    setIsLoading(true);
    const idempotencyKey = uuidv4();

    try {
      const data = await transferApi.create(
        form.sourceAccountId,
        destTarget,
        amountMinor,
        form.description || 'Transfer',
        idempotencyKey,
      );
      setPendingTransferId(data.data.transfer.id);
    } catch (err: any) {
      setError(err?.error?.message ?? 'Transfer failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const terminalStatus = polledTransfer?.status === 'COMPLETED' || polledTransfer?.status === 'FAILED';

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div className="page-header">
        <h1 className="page-title">Send Money</h1>
        <p className="page-subtitle">Transfer funds securely between accounts</p>
      </div>

      {/* Transfer result */}
      {polledTransfer && (
        <div
          className={`alert ${polledTransfer.status === 'COMPLETED' ? 'alert-success' : polledTransfer.status === 'FAILED' ? 'alert-error' : 'alert-info'} mb-4`}
          id="transfer-status-alert"
        >
          <span>
            {polledTransfer.status === 'COMPLETED' && '✓ '}
            {polledTransfer.status === 'FAILED' && '✕ '}
            {!terminalStatus && '⟳ '}
          </span>
          <div>
            <div style={{ fontWeight: 600 }}>
              Transfer {
                polledTransfer.status === 'COMPLETED' ? 'Completed!' :
                polledTransfer.status === 'FAILED' ? 'Failed' :
                'Processing...'
              }
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '2px' }}>
              Status: <span className={`status-badge status-${polledTransfer.status}`} style={{ display: 'inline-flex' }}>{polledTransfer.status}</span>
              {polledTransfer.failureReason && ` — ${polledTransfer.failureReason}`}
            </div>
          </div>
        </div>
      )}

      {/* Transfer form */}
      {(!polledTransfer || !terminalStatus) && (
        <div className="card-glass">
          <form onSubmit={handleSubmit} id="transfer-form">
            {error && (
              <div className="alert alert-error mb-4">⚠ {error}</div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="sourceAccount">From account</label>
              <select
                id="sourceAccount"
                className="form-input form-select"
                value={form.sourceAccountId}
                onChange={(e) => setForm({ ...form, sourceAccountId: e.target.value })}
                required
                disabled={isLoading}
              >
                <option value="">Select source account</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountNumber} — ₹{formatBalance(acc.balanceMinor)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="destinationAccount">To account (Account Number or ID)</label>
              <input
                id="destinationAccount"
                type="text"
                className="form-input"
                placeholder="e.g. ACC315681532746 or account ID"
                value={form.destinationAccountId}
                onChange={(e) => setForm({ ...form, destinationAccountId: e.target.value.trim() })}
                required
                disabled={isLoading}
              />
              {accounts.filter((a) => a.id !== form.sourceAccountId && a.accountNumber !== form.sourceAccountId).length > 0 && (
                <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>My other accounts:</span>
                  {accounts
                    .filter((a) => a.id !== form.sourceAccountId && a.accountNumber !== form.sourceAccountId)
                    .map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setForm({ ...form, destinationAccountId: acc.accountNumber })}
                        style={{
                          background: form.destinationAccountId === acc.accountNumber || form.destinationAccountId === acc.id ? 'var(--color-primary-light, #2563eb22)' : 'var(--bg-glass-card, #ffffff10)',
                          border: form.destinationAccountId === acc.accountNumber || form.destinationAccountId === acc.id ? '1px solid var(--color-primary, #3b82f6)' : '1px solid #ffffff20',
                          color: 'var(--text-primary, #fff)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        {acc.accountNumber} (₹{formatBalance(acc.balanceMinor)})
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="amount">Amount (₹)</label>
              <input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                className="form-input"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="description">Description</label>
              <input
                id="description"
                type="text"
                className="form-input"
                placeholder="What's this for?"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                disabled={isLoading}
              />
            </div>

            {form.amount && parseFloat(form.amount) > 0 && sourceAccount && (
              <div className="transfer-summary">
                <div className="transfer-summary-row">
                  <span className="transfer-summary-label">From</span>
                  <span className="transfer-summary-value">{sourceAccount.accountNumber}</span>
                </div>
                <div className="transfer-summary-row">
                  <span className="transfer-summary-label">Amount</span>
                  <span className="transfer-summary-value">₹{parseFloat(form.amount).toFixed(2)}</span>
                </div>
                <div className="transfer-summary-row">
                  <span className="transfer-summary-label">Balance after</span>
                  <span className="transfer-summary-value">
                    ₹{formatBalance(String(Math.max(0, Number(sourceAccount.balanceMinor) - Math.round(parseFloat(form.amount) * 100))))}
                  </span>
                </div>
              </div>
            )}

            <button
              id="transfer-submit"
              type="submit"
              className="btn btn-primary btn-lg btn-full mt-2"
              disabled={isLoading || !!pendingTransferId}
            >
              {isLoading ? <><div className="spinner" /> Initiating...</> : 'Send Money'}
            </button>
          </form>
        </div>
      )}

      {terminalStatus && (
        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
          <button
            className="btn btn-secondary btn-full"
            onClick={() => { setPendingTransferId(null); setForm({ ...form, amount: '', description: '' }); }}
          >
            New Transfer
          </button>
          <button className="btn btn-primary btn-full" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
