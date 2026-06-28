import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { AuthProvider, useAuth } from "./contexts/AuthContext.jsx";
import SidebarLayout from "./layouts/SidebarLayout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import PackerInterface from "./pages/PackerInterface.jsx";
import ReturInterface from "./pages/ReturInterface.jsx";
import ReturDashboard from "./pages/ReturDashboard.jsx";
import CSDashboard from "./pages/CSDashboard.jsx";
import UsersPage from "./pages/UsersPage.jsx";
import PackersPage from "./pages/PackersPage.jsx";
import RolesPage from "./pages/RolesPage.jsx";
import AuditLogsPage from "./pages/AuditLogsPage.jsx";

function ProtectedRoute({ children }) {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 items-center justify-center text-white font-black text-xl mb-3 shadow-lg shadow-emerald-500/20">
            P
          </div>
          <svg className="animate-spin h-8 w-8 text-emerald-400 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-slate-500 mt-3">Memuat...</p>
        </div>
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return <SidebarLayout>{children}</SidebarLayout>;
}

function AdminOnly({ children }) {
  const { hasPermission } = useAuth();
  if (!hasPermission('users') && !hasPermission('*')) return <Navigate to="/" replace />;
  return children;
}

function RouteBoundary() {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><PackerInterface /></ProtectedRoute>} />
        <Route path="/retur" element={<ProtectedRoute><ReturInterface /></ProtectedRoute>} />
        <Route path="/retur-dashboard" element={<ProtectedRoute><ReturDashboard /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><CSDashboard /></ProtectedRoute>} />
        <Route path="/packers" element={<ProtectedRoute><AdminOnly><PackersPage /></AdminOnly></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute><AdminOnly><UsersPage /></AdminOnly></ProtectedRoute>} />
        <Route path="/roles" element={<ProtectedRoute><AdminOnly><RolesPage /></AdminOnly></ProtectedRoute>} />
        <Route path="/audit-logs" element={<ProtectedRoute><AdminOnly><AuditLogsPage /></AdminOnly></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="flex h-full flex-col bg-slate-950 text-white">
        <main className="flex-1 min-h-0">
          <RouteBoundary />
        </main>
      </div>
    </AuthProvider>
  );
}
