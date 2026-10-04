import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import TransferPage from './pages/TransferPage';
import TransactionsPage from './pages/TransactionsPage';
import AccountDetailPage from './pages/AccountDetailPage';
import ProfilePage from './pages/ProfilePage';
import PaymentsPage from './pages/PaymentsPage';
import NotificationsPage from './pages/NotificationsPage';
import RecurringDepositPage from './pages/RecurringDepositPage';
import FixedDepositPage from './pages/FixedDepositPage';
import LoanPage from './pages/LoanPage';
import SavingsGoalsPage from './pages/SavingsGoalsPage';
import { Toaster } from 'react-hot-toast';

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <Navbar />
      <main className="main-content">{children}</main>
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1a1f35',
              color: '#f1f5f9',
              border: '1px solid rgba(255,255,255,0.1)',
            },
          }}
        />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected */}
          <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
          <Route path="/transfer" element={<Protected><TransferPage /></Protected>} />
          <Route path="/transactions" element={<Protected><TransactionsPage /></Protected>} />

          {/* New pages */}
          <Route path="/accounts/:id" element={<Protected><AccountDetailPage /></Protected>} />
          <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
          <Route path="/payments" element={<Protected><PaymentsPage /></Protected>} />
          <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
          <Route path="/rd" element={<Protected><RecurringDepositPage /></Protected>} />
          <Route path="/fd" element={<Protected><FixedDepositPage /></Protected>} />
          <Route path="/loans" element={<Protected><LoanPage /></Protected>} />
          <Route path="/goals" element={<Protected><SavingsGoalsPage /></Protected>} />

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
