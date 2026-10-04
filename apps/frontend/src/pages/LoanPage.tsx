import React, { useState } from 'react';
import { uuidv4 } from '../uuid';
import toast from 'react-hot-toast';
import {
  Banknote,
  TrendingDown,
  Calendar,
  CheckCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Clock,
  Trash2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

// ── Constants ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'nexbank_loans';

const LOAN_TYPES = [
  { label: 'Personal Loan',  icon: '👤', rate: 12.50, maxYears: 5,  minAmt: 10000,  maxAmt: 1500000, color: '#6366f1' },
  { label: 'Home Loan',      icon: '🏠', rate: 8.50,  maxYears: 30, minAmt: 500000, maxAmt: 50000000, color: '#22d3ee' },
  { label: 'Auto Loan',      icon: '🚗', rate: 9.50,  maxYears: 7,  minAmt: 100000, maxAmt: 10000000, color: '#f59e0b' },
  { label: 'Education Loan', icon: '🎓', rate: 10.00, maxYears: 15, minAmt: 50000,  maxAmt: 5000000,  color: '#f43f5e' },
];

// ── Types ─────────────────────────────────────────────────────────────────
interface Loan {
  id: string;
  type: string;
  icon: string;
  principal: number;
  rate: number;
  tenureMonths: number;
  emi: number;
  totalInterest: number;
  totalPayment: number;
  appliedDate: string;
  status: 'APPROVED' | 'PENDING' | 'CLOSED';
  color: string;
}

interface AmortRow {
  month: number;
  principal: number;
  interest: number;
  balance: number;
  emi: number;
}

// ── EMI formula: P × r(1+r)^n / [(1+r)^n − 1] ──────────────────────────
function calcEMI(principal: number, annualRate: number, tenureMonths: number) {
  const r = annualRate / 12 / 100;
  if (r === 0) {
    const emi = principal / tenureMonths;
    return { emi, totalInterest: 0, totalPayment: principal };
  }
  const emi = (principal * r * Math.pow(1 + r, tenureMonths)) / (Math.pow(1 + r, tenureMonths) - 1);
  const totalPayment = emi * tenureMonths;
  const totalInterest = totalPayment - principal;
  return {
    emi: Math.round(emi * 100) / 100,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalPayment: Math.round(totalPayment * 100) / 100,
  };
}

function buildAmortization(principal: number, annualRate: number, tenureMonths: number, emi: number): AmortRow[] {
  const r = annualRate / 12 / 100;
  const rows: AmortRow[] = [];
  let balance = principal;
  for (let m = 1; m <= tenureMonths; m++) {
    const interest = Math.round(balance * r * 100) / 100;
    const principalPaid = Math.round((emi - interest) * 100) / 100;
    balance = Math.max(0, Math.round((balance - principalPaid) * 100) / 100);
    rows.push({ month: m, principal: principalPaid, interest, balance, emi });
  }
  return rows;
}

function formatCurrency(n: number, compact = false): string {
  if (compact && n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (compact && n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function loadLoans(): Loan[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function saveLoans(l: Loan[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(l)); }

// ── Donut SVG ─────────────────────────────────────────────────────────────
function LoanDonut({ principalPct, color }: { principalPct: number; color: string }) {
  const r = 52; const circ = 2 * Math.PI * r;
  const pArc = (principalPct / 100) * circ;
  const iArc = circ - pArc;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="14" />
      <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="14"
        strokeDasharray={`${pArc} ${iArc}`} strokeDashoffset={circ / 4} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }} />
      <circle cx="70" cy="70" r={r} fill="none" stroke="#f43f5e" strokeWidth="14"
        strokeDasharray={`${iArc} ${pArc}`} strokeDashoffset={circ / 4 - pArc} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }} />
      <text x="70" y="66" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10">Principal</text>
      <text x="70" y="82" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="bold">
        {principalPct.toFixed(0)}%
      </text>
    </svg>
  );
}

// Custom recharts tooltip
const EmiTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: 'rgba(10,13,20,0.95)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '10px', padding: '10px 14px', fontSize: '0.78rem' }}>
        <div style={{ color: 'var(--color-text-muted)', marginBottom: '4px' }}>Month {label}</div>
        {payload.map((p: any) => (
          <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>
            {p.name}: {formatCurrency(p.value, true)}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// ── Page ──────────────────────────────────────────────────────────────────
export default function LoanPage() {
  const [loans, setLoans] = useState<Loan[]>(loadLoans());
  const [selectedType, setSelectedType] = useState(LOAN_TYPES[0]);
  const [principal, setPrincipal] = useState(500000);
  const [principalInput, setPrincipalInput] = useState('500000');
  const [tenureYears, setTenureYears] = useState(3);
  const [isApplying, setIsApplying] = useState(false);
  const [showFullAmort, setShowFullAmort] = useState(false);

  const tenureMonths = tenureYears * 12;
  const calc = calcEMI(principal, selectedType.rate, tenureMonths);
  const principalPct = (principal / calc.totalPayment) * 100;
  const amort = buildAmortization(principal, selectedType.rate, tenureMonths, calc.emi);

  // For chart — yearly groupings (max 12 bars or all months if short)
  const chartData = amort.slice(0, Math.min(24, amort.length)).map((r) => ({
    month: r.month,
    Principal: Math.round(r.principal),
    Interest: Math.round(r.interest),
    Balance: Math.round(r.balance),
  }));

  const handleApply = () => {
    if (principal < selectedType.minAmt) {
      toast.error(`Minimum loan amount: ${formatCurrency(selectedType.minAmt)}`); return;
    }
    setIsApplying(true);
    setTimeout(() => {
      const loan: Loan = {
        id: uuidv4(), type: selectedType.label, icon: selectedType.icon,
        principal, rate: selectedType.rate, tenureMonths,
        emi: calc.emi, totalInterest: calc.totalInterest, totalPayment: calc.totalPayment,
        appliedDate: new Date().toISOString(),
        status: 'PENDING',
        color: selectedType.color,
      };
      // Simulate approval after 1.5s
      setTimeout(() => {
        const updated = [...loans, { ...loan, status: 'APPROVED' as const }];
        setLoans(updated); saveLoans(updated);
        toast.success(`${selectedType.label} of ${formatCurrency(principal)} approved!`);
      }, 1500);
      setIsApplying(false);
      toast('Loan application submitted. Processing...', { icon: '⏳' });
    }, 800);
  };

  const handleClose = (id: string) => {
    const updated = loans.map((l) => l.id === id ? { ...l, status: 'CLOSED' as const } : l);
    setLoans(updated); saveLoans(updated);
    toast('Loan closed successfully.', { icon: '✅' });
  };

  const activeLoans = loans.filter((l) => l.status !== 'CLOSED');
  const closedLoans = loans.filter((l) => l.status === 'CLOSED');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Banknote size={28} style={{ color: '#22d3ee' }} /> Loan Calculator
        </h1>
        <p className="page-subtitle">Calculate your EMI instantly — Personal, Home, Auto & Education loans</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '24px', alignItems: 'start' }}>
        {/* LEFT */}
        <div>
          {/* Loan type */}
          <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>Select Loan Type</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {LOAN_TYPES.map((lt) => {
                const isActive = selectedType.label === lt.label;
                return (
                  <button key={lt.label} id={`loan-type-${lt.label.split(' ')[0].toLowerCase()}`}
                    onClick={() => { setSelectedType(lt); if (principal < lt.minAmt) { setPrincipal(lt.minAmt); setPrincipalInput(String(lt.minAmt)); } }}
                    style={{ padding: '16px 10px', borderRadius: '14px', cursor: 'pointer', textAlign: 'center',
                      border: isActive ? `2px solid ${lt.color}` : '2px solid rgba(255,255,255,0.07)',
                      background: isActive ? `${lt.color}18` : 'rgba(255,255,255,0.03)',
                      color: isActive ? lt.color : 'var(--color-text-muted)', transition: 'all 0.2s',
                      transform: isActive ? 'translateY(-2px)' : 'none' }}>
                    <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>{lt.icon}</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600 }}>{lt.label}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, marginTop: '4px' }}>{lt.rate}%</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount & Tenure sliders */}
          <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>Loan Details</h2>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Loan Amount</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontWeight: 600 }}>₹</span>
                  <input type="number" className="form-input" value={principalInput}
                    min={selectedType.minAmt} max={selectedType.maxAmt} step={10000}
                    onChange={(e) => { setPrincipalInput(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) setPrincipal(n); }}
                    style={{ paddingLeft: '26px', width: '160px', fontWeight: 700 }} />
                </div>
              </div>
              <input type="range" id="loan-amount-slider" min={selectedType.minAmt} max={selectedType.maxAmt}
                step={selectedType.minAmt < 100000 ? 10000 : 100000}
                value={Math.min(principal, selectedType.maxAmt)}
                onChange={(e) => { const v = Number(e.target.value); setPrincipal(v); setPrincipalInput(String(v)); }}
                style={{ width: '100%', accentColor: selectedType.color }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                <span>{formatCurrency(selectedType.minAmt, true)}</span>
                <span>{formatCurrency(selectedType.maxAmt, true)}</span>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Tenure</label>
                <span style={{ fontWeight: 700, color: selectedType.color, fontSize: '1.1rem' }}>
                  {tenureYears} {tenureYears === 1 ? 'Year' : 'Years'} ({tenureMonths} months)
                </span>
              </div>
              <input type="range" id="loan-tenure-slider" min={1} max={selectedType.maxYears}
                value={Math.min(tenureYears, selectedType.maxYears)}
                onChange={(e) => setTenureYears(Number(e.target.value))}
                style={{ width: '100%', accentColor: selectedType.color }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                <span>1 Year</span>
                <span>{selectedType.maxYears} Years</span>
              </div>
            </div>
          </div>

          {/* Amortization chart */}
          <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingDown size={16} style={{ color: selectedType.color }} />
              EMI Breakdown — First {Math.min(24, tenureMonths)} Months
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={tenureMonths > 12 ? 6 : 14}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={48} />
                <Tooltip content={<EmiTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }} />
                <Bar dataKey="Principal" stackId="a" fill={selectedType.color} radius={[0, 0, 0, 0]} />
                <Bar dataKey="Interest" stackId="a" fill="#f43f5e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Amortization schedule table */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Amortization Schedule</h2>
              <button onClick={() => setShowFullAmort(!showFullAmort)} className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                {showFullAmort ? <><ChevronUp size={13} /> Show Less</> : <><ChevronDown size={13} /> Show All {tenureMonths} Months</>}
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {['Month', 'EMI', 'Principal', 'Interest', 'Balance'].map((h) => (
                      <th key={h} style={{ padding: '10px 16px', color: 'var(--color-text-muted)', fontWeight: 600,
                        textAlign: h === 'Month' ? 'center' : 'right' as any }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(showFullAmort ? amort : amort.slice(0, 6)).map((row, i) => (
                    <tr key={row.month} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td style={{ padding: '9px 16px', textAlign: 'center', fontWeight: 600 }}>{row.month}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right' }}>{formatCurrency(row.emi, true)}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', color: selectedType.color, fontWeight: 600 }}>{formatCurrency(row.principal, true)}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', color: '#f43f5e' }}>{formatCurrency(row.interest, true)}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', color: 'var(--color-text-muted)' }}>{formatCurrency(row.balance, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT sticky */}
        <div style={{ position: 'sticky', top: '88px' }}>
          {/* EMI hero */}
          <div style={{ background: `linear-gradient(135deg, ${selectedType.color}30, ${selectedType.color}10)`,
            border: `1px solid ${selectedType.color}55`, borderRadius: '20px', padding: '28px 24px', marginBottom: '16px' }}>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', marginBottom: '6px' }}>Monthly EMI</div>
            <div style={{ fontSize: '2.6rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#fff' }}>
              <span style={{ fontSize: '1.3rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginRight: '2px' }}>₹</span>
              {calc.emi.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
            <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
              {selectedType.rate}% · {tenureYears}yr · {selectedType.label}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0 12px' }}>
              <LoanDonut principalPct={isNaN(principalPct) ? 50 : principalPct} color={selectedType.color} />
            </div>
            <div style={{ display: 'flex', gap: '14px', justifyContent: 'center' }}>
              {[
                { color: selectedType.color, label: 'Principal', val: formatCurrency(principal, true) },
                { color: '#f43f5e', label: 'Interest', val: formatCurrency(calc.totalInterest, true) },
              ].map(({ color, label, val }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>
                  <span style={{ color: '#fff', fontWeight: 700 }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Summary stats */}
          <div className="card" style={{ padding: '18px', marginBottom: '12px' }}>
            {[
              { label: 'Loan Amount', value: formatCurrency(principal) },
              { label: 'Interest Rate', value: `${selectedType.rate}% p.a.` },
              { label: 'Total Interest', value: formatCurrency(calc.totalInterest), color: '#f43f5e' },
              { label: 'Total Payment', value: formatCurrency(calc.totalPayment), color: selectedType.color },
            ].map(({ label, value, color }, i, arr) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0',
                borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', fontSize: '0.83rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                <span style={{ fontWeight: 700, color: color ?? 'var(--color-text)' }}>{value}</span>
              </div>
            ))}
          </div>

          <button id="apply-loan-btn" onClick={handleApply} disabled={isApplying}
            className="btn btn-primary btn-full btn-lg"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              background: `linear-gradient(135deg, ${selectedType.color}, ${selectedType.color}cc)` }}>
            {isApplying ? <><div className="spinner" /> Processing...</> : <><Banknote size={18} /> Apply for {selectedType.label}</>}
          </button>
        </div>
      </div>

      {/* Active Loans */}
      {activeLoans.length > 0 && (
        <div style={{ marginTop: '40px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Banknote size={18} style={{ color: '#22d3ee' }} /> Your Active Loans
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {activeLoans.map((loan) => (
              <div key={loan.id} id={`loan-${loan.id}`} className="card" style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', fontSize: '1.3rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `${loan.color}18`, border: `1px solid ${loan.color}44` }}>
                      {loan.icon}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{loan.type}</div>
                      <div className="text-muted text-xs mt-1">{formatCurrency(loan.principal)} · {loan.rate}% · {loan.tenureMonths / 12}yr</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                      background: loan.status === 'APPROVED' ? 'rgba(34,211,238,0.15)' : 'rgba(245,158,11,0.15)',
                      color: loan.status === 'APPROVED' ? '#22d3ee' : '#f59e0b' }}>
                      {loan.status}
                    </span>
                    <div className="text-muted text-xs">Applied {formatDate(loan.appliedDate)}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '14px' }}>
                  {[
                    { label: 'Monthly EMI', value: formatCurrency(loan.emi), color: loan.color },
                    { label: 'Total Interest', value: formatCurrency(loan.totalInterest), color: '#f43f5e' },
                    { label: 'Total Payment', value: formatCurrency(loan.totalPayment), color: undefined },
                    { label: 'Tenure', value: `${loan.tenureMonths} months`, color: undefined },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ padding: '10px', borderRadius: '10px',
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>{label}</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: color ?? 'var(--color-text)' }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => handleClose(loan.id)} id={`close-loan-${loan.id}`}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#f43f5e', borderColor: 'rgba(244,63,94,0.3)' }}>
                    <Trash2 size={13} /> Close Loan
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
