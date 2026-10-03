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
import { Toaster } from 'react-hot-toast';

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <Navbar />
      <main className="main-content">{children}</main>
    </div>
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
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AppLayout><DashboardPage /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/transfer"
            element={
              <ProtectedRoute>
                <AppLayout><TransferPage /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions"
            element={
              <ProtectedRoute>
                <AppLayout><TransactionsPage /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
