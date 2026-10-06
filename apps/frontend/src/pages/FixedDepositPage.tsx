import React, { useEffect, useState } from 'react';
import { accountApi, transferApi } from '../api';
import { uuidv4 } from '../uuid';
import toast from 'react-hot-toast';
import {
  Landmark,
  TrendingUp,
  Calendar,
  CheckCircle,
  Trash2,
  Clock,
  Info,
  Shield,
  ChevronRight,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────
const MIN_AMOUNT = 5000; // ₹
const STORAGE_KEY = 'nexbank_fixed_deposits';

// Tiered interest rates by tenure (days)
const FD_RATES: { label: string; days: number; rate: number; badge?: string }[] = [
  { label: '7 – 14 days',   days: 7,    rate: 4.50 },
  { label: '15 – 29 days',  days: 15,   rate: 5.00 },
  { label: '1 – 2 months',  days: 30,   rate: 5.75 },
  { label: '3 – 5 months',  days: 90,   rate: 6.50 },
  { label: '6 – 11 months', days: 180,  rate: 6.90 },
  { label: '1 Year',        days: 365,  rate: 7.10, badge: 'Popular' },
  { label: '2 Years',       days: 730,  rate: 7.25 },
  { label: '3 Years',       days: 1095, rate: 7.50, badge: 'Best Rate' },
  { label: '5 Years',       days: 1825, rate: 7.50 },
];

// ── Types ──────────────────────────────────────────────────────────────────
interface Account {
  id: string;
  accountNumber: string;
  balanceMinor: string;
}

interface FixedDeposit {
  id: string;
  accountId: string;
  accountNumber: string;
  amount: number;
  days: number;
  label: string;
  rate: number;
  compounding: 'quarterly' | 'monthly' | 'simple';
  startDate: string;
  maturityDate: string;
  maturityAmount: number;
  interestEarned: number;
  status: 'ACTIVE' | 'MATURED' | 'CLOSED';
}

// ── Calculation ────────────────────────────────────────────────────────────
function calcFD(
  principal: number,
  rate: number,
  days: number,
  compounding: 'quarterly' | 'monthly' | 'simple',
): { maturity: number; interest: number } {
  const years = days / 365;
  let maturity: number;

  if (compounding === 'simple') {
    maturity = principal * (1 + (rate / 100) * years);
  } else {
    const n = compounding === 'quarterly' ? 4 : 12;
    maturity = principal * Math.pow(1 + rate / 100 / n, n * years);
  }

  maturity = Math.round(maturity * 100) / 100;
  return { maturity, interest: Math.round((maturity - principal) * 100) / 100 };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatCurrency(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBalance(minor: string | number): string {
  return (Number(minor) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

function loadFDs(): FixedDeposit[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function saveFDs(fds: FixedDeposit[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fds));
}

// ── Donut ──────────────────────────────────────────────────────────────────
function MiniDonut({ percent }: { percent: number }) {
  const r = 50; const circ = 2 * Math.PI * r;
  const interestArc = (percent / 100) * circ;
  return (
    <svg width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="14" />
      <circle cx="65" cy="65" r={r} fill="none" stroke="#6366f1" strokeWidth="14"
        strokeDasharray={`${circ - interestArc} ${interestArc}`}
        strokeDashoffset={circ / 4} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }} />
      <circle cx="65" cy="65" r={r} fill="none" stroke="#22d3ee" strokeWidth="14"
        strokeDasharray={`${interestArc} ${circ - interestArc}`}
        strokeDashoffset={circ / 4 - (circ - interestArc)} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }} />
      <text x="65" y="60" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="10">Interest</text>
      <text x="65" y="76" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="bold">
        {percent.toFixed(1)}%
      </text>
    </svg>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function FixedDepositPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fds, setFDs] = useState<FixedDeposit[]>(loadFDs());
  const [selectedAccount, setSelectedAccount] = useState('');
  const [amount, setAmount] = useState(10000);
  const [amountInput, setAmountInput] = useState('10000');
  const [selectedRate, setSelectedRate] = useState(FD_RATES[5]); // 1 year default
  const [compounding, setCompounding] = useState<'quarterly' | 'monthly' | 'simple'>('quarterly');
  const [isCreating, setIsCreating] = useState(false);

  const effectiveAmount = Math.max(MIN_AMOUNT, amount);
  const calc = calcFD(effectiveAmount, selectedRate.rate, selectedRate.days, compounding);
  const interestPercent = (calc.interest / calc.maturity) * 100;

  useEffect(() => {
    accountApi.list().then((d) => {
      const accs = d.data.accounts ?? [];
      setAccounts(accs);
      if (accs.length) setSelectedAccount(accs[0].id);
    }).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (amount < MIN_AMOUNT) { toast.error(`Minimum FD amount is ₹${MIN_AMOUNT.toLocaleString('en-IN')}`); return; }
    if (!selectedAccount) { toast.error('Select a source account'); return; }
    const acc = accounts.find((a) => a.id === selectedAccount);
    if (acc && Number(acc.balanceMinor) / 100 < amount) {
      toast.error('Insufficient account balance'); return;
    }
    setIsCreating(true);
    const amountMinor = Math.round(amount * 100);
    try {
      await accountApi.debit(
        selectedAccount,
        amountMinor,
        `Fixed Deposit Booking — ${selectedRate.label} @ ${selectedRate.rate}%`,
      );
      const accData = await accountApi.list();
      setAccounts(accData.data.accounts ?? []);
    } catch (err: any) {
      setIsCreating(false);
      toast.error(err?.error?.message || 'Failed to debit account for Fixed Deposit');
      return;
    }

    const now = new Date();
    const fd: FixedDeposit = {
      id: uuidv4(),
      accountId: selectedAccount,
      accountNumber: accounts.find((a) => a.id === selectedAccount)?.accountNumber ?? '',
      amount,
      days: selectedRate.days,
      label: selectedRate.label,
      rate: selectedRate.rate,
      compounding,
      startDate: now.toISOString(),
      maturityDate: addDays(now, selectedRate.days).toISOString(),
      maturityAmount: calc.maturity,
      interestEarned: calc.interest,
      status: 'ACTIVE',
    };
    const updated = [...fds, fd];
    setFDs(updated);
    saveFDs(updated);
    setIsCreating(false);
    toast.success(`FD of ₹${formatCurrency(amount)} booked for ${selectedRate.label}! Balance updated.`);
  };

  const handleClose = async (id: string) => {
    const fd = fds.find((f) => f.id === id);
    if (fd && fd.status === 'ACTIVE') {
      try {
        const creditMinor = Math.round((fd.maturityAmount || fd.amount) * 100);
        await accountApi.credit(
          fd.accountId,
          creditMinor,
          `Fixed Deposit Closure — ${fd.label}`,
        );
        const accData = await accountApi.list();
        setAccounts(accData.data.accounts ?? []);
      } catch (err: any) {
        console.error('Failed to credit closed FD payout:', err);
      }
    }
    const updated = fds.map((f) => (f.id === id ? { ...f, status: 'CLOSED' as const } : f));
    setFDs(updated);
    saveFDs(updated);
    toast.success('FD closed. Funds credited back to your account!', { icon: '💰' });
  };

  const activeFDs = fds.filter((f) => f.status === 'ACTIVE');
  const closedFDs = fds.filter((f) => f.status !== 'ACTIVE');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Landmark size={28} style={{ color: '#f59e0b' }} /> Fixed Deposit
        </h1>
        <p className="page-subtitle">Invest a lump sum and earn up to 7.50% p.a. — 100% secure, guaranteed returns</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '24px', alignItems: 'start' }}>
        {/* LEFT */}
        <div>
          {/* Rate table */}
          <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={16} style={{ color: '#818cf8' }} /> Choose Tenure & Rate
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {FD_RATES.map((tier) => {
                const isActive = selectedRate.days === tier.days;
                return (
                  <button key={tier.days} id={`fd-tier-${tier.days}`} onClick={() => setSelectedRate(tier)}
                    style={{
                      position: 'relative', padding: '14px 12px', borderRadius: '12px', cursor: 'pointer',
                      border: isActive ? '2px solid #f59e0b' : '2px solid rgba(255,255,255,0.07)',
                      background: isActive ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)',
                      color: isActive ? '#f59e0b' : 'var(--color-text-muted)',
                      textAlign: 'left', transition: 'all 0.2s',
                      transform: isActive ? 'translateY(-2px)' : 'none',
                    }}>
                    {tier.badge && (
                      <div style={{ position: 'absolute', top: '-9px', right: '8px',
                        background: tier.badge === 'Best Rate' ? '#f59e0b' : '#6366f1',
                        color: '#fff', fontSize: '0.58rem', fontWeight: 700,
                        padding: '2px 6px', borderRadius: '999px' }}>
                        {tier.badge}
                      </div>
                    )}
                    <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{tier.rate}%</div>
                    <div style={{ fontSize: '0.7rem', marginTop: '3px', fontWeight: 500 }}>{tier.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount + compounding */}
          <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>Deposit Amount & Options</h2>
            <div className="form-group">
              <label className="form-label">Deposit Amount</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '1.1rem' }}>₹</span>
                <input id="fd-amount" type="number" min={MIN_AMOUNT} step="1000"
                  className="form-input"
                  value={amountInput}
                  onChange={(e) => { setAmountInput(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) setAmount(n); }}
                  style={{ paddingLeft: '32px', fontSize: '1.25rem', fontWeight: 700 }} />
              </div>
              {amount < MIN_AMOUNT && <div className="text-sm mt-1" style={{ color: '#f43f5e', display: 'flex', alignItems: 'center', gap: '5px' }}><Info size={13} /> Minimum ₹{MIN_AMOUNT.toLocaleString('en-IN')}</div>}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {[5000, 10000, 25000, 50000, 100000].map((amt) => (
                <button key={amt} onClick={() => { setAmount(amt); setAmountInput(String(amt)); }}
                  style={{ padding: '5px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.15s',
                    border: amount === amt ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
                    background: amount === amt ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
                    color: amount === amt ? '#f59e0b' : 'var(--color-text-muted)' }}>
                  {amt >= 100000 ? `₹${amt / 100000}L` : `₹${amt / 1000}K`}
                </button>
              ))}
            </div>
            <div className="form-group">
              <label className="form-label">Interest Compounding</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['quarterly', 'monthly', 'simple'] as const).map((c) => (
                  <button key={c} onClick={() => setCompounding(c)}
                    style={{ flex: 1, padding: '9px', borderRadius: '10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.15s', textTransform: 'capitalize',
                      border: compounding === c ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
                      background: compounding === c ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                      color: compounding === c ? '#818cf8' : 'var(--color-text-muted)' }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Source Account</label>
              <select id="fd-account" className="form-input form-select" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.accountNumber} — ₹{formatBalance(acc.balanceMinor)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Breakdown */}
          <div className="card" style={{ padding: '24px', marginBottom: '0' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>Return Summary</h2>
            {[
              { label: 'Principal Amount', value: `₹${formatCurrency(effectiveAmount)}` },
              { label: 'Interest Rate', value: `${selectedRate.rate}% p.a. (${compounding})` },
              { label: 'Duration', value: selectedRate.label },
              { label: 'Interest Earned', value: `₹${formatCurrency(calc.interest)}`, color: '#22d3ee' },
              { label: 'Maturity Amount', value: `₹${formatCurrency(calc.maturity)}`, color: '#818cf8', large: true },
            ].map(({ label, value, color, large }, idx, arr) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '11px 0', borderBottom: idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{label}</span>
                <span style={{ fontWeight: large ? 800 : 700, color: color ?? 'var(--color-text)', fontSize: large ? '1.1rem' : '0.9rem' }}>{value}</span>
              </div>
            ))}
            <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '10px',
              background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
              fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
              Deposits insured up to ₹5 Lakhs under DICGC. TDS @ 10% applicable if interest &gt; ₹40,000/year.
            </div>
            <button id="create-fd-btn" onClick={handleCreate} disabled={isCreating || amount < MIN_AMOUNT || !selectedAccount}
              className="btn btn-primary btn-lg btn-full"
              style={{ marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'linear-gradient(135deg, #f59e0b, #f97316)' }}>
              {isCreating ? <><div className="spinner" /> Booking...</> : <><Landmark size={18} /> Book Fixed Deposit</>}
            </button>
          </div>
        </div>

        {/* RIGHT sticky */}
        <div style={{ position: 'sticky', top: '88px' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(249,115,22,0.1))',
            border: '1px solid rgba(245,158,11,0.35)', borderRadius: '20px', padding: '28px 24px', marginBottom: '16px' }}>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', marginBottom: '6px' }}>You receive at maturity</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>
              <span style={{ fontSize: '1.3rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginRight: '2px' }}>₹</span>
              {formatCurrency(calc.maturity)}
            </div>
            <div style={{ marginTop: '6px', fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)' }}>
              {selectedRate.label} · {selectedRate.rate}% {compounding}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0 12px' }}>
              <MiniDonut percent={interestPercent} />
            </div>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              {[{ color: '#6366f1', label: 'Principal', val: formatCurrency(effectiveAmount) },
                { color: '#22d3ee', label: 'Interest', val: formatCurrency(calc.interest) }].map(({ color, label, val }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>
                  <span style={{ color: '#fff', fontWeight: 700 }}>₹{val}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Dates */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '10px' }}>KEY DATES</div>
            {[
              { label: 'Start Date', value: formatDate(new Date().toISOString()) },
              { label: 'Maturity Date', value: formatDate(addDays(new Date(), selectedRate.days).toISOString()) },
              { label: 'Days to Maturity', value: `${selectedRate.days} days` },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0',
                borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.83rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                <span style={{ fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active FDs */}
      <div style={{ marginTop: '40px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Landmark size={18} style={{ color: '#f59e0b' }} /> Your Fixed Deposits
          {activeFDs.length > 0 && (
            <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
              borderRadius: '999px', padding: '2px 10px', fontSize: '0.78rem', fontWeight: 700 }}>
              {activeFDs.length}
            </span>
          )}
        </h2>
        {activeFDs.length === 0 ? (
          <div className="card"><div className="empty-state" style={{ padding: '40px' }}>
            <div className="empty-state-icon">🏦</div>
            <div className="empty-state-title">No active FDs</div>
            <p className="text-muted text-sm mt-2">Book your first fixed deposit above</p>
          </div></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {activeFDs.map((fd) => {
              const days = daysUntil(fd.maturityDate);
              const elapsed = fd.days - days;
              const progress = (elapsed / fd.days) * 100;
              const accrued = (calc.interest / fd.days) * elapsed;

              return (
                <div key={fd.id} id={`fd-${fd.id}`} className="card" style={{ padding: '22px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '14px',
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.25), rgba(249,115,22,0.15))',
                        border: '1px solid rgba(245,158,11,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                        🏦
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>₹{formatCurrency(fd.amount)}</div>
                        <div className="text-muted text-xs mt-1">{fd.label} · {fd.rate}% {fd.compounding} · {fd.accountNumber}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                        borderRadius: '6px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700 }}>ACTIVE</span>
                      <div className="text-muted text-xs mt-1">{days} days left</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>{elapsed} of {fd.days} days elapsed</span>
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>{Math.min(100, progress).toFixed(0)}%</span>
                    </div>
                    <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '3px', width: `${Math.min(100, progress)}%`,
                        background: 'linear-gradient(90deg, #f59e0b, #f97316)', transition: 'width 0.4s' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '14px' }}>
                    {[
                      { label: 'Deposited', value: `₹${formatCurrency(fd.amount)}` },
                      { label: 'Accrued Interest', value: `₹${formatCurrency(Math.max(0, accrued))}`, color: '#22d3ee' },
                      { label: 'Total Interest', value: `₹${formatCurrency(fd.interestEarned)}`, color: '#f59e0b' },
                      { label: 'Maturity Amount', value: `₹${formatCurrency(fd.maturityAmount)}`, color: '#818cf8' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ padding: '10px', borderRadius: '10px',
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>{label}</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: color ?? 'var(--color-text)' }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                      Started {formatDate(fd.startDate)}
                      <ChevronRight size={11} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} />
                      Matures {formatDate(fd.maturityDate)}
                    </div>
                    <button onClick={() => handleClose(fd.id)} id={`close-fd-${fd.id}`}
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#f43f5e', borderColor: 'rgba(244,63,94,0.3)' }}>
                      <Trash2 size={13} /> Break FD
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {closedFDs.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '10px' }}>Closed FDs</h3>
            {closedFDs.map((fd) => (
              <div key={fd.id} className="card" style={{ padding: '14px 18px', opacity: 0.55, marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>₹{formatCurrency(fd.amount)} · {fd.label} · {fd.rate}%</div>
                    <div className="text-muted text-xs mt-1">{fd.accountNumber}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: '#818cf8' }}>₹{formatCurrency(fd.maturityAmount)}</div>
                    <div className="text-muted text-xs">Maturity value</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
