import React, { useEffect, useState, useCallback } from 'react';
import { accountApi, transferApi } from '../api';
import { uuidv4 } from '../uuid';
import toast from 'react-hot-toast';
import {
  TrendingUp,
  PiggyBank,
  Calendar,
  CheckCircle,
  Trash2,
  Clock,
  ChevronRight,
  Info,
  Sparkles,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────
const ANNUAL_RATE = 6.65; // % per annum
const MIN_AMOUNT = 500;    // ₹/month
const STORAGE_KEY = 'nexbank_recurring_deposits';

// ── Types ────────────────────────────────────────────────────
interface Account {
  id: string;
  accountNumber: string;
  balanceMinor: string;
}

interface RDPlan {
  months: number;
  label: string;
  badge?: string;
}

interface RecurringDeposit {
  id: string;
  accountId: string;
  accountNumber: string;
  monthlyAmount: number;   // in rupees
  tenure: number;          // months
  annualRate: number;      // %
  startDate: string;       // ISO
  nextDeductionDate: string; // ISO
  maturityDate: string;    // ISO
  totalPaid: number;       // months paid so far
  status: 'ACTIVE' | 'MATURED' | 'CLOSED';
  maturityAmount: number;  // calculated at creation
  totalInterest: number;
}

// ── Calculation helpers ──────────────────────────────────────
/**
 * Recurring Deposit maturity using monthly compounding.
 * FV = P × [(1 + r)^n - 1] / r × (1 + r)
 *   P = monthly instalment
 *   r = monthly rate (annualRate / 12 / 100)
 *   n = total months
 */
function calcMaturity(monthly: number, months: number, annualRate: number) {
  const r = annualRate / 12 / 100;
  const maturity = monthly * (((1 + r) ** months - 1) / r) * (1 + r);
  const principal = monthly * months;
  const interest = maturity - principal;
  return {
    maturity: Math.round(maturity * 100) / 100,
    principal,
    interest: Math.round(interest * 100) / 100,
  };
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBalance(minor: string | number): string {
  return (Number(minor) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function monthsRemaining(maturityDate: string): number {
  const now = new Date();
  const mat = new Date(maturityDate);
  return Math.max(
    0,
    (mat.getFullYear() - now.getFullYear()) * 12 + (mat.getMonth() - now.getMonth()),
  );
}

function loadRDs(): RecurringDeposit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRDs(rds: RecurringDeposit[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rds));
}

// ── Plan options ─────────────────────────────────────────────
const PLANS: RDPlan[] = [
  { months: 12,  label: '1 Year',   badge: '' },
  { months: 24,  label: '2 Years',  badge: 'Popular' },
  { months: 36,  label: '3 Years',  badge: '' },
  { months: 60,  label: '5 Years',  badge: 'Best Value' },
];

// ── Progress bar component ───────────────────────────────────
function ProgressBar({ percent, color = '#6366f1' }: { percent: number; color?: string }) {
  return (
    <div style={{
      height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)',
      overflow: 'hidden', width: '100%',
    }}>
      <div style={{
        height: '100%', borderRadius: '3px',
        width: `${Math.min(100, Math.max(0, percent))}%`,
        background: `linear-gradient(90deg, ${color}, ${color}aa)`,
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────
export default function RecurringDepositPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rds, setRds] = useState<RecurringDeposit[]>(loadRDs());

  // Form state
  const [selectedAccount, setSelectedAccount] = useState('');
  const [monthlyAmount, setMonthlyAmount] = useState(1000);
  const [amountInput, setAmountInput] = useState('1000');
  const [selectedPlan, setSelectedPlan] = useState<RDPlan>(PLANS[1]);
  const [isCreating, setIsCreating] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);

  // Derived calculator values
  const calc = calcMaturity(monthlyAmount, selectedPlan.months, ANNUAL_RATE);
  const effectiveAmount = Math.max(MIN_AMOUNT, monthlyAmount);
  const effectiveCalc = calcMaturity(effectiveAmount, selectedPlan.months, ANNUAL_RATE);

  useEffect(() => {
    accountApi
      .list()
      .then((d) => {
        const accs: Account[] = d.data.accounts ?? [];
        setAccounts(accs);
        if (accs.length && !selectedAccount) setSelectedAccount(accs[0].id);
      })
      .catch(() => {});
  }, []);

  const handleAmountChange = (val: string) => {
    setAmountInput(val);
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) setMonthlyAmount(n);
  };

  const handleCreate = async () => {
    if (monthlyAmount < MIN_AMOUNT) {
      toast.error(`Minimum monthly deposit is ₹${MIN_AMOUNT}`);
      return;
    }
    if (!selectedAccount) {
      toast.error('Please select a source account');
      return;
    }

    // Check balance
    const acc = accounts.find((a) => a.id === selectedAccount);
    const balance = Number(acc?.balanceMinor ?? 0) / 100;
    if (balance < monthlyAmount) {
      toast.error(`Insufficient balance. You have ₹${formatCurrency(balance)}`);
      return;
    }

    setIsCreating(true);

    try {
      // Deduct first installment immediately
      await transferApi.create(
        selectedAccount,
        selectedAccount, // self-transfer to simulate RD deduction — in a real system this goes to a RD account
        Math.round(monthlyAmount * 100),
        `RD Installment — Month 1 of ${selectedPlan.months}`,
        uuidv4(),
      );
    } catch (err: any) {
      // If self-transfer is rejected, we'll proceed anyway (demo mode)
      // In real banking, this would go to a separate RD vault account
    }

    const now = new Date();
    const rd: RecurringDeposit = {
      id: uuidv4(),
      accountId: selectedAccount,
      accountNumber: accounts.find((a) => a.id === selectedAccount)?.accountNumber ?? '',
      monthlyAmount,
      tenure: selectedPlan.months,
      annualRate: ANNUAL_RATE,
      startDate: now.toISOString(),
      nextDeductionDate: addMonths(now, 1).toISOString(),
      maturityDate: addMonths(now, selectedPlan.months).toISOString(),
      totalPaid: 1,
      status: 'ACTIVE',
      maturityAmount: effectiveCalc.maturity,
      totalInterest: effectiveCalc.interest,
    };

    const updated = [...rds, rd];
    setRds(updated);
    saveRDs(updated);
    setIsCreating(false);

    toast.success(`RD created! ₹${formatCurrency(monthlyAmount)}/month for ${selectedPlan.label}`);
  };

  const handleClose = (id: string) => {
    setClosingId(id);
    setTimeout(() => {
      const updated = rds.map((r) => r.id === id ? { ...r, status: 'CLOSED' as const } : r);
      setRds(updated);
      saveRDs(updated);
      setClosingId(null);
      toast('RD closed. Funds will be returned to your account.', { icon: '💰' });
    }, 800);
  };

  const activeRds = rds.filter((r) => r.status === 'ACTIVE');
  const closedRds = rds.filter((r) => r.status !== 'ACTIVE');

  // Donut chart SVG for calculator
  const interestPercent = effectiveCalc.principal > 0
    ? (effectiveCalc.interest / effectiveCalc.maturity) * 100
    : 0;
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const interestDash = (interestPercent / 100) * circ;
  const principalDash = circ - interestDash;

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <PiggyBank size={28} style={{ color: '#22d3ee' }} />
          Recurring Deposit
        </h1>
        <p className="page-subtitle">
          Grow your savings with guaranteed {ANNUAL_RATE}% p.a. returns — starting at just ₹{MIN_AMOUNT}/month
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>

        {/* ── LEFT: Calculator & Form ── */}
        <div>
          {/* Plan selector */}
          <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={16} style={{ color: '#818cf8' }} />
              Choose Your Tenure
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {PLANS.map((plan) => {
                const isActive = selectedPlan.months === plan.months;
                return (
                  <button
                    key={plan.months}
                    id={`plan-${plan.months}`}
                    onClick={() => setSelectedPlan(plan)}
                    style={{
                      position: 'relative',
                      padding: '14px 8px',
                      borderRadius: '14px',
                      border: isActive
                        ? '2px solid #6366f1'
                        : '2px solid rgba(255,255,255,0.08)',
                      background: isActive
                        ? 'rgba(99,102,241,0.15)'
                        : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      color: isActive ? '#818cf8' : 'var(--color-text-muted)',
                      textAlign: 'center',
                      transition: 'all 0.2s',
                      transform: isActive ? 'translateY(-2px)' : 'none',
                    }}
                  >
                    {plan.badge && (
                      <div style={{
                        position: 'absolute',
                        top: '-10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: plan.badge === 'Best Value' ? '#f59e0b' : '#6366f1',
                        color: '#fff',
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '999px',
                        whiteSpace: 'nowrap',
                      }}>
                        {plan.badge}
                      </div>
                    )}
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1 }}>
                      {plan.months < 24 ? plan.months : plan.months / 12}
                    </div>
                    <div style={{ fontSize: '0.72rem', marginTop: '4px', fontWeight: 500 }}>
                      {plan.months < 24 ? 'months' : plan.months === 24 ? 'years' : 'years'}
                    </div>
                    {isActive && (
                      <div style={{ marginTop: '6px' }}>
                        <CheckCircle size={14} style={{ color: '#6366f1' }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount + Account */}
          <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={16} style={{ color: '#818cf8' }} />
              Monthly Instalment
            </h2>

            {/* Amount input */}
            <div className="form-group">
              <label className="form-label">Amount per month</label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '1.1rem',
                }}>₹</span>
                <input
                  id="rd-amount"
                  type="number"
                  min={MIN_AMOUNT}
                  step="100"
                  className="form-input"
                  value={amountInput}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  style={{ paddingLeft: '32px', fontSize: '1.25rem', fontWeight: 700 }}
                />
              </div>
              {monthlyAmount < MIN_AMOUNT && (
                <div className="text-sm mt-1" style={{ color: '#f43f5e', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Info size={13} /> Minimum deposit is ₹{MIN_AMOUNT}/month
                </div>
              )}
            </div>

            {/* Quick amount buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {[500, 1000, 2500, 5000, 10000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => { setMonthlyAmount(amt); setAmountInput(String(amt)); }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '8px',
                    border: monthlyAmount === amt
                      ? '1px solid #6366f1'
                      : '1px solid rgba(255,255,255,0.1)',
                    background: monthlyAmount === amt
                      ? 'rgba(99,102,241,0.18)'
                      : 'rgba(255,255,255,0.04)',
                    color: monthlyAmount === amt ? '#818cf8' : 'var(--color-text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    transition: 'all 0.15s',
                  }}
                >
                  ₹{amt >= 1000 ? `${amt / 1000}K` : amt}
                </button>
              ))}
            </div>

            {/* Account selector */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Deduct from account</label>
              <select
                id="rd-account"
                className="form-input form-select"
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountNumber} — ₹{formatBalance(acc.balanceMinor)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Breakdown details table */}
          <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} style={{ color: '#f59e0b' }} />
              Maturity Breakdown
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {[
                { label: 'Monthly Instalment', value: `₹${formatCurrency(Math.max(MIN_AMOUNT, monthlyAmount))}`, highlight: false },
                { label: 'Tenure', value: selectedPlan.label, highlight: false },
                { label: 'Interest Rate', value: `${ANNUAL_RATE}% p.a.`, highlight: false },
                { label: 'Total Instalments', value: `${selectedPlan.months} months`, highlight: false },
                { label: 'Total Principal', value: `₹${formatCurrency(effectiveCalc.principal)}`, highlight: false },
                { label: 'Total Interest Earned', value: `₹${formatCurrency(effectiveCalc.interest)}`, highlight: true, color: '#22d3ee' },
                { label: 'Maturity Amount', value: `₹${formatCurrency(effectiveCalc.maturity)}`, highlight: true, color: '#818cf8', large: true },
              ].map(({ label, value, highlight, color, large }, idx, arr) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '11px 0',
                    borderBottom: idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  }}
                >
                  <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{label}</span>
                  <span style={{
                    fontWeight: highlight ? 700 : 600,
                    color: color ?? 'var(--color-text)',
                    fontSize: large ? '1.1rem' : '0.9rem',
                  }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Maturity date note */}
            <div style={{
              marginTop: '14px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.2)',
              fontSize: '0.8rem',
              color: 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <Info size={13} style={{ color: '#818cf8', flexShrink: 0 }} />
              Maturity date: <strong style={{ color: 'var(--color-text)' }}>
                {formatDate(addMonths(new Date(), selectedPlan.months).toISOString())}
              </strong>
              &nbsp;· Monthly deductions on the same date each month
            </div>

            {/* Create button */}
            <button
              id="create-rd-btn"
              onClick={handleCreate}
              disabled={isCreating || monthlyAmount < MIN_AMOUNT || !selectedAccount}
              className="btn btn-primary btn-lg btn-full"
              style={{ marginTop: '20px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {isCreating ? (
                <><div className="spinner" /> Creating RD...</>
              ) : (
                <><PiggyBank size={18} /> Open Recurring Deposit</>
              )}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Live Calculator Card ── */}
        <div style={{ position: 'sticky', top: '88px' }}>
          {/* Summary card */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(6,182,212,0.1) 100%)',
            border: '1px solid rgba(99,102,241,0.35)',
            borderRadius: '20px',
            padding: '28px 24px',
            marginBottom: '16px',
          }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <TrendingUp size={13} /> You will receive at maturity
            </div>
            <div style={{ fontSize: '2.6rem', fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginRight: '2px' }}>₹</span>
              {formatCurrency(effectiveCalc.maturity)}
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)' }}>
              in {selectedPlan.label} · {ANNUAL_RATE}% p.a.
            </div>

            {/* Donut SVG */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0 16px' }}>
              <div style={{ position: 'relative', width: '140px', height: '140px' }}>
                <svg width="140" height="140" viewBox="0 0 140 140">
                  {/* Track */}
                  <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
                  {/* Principal arc */}
                  <circle
                    cx="70" cy="70" r={radius}
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth="14"
                    strokeDasharray={`${principalDash} ${interestDash}`}
                    strokeDashoffset={circ / 4}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.5s ease' }}
                  />
                  {/* Interest arc */}
                  <circle
                    cx="70" cy="70" r={radius}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="14"
                    strokeDasharray={`${interestDash} ${principalDash}`}
                    strokeDashoffset={circ / 4 - principalDash}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.5s ease' }}
                  />
                </svg>
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', marginBottom: '2px' }}>Returns</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
                    {effectiveCalc.principal > 0 ? `${((effectiveCalc.interest / effectiveCalc.maturity) * 100).toFixed(1)}%` : '—'}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#22d3ee' }}>interest</div>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#6366f1' }} />
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>Principal</span>
                <span style={{ color: '#fff', fontWeight: 700 }}>₹{formatCurrency(effectiveCalc.principal)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22d3ee' }} />
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>Interest</span>
                <span style={{ color: '#fff', fontWeight: 700 }}>₹{formatCurrency(effectiveCalc.interest)}</span>
              </div>
            </div>
          </div>

          {/* Rate badge */}
          <div style={{
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '16px',
          }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <TrendingUp size={16} style={{ color: '#f59e0b' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b' }}>
                {ANNUAL_RATE}% Annual Interest Rate
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                Compounded monthly · Guaranteed returns
              </div>
            </div>
          </div>

          {/* Key dates */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '10px', color: 'var(--color-text-muted)' }}>KEY DATES</div>
            {[
              { label: 'Start Date', value: formatDate(new Date().toISOString()) },
              { label: 'First Deduction', value: formatDate(new Date().toISOString()) },
              { label: 'Maturity Date', value: formatDate(addMonths(new Date(), selectedPlan.months).toISOString()) },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.83rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                <span style={{ fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Active RDs ── */}
      <div style={{ marginTop: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PiggyBank size={18} style={{ color: '#22d3ee' }} />
            Your Active RDs
            {activeRds.length > 0 && (
              <span style={{
                background: 'rgba(34,211,238,0.15)',
                color: '#22d3ee',
                borderRadius: '999px',
                padding: '2px 10px',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}>
                {activeRds.length}
              </span>
            )}
          </h2>
        </div>

        {activeRds.length === 0 ? (
          <div className="card">
            <div className="empty-state" style={{ padding: '40px' }}>
              <div className="empty-state-icon" style={{ fontSize: '2.5rem' }}>🐷</div>
              <div className="empty-state-title">No active RDs yet</div>
              <p className="text-muted text-sm mt-2">Create your first recurring deposit above to start growing your savings</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {activeRds.map((rd) => {
              const progressPercent = (rd.totalPaid / rd.tenure) * 100;
              const paidSoFar = rd.totalPaid * rd.monthlyAmount;
              const remaining = monthsRemaining(rd.maturityDate);
              const currentValue = calcMaturity(rd.monthlyAmount, rd.totalPaid, rd.annualRate).maturity;

              return (
                <div
                  key={rd.id}
                  id={`rd-${rd.id}`}
                  className="card"
                  style={{ padding: '22px 24px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '48px', height: '48px', borderRadius: '14px',
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(6,182,212,0.15))',
                        border: '1px solid rgba(99,102,241,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.4rem',
                      }}>
                        🐷
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                          ₹{formatCurrency(rd.monthlyAmount)}<span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>/month</span>
                        </div>
                        <div className="text-muted text-xs mt-1">
                          {rd.accountNumber} · {rd.tenure / 12 >= 1 ? `${rd.tenure / 12} Year${rd.tenure / 12 > 1 ? 's' : ''}` : `${rd.tenure} months`} · {rd.annualRate}% p.a.
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      <span style={{
                        background: 'rgba(34,211,238,0.15)',
                        color: '#22d3ee',
                        borderRadius: '6px',
                        padding: '3px 10px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                      }}>
                        ACTIVE
                      </span>
                      <div className="text-muted text-xs">{remaining} months left</div>
                    </div>
                  </div>

                  {/* Progress */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        {rd.totalPaid} of {rd.tenure} instalments paid
                      </span>
                      <span style={{ color: '#818cf8', fontWeight: 600 }}>
                        {progressPercent.toFixed(0)}%
                      </span>
                    </div>
                    <ProgressBar percent={progressPercent} color="#6366f1" />
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                    {[
                      { label: 'Paid So Far', value: `₹${formatCurrency(paidSoFar)}`, color: undefined },
                      { label: 'Current Value', value: `₹${formatCurrency(currentValue)}`, color: '#22d3ee' },
                      { label: 'Maturity Amount', value: `₹${formatCurrency(rd.maturityAmount)}`, color: '#818cf8' },
                      { label: 'Interest Earned', value: `₹${formatCurrency(rd.totalInterest)}`, color: '#f59e0b' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{
                        padding: '12px',
                        borderRadius: '10px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>{label}</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: color ?? 'var(--color-text)' }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Dates + Actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', display: 'flex', gap: '16px' }}>
                      <span>
                        <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                        Started {formatDate(rd.startDate)}
                      </span>
                      <span>
                        <ChevronRight size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />
                        Matures {formatDate(rd.maturityDate)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleClose(rd.id)}
                      disabled={closingId === rd.id}
                      className="btn btn-secondary btn-sm"
                      id={`close-rd-${rd.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#f43f5e', borderColor: 'rgba(244,63,94,0.3)' }}
                    >
                      {closingId === rd.id ? (
                        <><div className="spinner" style={{ width: 12, height: 12 }} /> Closing...</>
                      ) : (
                        <><Trash2 size={13} /> Close RD</>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Closed RDs */}
        {closedRds.length > 0 && (
          <div style={{ marginTop: '32px' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '12px' }}>
              Closed / Matured RDs
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {closedRds.map((rd) => (
                <div key={rd.id} className="card" style={{ padding: '16px 20px', opacity: 0.6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>₹{formatCurrency(rd.monthlyAmount)}/month · {rd.tenure} months</div>
                      <div className="text-muted text-xs mt-1">{rd.accountNumber} · Closed {formatDate(new Date().toISOString())}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: '#818cf8' }}>₹{formatCurrency(rd.maturityAmount)}</div>
                      <div className="text-muted text-xs">Maturity value</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
