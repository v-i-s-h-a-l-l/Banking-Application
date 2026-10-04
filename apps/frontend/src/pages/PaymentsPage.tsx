import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { accountApi, transferApi } from '../api';
import { uuidv4 } from '../uuid';
import toast from 'react-hot-toast';
import {
  Zap,
  Plus,
  Trash2,
  Clock,
  CheckCircle,
  X,
  Calendar,
} from 'lucide-react';

interface Account {
  id: string;
  accountNumber: string;
  balanceMinor: string;
}

interface ScheduledPayment {
  id: string;
  name: string;
  recipientAccount: string;
  amount: number; // in rupees
  frequency: 'weekly' | 'monthly';
  nextDue: string; // ISO date string
  sourceAccountId: string;
  category: string;
}

const BILL_PRESETS = [
  { label: 'Electricity', icon: '⚡', category: 'Utilities', defaultAmount: 1200 },
  { label: 'Internet', icon: '🌐', category: 'Utilities', defaultAmount: 799 },
  { label: 'Water', icon: '💧', category: 'Utilities', defaultAmount: 350 },
  { label: 'Mobile Recharge', icon: '📱', category: 'Telecom', defaultAmount: 299 },
  { label: 'Netflix', icon: '🎬', category: 'Entertainment', defaultAmount: 649 },
  { label: 'LPG Gas', icon: '🔥', category: 'Utilities', defaultAmount: 920 },
  { label: 'DTH / Cable', icon: '📺', category: 'Entertainment', defaultAmount: 499 },
  { label: 'Insurance', icon: '🛡️', category: 'Finance', defaultAmount: 2500 },
];

function loadScheduled(): ScheduledPayment[] {
  try {
    const raw = localStorage.getItem('nexbank_scheduled_payments');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveScheduled(list: ScheduledPayment[]) {
  localStorage.setItem('nexbank_scheduled_payments', JSON.stringify(list));
}

function formatCurrency(amount: number) {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function formatBalance(minor: string) {
  return (Number(minor) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function nextDueDate(freq: 'weekly' | 'monthly'): string {
  const d = new Date();
  if (freq === 'weekly') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  const now = new Date();
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function PaymentsPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledPayment[]>(loadScheduled());
  const [payingId, setPayingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [presetFill, setPresetFill] = useState<{ label: string; amount: number } | null>(null);

  // New scheduled payment form
  const [newForm, setNewForm] = useState({
    name: '',
    recipientAccount: '',
    amount: '',
    frequency: 'monthly' as 'weekly' | 'monthly',
    sourceAccountId: '',
    category: 'Other',
  });

  useEffect(() => {
    accountApi
      .list()
      .then((d) => {
        const accs = d.data.accounts ?? [];
        setAccounts(accs);
        if (accs.length && !newForm.sourceAccountId) {
          setNewForm((f) => ({ ...f, sourceAccountId: accs[0].id }));
        }
      })
      .catch(() => {});
  }, []);

  // When a preset is clicked, open quick-pay by navigating to transfer
  const handlePresetQuickPay = (preset: typeof BILL_PRESETS[0]) => {
    const sourceId = accounts[0]?.id ?? '';
    navigate(`/transfer?from=${sourceId}`);
    toast(`Pre-filling transfer for ${preset.label}`, { icon: preset.icon });
  };

  const handleAddScheduled = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.name || !newForm.recipientAccount || !newForm.amount || !newForm.sourceAccountId) return;

    const payment: ScheduledPayment = {
      id: uuidv4(),
      name: newForm.name,
      recipientAccount: newForm.recipientAccount,
      amount: parseFloat(newForm.amount),
      frequency: newForm.frequency,
      nextDue: nextDueDate(newForm.frequency),
      sourceAccountId: newForm.sourceAccountId,
      category: newForm.category,
    };

    const updated = [...scheduled, payment];
    setScheduled(updated);
    saveScheduled(updated);
    setShowModal(false);
    setNewForm({ name: '', recipientAccount: '', amount: '', frequency: 'monthly', sourceAccountId: accounts[0]?.id ?? '', category: 'Other' });
    toast.success(`Scheduled "${payment.name}" added`);
  };

  const handleDelete = (id: string) => {
    const updated = scheduled.filter((p) => p.id !== id);
    setScheduled(updated);
    saveScheduled(updated);
    toast.success('Scheduled payment removed');
  };

  const handlePayNow = async (payment: ScheduledPayment) => {
    setPayingId(payment.id);
    try {
      const amountMinor = Math.round(payment.amount * 100);
      await transferApi.create(
        payment.sourceAccountId,
        payment.recipientAccount,
        amountMinor,
        `Bill Payment — ${payment.name}`,
        uuidv4(),
      );
      // Update next due
      const updated = scheduled.map((p) =>
        p.id === payment.id ? { ...p, nextDue: nextDueDate(p.frequency) } : p
      );
      setScheduled(updated);
      saveScheduled(updated);
      toast.success(`₹${formatCurrency(payment.amount)} paid for ${payment.name}!`);
    } catch (err: any) {
      toast.error(err?.error?.message ?? 'Payment failed');
    } finally {
      setPayingId(null);
    }
  };

  const sourceAccount = (id: string) => accounts.find((a) => a.id === id);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Bill Payments</h1>
        <p className="page-subtitle">Quick pay bills and manage recurring payments</p>
      </div>

      {/* Quick Pay Presets */}
      <div className="card" style={{ padding: '24px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <Zap size={18} style={{ color: '#f59e0b' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Quick Pay</h2>
          <span className="text-muted text-xs" style={{ marginLeft: '4px' }}>Tap to pre-fill a transfer</span>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: '12px',
        }}>
          {BILL_PRESETS.map((preset) => (
            <button
              key={preset.label}
              id={`quick-pay-${preset.label.replace(/\s+/g, '-').toLowerCase()}`}
              onClick={() => handlePresetQuickPay(preset)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: '14px',
                padding: '16px 12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                color: 'var(--color-text)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.12)';
                (e.currentTarget as HTMLElement).style.border = '1px solid rgba(99,102,241,0.35)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                (e.currentTarget as HTMLElement).style.border = '1px solid rgba(255,255,255,0.09)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              }}
            >
              <div style={{ fontSize: '1.75rem' }}>{preset.icon}</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 500, textAlign: 'center' }}>{preset.label}</div>
              <div className="text-muted text-xs">~₹{formatCurrency(preset.defaultAmount)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Scheduled Payments */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={18} style={{ color: '#818cf8' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Scheduled Payments</h2>
          {scheduled.length > 0 && (
            <span style={{
              background: 'rgba(99,102,241,0.2)',
              color: '#818cf8',
              borderRadius: '999px',
              padding: '2px 8px',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}>
              {scheduled.length}
            </span>
          )}
        </div>
        <button
          id="add-scheduled-btn"
          onClick={() => setShowModal(true)}
          className="btn btn-primary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={14} /> Add Scheduled
        </button>
      </div>

      {scheduled.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <div className="empty-state-title">No scheduled payments</div>
            <p className="text-muted text-sm mt-2">Add recurring payments to automate your bills</p>
            <button onClick={() => setShowModal(true)} className="btn btn-primary mt-4">
              + Add First Payment
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {scheduled.map((payment) => {
            const days = daysUntil(payment.nextDue);
            const acc = sourceAccount(payment.sourceAccountId);
            const isOverdue = days < 0;
            const isDueSoon = days <= 3 && days >= 0;

            return (
              <div
                key={payment.id}
                id={`scheduled-${payment.id}`}
                className="card"
                style={{
                  padding: '18px 20px',
                  borderColor: isOverdue ? 'rgba(244,63,94,0.35)' : isDueSoon ? 'rgba(245,158,11,0.35)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '12px',
                    background: 'rgba(99,102,241,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.25rem', flexShrink: 0,
                  }}>
                    {BILL_PRESETS.find((p) => p.label === payment.name)?.icon ?? '💳'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{payment.name}</div>
                    <div className="text-muted text-xs mt-1">
                      {payment.frequency === 'monthly' ? 'Monthly' : 'Weekly'} · To: {payment.recipientAccount.slice(0, 14)}...
                    </div>
                    {acc && (
                      <div className="text-muted text-xs">From: {acc.accountNumber}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>₹{formatCurrency(payment.amount)}</div>
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      marginTop: '2px',
                      color: isOverdue ? '#f43f5e' : isDueSoon ? '#f59e0b' : 'var(--color-text-muted)',
                    }}>
                      <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />
                      {isOverdue ? `Overdue by ${-days}d` : days === 0 ? 'Due today' : `Due in ${days}d`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={() => handlePayNow(payment)}
                      disabled={payingId === payment.id}
                      className="btn btn-primary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                      id={`pay-now-${payment.id}`}
                    >
                      {payingId === payment.id ? (
                        <><div className="spinner" style={{ width: 12, height: 12 }} /> Paying...</>
                      ) : (
                        <><CheckCircle size={13} /> Pay Now</>
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(payment.id)}
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', padding: '6px 10px' }}
                      id={`delete-scheduled-${payment.id}`}
                    >
                      <Trash2 size={13} style={{ color: '#f43f5e' }} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Scheduled Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '20px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="card" style={{ padding: '28px', width: '100%', maxWidth: '440px', margin: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Add Scheduled Payment</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddScheduled} id="add-scheduled-form">
              <div className="form-group">
                <label className="form-label">Payment Name</label>
                <input
                  className="form-input"
                  placeholder="e.g. Electricity Bill"
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">From Account</label>
                <select
                  className="form-input form-select"
                  value={newForm.sourceAccountId}
                  onChange={(e) => setNewForm({ ...newForm, sourceAccountId: e.target.value })}
                  required
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.accountNumber} — ₹{formatBalance(acc.balanceMinor)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Recipient Account Number</label>
                <input
                  className="form-input"
                  placeholder="e.g. ACC315681532746"
                  value={newForm.recipientAccount}
                  onChange={(e) => setNewForm({ ...newForm, recipientAccount: e.target.value })}
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Amount (₹)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="0.00"
                    value={newForm.amount}
                    onChange={(e) => setNewForm({ ...newForm, amount: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Frequency</label>
                  <select
                    className="form-input form-select"
                    value={newForm.frequency}
                    onChange={(e) => setNewForm({ ...newForm, frequency: e.target.value as any })}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary btn-full">Cancel</button>
                <button type="submit" className="btn btn-primary btn-full" id="submit-scheduled">Add Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
