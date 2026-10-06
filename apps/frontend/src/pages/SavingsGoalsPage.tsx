import React, { useEffect, useState } from 'react';
import { accountApi, transferApi } from '../api';
import { uuidv4 } from '../uuid';
import toast from 'react-hot-toast';
import {
  Target,
  Plus,
  X,
  Trash2,
  CheckCircle,
  Clock,
  TrendingUp,
  Zap,
  Gift,
  Home,
  Plane,
  GraduationCap,
  Car,
  Heart,
  Laptop,
  ShoppingBag,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'nexbank_savings_goals';

const GOAL_PRESETS = [
  { label: 'Vacation',    icon: '✈️',  color: '#06b6d4', target: 50000  },
  { label: 'New Home',   icon: '🏠',  color: '#6366f1', target: 500000 },
  { label: 'Education',  icon: '🎓',  color: '#f59e0b', target: 200000 },
  { label: 'New Car',    icon: '🚗',  color: '#22d3ee', target: 800000 },
  { label: 'Emergency',  icon: '🛡️', color: '#f43f5e', target: 100000 },
  { label: 'Laptop',     icon: '💻',  color: '#8b5cf6', target: 80000  },
  { label: 'Wedding',    icon: '💍',  color: '#ec4899', target: 500000 },
  { label: 'Shopping',   icon: '🛍️', color: '#10b981', target: 30000  },
];

// ── Types ─────────────────────────────────────────────────────────────────
interface Account { id: string; accountNumber: string; balanceMinor: string; }

interface SavingsGoal {
  id: string;
  name: string;
  emoji: string;
  color: string;
  targetAmount: number;      // rupees
  savedAmount: number;       // rupees
  accountId: string;
  accountNumber: string;
  deadline: string;          // ISO date
  autoContribute: number;    // monthly, rupees (0 = manual)
  createdAt: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CLOSED';
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatCurrency(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatBalance(minor: string | number): string {
  return (Number(minor) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function monthsToDeadline(deadline: string): number {
  const now = new Date();
  const dl = new Date(deadline);
  return Math.max(0, (dl.getFullYear() - now.getFullYear()) * 12 + (dl.getMonth() - now.getMonth()));
}
function suggestMonthly(target: number, saved: number, deadline: string): number {
  const months = monthsToDeadline(deadline);
  if (months <= 0) return target - saved;
  return Math.ceil((target - saved) / months);
}

function loadGoals(): SavingsGoal[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function saveGoals(g: SavingsGoal[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(g)); }

// ── Ring progress SVG ─────────────────────────────────────────────────────
function Ring({ percent, color, size = 80, strokeWidth = 8, children }: {
  percent: number; color: string; size?: number; strokeWidth?: number; children?: React.ReactNode;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (Math.min(100, percent) / 100) * circ;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}

// ── Add Goal Modal ─────────────────────────────────────────────────────────
function AddGoalModal({ accounts, onAdd, onClose }: {
  accounts: Account[];
  onAdd: (g: SavingsGoal) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: '', emoji: '🎯', color: '#6366f1',
    targetAmount: '', savedAmount: '0',
    accountId: accounts[0]?.id ?? '', deadline: '', autoContribute: '0',
  });
  const [selectedPreset, setSelectedPreset] = useState<typeof GOAL_PRESETS[0] | null>(null);

  const deadline = form.deadline;
  const target = parseFloat(form.targetAmount) || 0;
  const saved = parseFloat(form.savedAmount) || 0;
  const suggested = deadline ? suggestMonthly(target, saved, deadline) : 0;
  const months = deadline ? monthsToDeadline(deadline) : 0;

  const applyPreset = (p: typeof GOAL_PRESETS[0]) => {
    setSelectedPreset(p);
    setForm((f) => ({ ...f, name: p.label, emoji: p.icon, color: p.color, targetAmount: String(p.target) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.targetAmount || !form.deadline || !form.accountId) {
      toast.error('Please fill all required fields'); return;
    }
    const acc = accounts.find((a) => a.id === form.accountId);
    const goal: SavingsGoal = {
      id: uuidv4(),
      name: form.name, emoji: form.emoji, color: form.color,
      targetAmount: parseFloat(form.targetAmount),
      savedAmount: parseFloat(form.savedAmount) || 0,
      accountId: form.accountId,
      accountNumber: acc?.accountNumber ?? '',
      deadline: form.deadline,
      autoContribute: parseFloat(form.autoContribute) || 0,
      createdAt: new Date().toISOString(),
      status: 'ACTIVE',
    };
    onAdd(goal);
    onClose();
  };

  // Min date = tomorrow
  const minDate = new Date(); minDate.setDate(minDate.getDate() + 30);
  const minDateStr = minDate.toISOString().split('T')[0];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" style={{ padding: '28px', width: '100%', maxWidth: '520px', margin: 0, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Create Savings Goal</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={20} /></button>
        </div>

        {/* Preset grid */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '10px', fontWeight: 600 }}>QUICK PRESETS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {GOAL_PRESETS.map((p) => (
              <button key={p.label} onClick={() => applyPreset(p)} type="button"
                style={{ padding: '10px 6px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                  border: selectedPreset?.label === p.label ? `2px solid ${p.color}` : '2px solid rgba(255,255,255,0.07)',
                  background: selectedPreset?.label === p.label ? `${p.color}18` : 'rgba(255,255,255,0.03)',
                  color: 'var(--color-text)', transition: 'all 0.15s' }}>
                <div style={{ fontSize: '1.3rem' }}>{p.icon}</div>
                <div style={{ fontSize: '0.65rem', marginTop: '4px', color: 'var(--color-text-muted)', fontWeight: 500 }}>{p.label}</div>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} id="add-goal-form">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Goal Name *</label>
              <input className="form-input" placeholder="e.g. Europe Trip 2025" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Target Amount (₹) *</label>
              <input className="form-input" type="number" min="100" placeholder="e.g. 50000" value={form.targetAmount}
                onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Already Saved (₹)</label>
              <input className="form-input" type="number" min="0" placeholder="0" value={form.savedAmount}
                onChange={(e) => setForm({ ...form, savedAmount: e.target.value })} />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Target Deadline *</label>
              <input className="form-input" type="date" min={minDateStr} value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })} required />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Source Account</label>
              <select className="form-input form-select" value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.accountNumber} — ₹{formatBalance(acc.balanceMinor)}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">
                Monthly Auto-Contribution (₹)
                {suggested > 0 && (
                  <button type="button" onClick={() => setForm({ ...form, autoContribute: String(suggested) })}
                    style={{ marginLeft: '8px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
                      color: '#818cf8', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600 }}>
                    Suggested: ₹{suggested.toLocaleString('en-IN')}
                  </button>
                )}
              </label>
              <input className="form-input" type="number" min="0" placeholder="0 = manual only" value={form.autoContribute}
                onChange={(e) => setForm({ ...form, autoContribute: e.target.value })} />
              {months > 0 && target > 0 && (
                <div className="text-muted text-xs mt-1">
                  {months} months until deadline · need ₹{suggested.toLocaleString('en-IN')}/month to hit target
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary btn-full">Cancel</button>
            <button type="submit" className="btn btn-primary btn-full" id="submit-goal" style={{ background: `linear-gradient(135deg, ${form.color}, ${form.color}bb)` }}>
              Create Goal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Contribute Modal ──────────────────────────────────────────────────────
function ContributeModal({ goal, accounts, onContribute, onClose }: {
  goal: SavingsGoal; accounts: Account[]; onContribute: (goalId: string, amount: number) => void; onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(goal.autoContribute || ''));
  const remaining = goal.targetAmount - goal.savedAmount;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" style={{ padding: '28px', width: '100%', maxWidth: '380px', margin: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <span style={{ fontSize: '1.8rem' }}>{goal.emoji}</span>
          <div>
            <div style={{ fontWeight: 700 }}>{goal.name}</div>
            <div className="text-muted text-xs">₹{formatCurrency(goal.savedAmount)} / ₹{formatCurrency(goal.targetAmount)}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
        </div>
        <div className="form-group">
          <label className="form-label">Contribution Amount (₹)</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontWeight: 600 }}>₹</span>
            <input id="contribute-amount" type="number" min="1" className="form-input" value={amount}
              onChange={(e) => setAmount(e.target.value)} style={{ paddingLeft: '30px', fontWeight: 700, fontSize: '1.2rem' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {[500, 1000, 2000, 5000, Math.ceil(remaining)].filter((v) => v > 0).map((amt) => (
            <button key={amt} onClick={() => setAmount(String(amt))}
              style={{ padding: '4px 10px', borderRadius: '7px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                border: `1px solid ${goal.color}44`, background: `${goal.color}18`, color: goal.color }}>
              {amt === Math.ceil(remaining) ? 'Full ₹' + amt.toLocaleString('en-IN') : `₹${amt >= 1000 ? `${amt / 1000}K` : amt}`}
            </button>
          ))}
        </div>
        <button id="confirm-contribute" onClick={() => { onContribute(goal.id, parseFloat(amount) || 0); onClose(); }}
          disabled={!amount || parseFloat(amount) <= 0}
          className="btn btn-primary btn-full btn-lg"
          style={{ background: `linear-gradient(135deg, ${goal.color}, ${goal.color}bb)` }}>
          <Zap size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
          Add ₹{parseFloat(amount || '0').toLocaleString('en-IN')} to Goal
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function SavingsGoalsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>(loadGoals());
  const [showAdd, setShowAdd] = useState(false);
  const [contributeGoal, setContributeGoal] = useState<SavingsGoal | null>(null);

  useEffect(() => {
    accountApi.list().then((d) => setAccounts(d.data.accounts ?? [])).catch(() => {});
  }, []);

  const handleAdd = (g: SavingsGoal) => {
    const updated = [...goals, g];
    setGoals(updated); saveGoals(updated);
    toast.success(`Goal "${g.name}" created! 🎯`);
  };

  const handleContribute = async (goalId: string, amount: number) => {
    if (amount <= 0) return;
    const g = goals.find((gl) => gl.id === goalId);
    if (!g) return;

    try {
      await accountApi.debit(
        g.accountId,
        Math.round(amount * 100),
        `Savings Goal Contribution — ${g.name}`,
      );
      const accData = await accountApi.list();
      setAccounts(accData.data.accounts ?? []);
    } catch (err: any) {
      toast.error(err?.error?.message || 'Failed to deduct contribution from account');
      return;
    }

    const newSaved = g.savedAmount + amount;
    const isComplete = newSaved >= g.targetAmount;
    const updated = goals.map((gl) =>
      gl.id === goalId
        ? { ...gl, savedAmount: Math.min(newSaved, gl.targetAmount), status: isComplete ? 'COMPLETED' as const : gl.status }
        : gl
    );
    setGoals(updated); saveGoals(updated);

    if (isComplete) {
      toast.success(`🎉 Goal "${g.name}" completed! You did it!`, { duration: 4000 });
    } else {
      toast.success(`₹${formatCurrency(amount)} added to "${g.name}"`);
    }
  };

  const handleDelete = (id: string) => {
    const updated = goals.filter((g) => g.id !== id);
    setGoals(updated); saveGoals(updated);
    toast('Goal removed.');
  };

  const activeGoals = goals.filter((g) => g.status === 'ACTIVE');
  const completedGoals = goals.filter((g) => g.status === 'COMPLETED');

  const totalTarget = activeGoals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = activeGoals.reduce((s, g) => s + g.savedAmount, 0);
  const overallPct = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Target size={28} style={{ color: '#10b981' }} /> Savings Goals
          </h1>
          <p className="page-subtitle">Set targets, track progress, and achieve your financial dreams</p>
        </div>
        <button id="add-goal-btn" onClick={() => setShowAdd(true)}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #10b981, #059669)' }}>
          <Plus size={16} /> New Goal
        </button>
      </div>

      {/* Overall summary */}
      {activeGoals.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(6,182,212,0.08) 100%)',
          border: '1px solid rgba(16,185,129,0.3)', borderRadius: '20px', padding: '24px 28px', marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', marginBottom: '6px' }}>Overall Progress — {activeGoals.length} active goals</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
                <span style={{ color: '#10b981' }}>₹{formatCurrency(totalSaved)}</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}> / ₹{formatCurrency(totalTarget)}</span>
              </div>
            </div>
            <Ring percent={overallPct} color="#10b981" size={90} strokeWidth={9}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#10b981' }}>{overallPct.toFixed(0)}%</div>
            </Ring>
          </div>
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.82rem' }}>
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>₹{formatCurrency(totalSaved)} saved</span>
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>₹{formatCurrency(totalTarget - totalSaved)} remaining</span>
            </div>
            <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '4px', width: `${Math.min(100, overallPct)}%`,
                background: 'linear-gradient(90deg, #10b981, #22d3ee)', transition: 'width 0.5s' }} />
            </div>
          </div>
        </div>
      )}

      {/* Goal cards */}
      {activeGoals.length === 0 && completedGoals.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '48px' }}>
            <div className="empty-state-icon" style={{ fontSize: '2.5rem' }}>🎯</div>
            <div className="empty-state-title">No savings goals yet</div>
            <p className="text-muted text-sm mt-2">Set a goal — vacation, home, education or anything you dream of</p>
            <button onClick={() => setShowAdd(true)} className="btn btn-primary mt-4"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              <Plus size={15} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
              Create First Goal
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '18px' }}>
          {activeGoals.map((goal) => {
            const pct = Math.min(100, (goal.savedAmount / goal.targetAmount) * 100);
            const remaining = goal.targetAmount - goal.savedAmount;
            const months = monthsToDeadline(goal.deadline);
            const monthlyNeeded = months > 0 ? Math.ceil(remaining / months) : remaining;

            return (
              <div key={goal.id} id={`goal-${goal.id}`} className="card" style={{ padding: '22px', position: 'relative', overflow: 'hidden' }}>
                {/* Color accent bar */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                  background: `linear-gradient(90deg, ${goal.color}, ${goal.color}66)` }} />

                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Ring percent={pct} color={goal.color} size={64} strokeWidth={6}>
                      <span style={{ fontSize: '1.2rem' }}>{goal.emoji}</span>
                    </Ring>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>{goal.name}</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: goal.color, marginTop: '2px' }}>
                        {pct.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(goal.id)} id={`delete-goal-${goal.id}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)',
                      padding: '4px', borderRadius: '6px', transition: 'color 0.2s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#f43f5e')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}>
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Progress */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.82rem' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>₹{formatCurrency(goal.savedAmount)}</span>
                    <span style={{ fontWeight: 600 }}>₹{formatCurrency(goal.targetAmount)}</span>
                  </div>
                  <div style={{ height: '7px', borderRadius: '4px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '4px', width: `${pct}%`,
                      background: `linear-gradient(90deg, ${goal.color}, ${goal.color}bb)`, transition: 'width 0.5s' }} />
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                  {[
                    { label: 'Remaining', value: `₹${formatCurrency(remaining)}` },
                    { label: 'Deadline', value: formatDate(goal.deadline) },
                    { label: 'Months Left', value: months > 0 ? `${months} months` : 'Overdue!' },
                    { label: 'Need/Month', value: `₹${monthlyNeeded.toLocaleString('en-IN')}` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ padding: '9px 10px', borderRadius: '9px',
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '0.67rem', color: 'var(--color-text-muted)', marginBottom: '3px' }}>{label}</div>
                      <div style={{ fontSize: '0.83rem', fontWeight: 700 }}>{value}</div>
                    </div>
                  ))}
                </div>

                {goal.autoContribute > 0 && (
                  <div style={{ padding: '8px 12px', borderRadius: '8px', background: `${goal.color}12`,
                    border: `1px solid ${goal.color}30`, fontSize: '0.78rem', color: goal.color, marginBottom: '12px',
                    display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={12} />
                    Auto-saving ₹{formatCurrency(goal.autoContribute)}/month
                  </div>
                )}

                <button onClick={() => setContributeGoal(goal)} id={`contribute-${goal.id}`}
                  className="btn btn-full"
                  style={{ background: `linear-gradient(135deg, ${goal.color}22, ${goal.color}11)`,
                    border: `1px solid ${goal.color}44`, color: goal.color, borderRadius: '10px',
                    padding: '10px', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    transition: 'all 0.2s' }}>
                  <Zap size={15} /> Add Money
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed Goals */}
      {completedGoals.length > 0 && (
        <div style={{ marginTop: '36px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={18} style={{ color: '#10b981' }} />
            Completed Goals 🎉
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
            {completedGoals.map((goal) => (
              <div key={goal.id} className="card" style={{ padding: '18px 20px',
                background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '1.8rem' }}>{goal.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{goal.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
                      ₹{formatCurrency(goal.targetAmount)} — Goal achieved! ✓
                    </div>
                  </div>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%',
                    background: 'rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle size={18} style={{ color: '#10b981' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showAdd && <AddGoalModal accounts={accounts} onAdd={handleAdd} onClose={() => setShowAdd(false)} />}
      {contributeGoal && (
        <ContributeModal goal={contributeGoal} accounts={accounts}
          onContribute={handleContribute} onClose={() => setContributeGoal(null)} />
      )}
    </div>
  );
}
