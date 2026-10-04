import React, { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { authApi } from '../api';
import toast from 'react-hot-toast';
import {
  User,
  Lock,
  Bell,
  Shield,
  ChevronRight,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
}

interface NotifPrefs {
  transferAlerts: boolean;
  loginAlerts: boolean;
  balanceAlerts: boolean;
  weeklyDigest: boolean;
}

function loadNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem('nexbank_notif_prefs');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { transferAlerts: true, loginAlerts: true, balanceAlerts: false, weeklyDigest: true };
}

function saveNotifPrefs(p: NotifPrefs) {
  localStorage.setItem('nexbank_notif_prefs', JSON.stringify(p));
}

function Toggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        background: checked ? 'var(--color-primary, #6366f1)' : 'rgba(255,255,255,0.12)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: '3px',
        left: checked ? '23px' : '3px',
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function ProfilePage() {
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Password change state
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  // Notification prefs
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(loadNotifPrefs());

  useEffect(() => {
    authApi
      .me()
      .then((d) => setProfile(d.data.user))
      .catch(() => setProfile(authUser as any))
      .finally(() => setIsLoading(false));
  }, []);

  const handleNotifChange = (key: keyof NotifPrefs) => (val: boolean) => {
    const updated = { ...notifPrefs, [key]: val };
    setNotifPrefs(updated);
    saveNotifPrefs(updated);
    toast.success('Preferences saved');
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);

    if (pwForm.newPw.length < 8) {
      setPwError('New password must be at least 8 characters');
      return;
    }
    if (pwForm.newPw !== pwForm.confirm) {
      setPwError('Passwords do not match');
      return;
    }

    setPwLoading(true);
    try {
      await authApi.changePassword(pwForm.current, pwForm.newPw);
      setPwSuccess(true);
      setPwForm({ current: '', newPw: '', confirm: '' });
      toast.success('Password changed successfully!');
    } catch (err: any) {
      setPwError(err?.error?.message ?? 'Failed to change password. Check your current password.');
    } finally {
      setPwLoading(false);
    }
  };

  const displayProfile = profile ?? authUser;

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div className="page-header">
        <h1 className="page-title">Profile & Settings</h1>
        <p className="page-subtitle">Manage your account information and preferences</p>
      </div>

      {/* Personal Info */}
      <SectionCard icon={<User size={18} style={{ color: '#818cf8' }} />} title="Personal Information">
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
            <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">First Name</label>
                <div className="form-input" style={{ cursor: 'default', opacity: 0.8 }}>
                  {displayProfile?.firstName ?? '—'}
                </div>
              </div>
              <div>
                <label className="form-label">Last Name</label>
                <div className="form-input" style={{ cursor: 'default', opacity: 0.8 }}>
                  {displayProfile?.lastName ?? '—'}
                </div>
              </div>
            </div>
            <div>
              <label className="form-label">Email Address</label>
              <div className="form-input" style={{ cursor: 'default', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '8px' }}>
                {displayProfile?.email ?? '—'}
                <CheckCircle size={15} style={{ color: '#22d3ee', marginLeft: 'auto' }} />
              </div>
            </div>
            {profile?.createdAt && (
              <div className="text-muted text-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Shield size={13} />
                Member since {new Date(profile.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Change Password */}
      <SectionCard icon={<Lock size={18} style={{ color: '#818cf8' }} />} title="Change Password">
        {pwSuccess && (
          <div className="alert alert-success mb-4" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={16} /> Password changed successfully!
          </div>
        )}
        {pwError && (
          <div className="alert alert-error mb-4" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} /> {pwError}
          </div>
        )}
        <form onSubmit={handlePasswordChange} id="change-password-form">
          <div className="form-group">
            <label className="form-label" htmlFor="current-password">Current Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="current-password"
                type={showCurrent ? 'text' : 'password'}
                className="form-input"
                placeholder="Enter current password"
                value={pwForm.current}
                onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                required
                disabled={pwLoading}
                style={{ paddingRight: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="new-password">New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                className="form-input"
                placeholder="At least 8 characters"
                value={pwForm.newPw}
                onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
                required
                disabled={pwLoading}
                minLength={8}
                style={{ paddingRight: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {pwForm.newPw && (
              <div style={{ marginTop: '6px', display: 'flex', gap: '4px' }}>
                {[8, 12, 16].map((len, i) => (
                  <div key={i} style={{
                    height: '3px', flex: 1, borderRadius: '2px',
                    background: pwForm.newPw.length >= len
                      ? i === 0 ? '#f43f5e' : i === 1 ? '#f59e0b' : '#22d3ee'
                      : 'rgba(255,255,255,0.1)',
                    transition: 'background 0.2s',
                  }} />
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirm-password">Confirm New Password</label>
            <input
              id="confirm-password"
              type="password"
              className="form-input"
              placeholder="Repeat new password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              required
              disabled={pwLoading}
              style={{ borderColor: pwForm.confirm && pwForm.confirm !== pwForm.newPw ? '#f43f5e' : undefined }}
            />
            {pwForm.confirm && pwForm.confirm !== pwForm.newPw && (
              <div className="text-sm mt-1" style={{ color: '#f43f5e' }}>Passwords don't match</div>
            )}
          </div>

          <button
            id="change-password-submit"
            type="submit"
            className="btn btn-primary"
            disabled={pwLoading}
          >
            {pwLoading ? <><div className="spinner" /> Updating...</> : 'Update Password'}
          </button>
        </form>
      </SectionCard>

      {/* Notification Preferences */}
      <SectionCard icon={<Bell size={18} style={{ color: '#818cf8' }} />} title="Notification Preferences">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {([
            { key: 'transferAlerts', label: 'Transfer Alerts', desc: 'Get notified on every transfer' },
            { key: 'loginAlerts', label: 'Login Alerts', desc: 'Alert on new login from unknown device' },
            { key: 'balanceAlerts', label: 'Balance Alerts', desc: 'Alert when balance drops below threshold' },
            { key: 'weeklyDigest', label: 'Weekly Digest', desc: 'Weekly summary of your activity' },
          ] as const).map(({ key, label, desc }, idx, arr) => (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '14px 0',
                borderBottom: idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}
            >
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{label}</div>
                <div className="text-muted text-xs mt-1">{desc}</div>
              </div>
              <Toggle
                id={`notif-${key}`}
                checked={notifPrefs[key]}
                onChange={handleNotifChange(key)}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Security */}
      <SectionCard icon={<Shield size={18} style={{ color: '#818cf8' }} />} title="Security">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{
            padding: '14px 16px',
            borderRadius: '10px',
            background: 'rgba(34,211,238,0.07)',
            border: '1px solid rgba(34,211,238,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <CheckCircle size={16} style={{ color: '#22d3ee', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#22d3ee' }}>Account is Secure</div>
              <div className="text-muted text-xs mt-1">2-factor refresh token rotation is active</div>
            </div>
          </div>

          <div style={{
            padding: '14px 16px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>Session Management</div>
              <div className="text-muted text-xs mt-1">JWT access tokens expire every 15 minutes</div>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
