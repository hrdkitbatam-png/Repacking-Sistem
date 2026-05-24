import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { api, API_BASE_URL } from "./api/client.js";
import PackerInterface from "./pages/PackerInterface.jsx";
import CSDashboard from "./pages/CSDashboard.jsx";

function useBackendHealth(intervalMs = 5000) {
  const [status, setStatus] = useState("checking"); // checking | online | offline
  useEffect(() => {
    let mounted = true;
    const ping = async () => {
      try {
        await api.get("/health", { timeout: 3000 });
        if (mounted) setStatus("online");
      } catch {
        if (mounted) setStatus("offline");
      }
    };
    ping();
    const id = setInterval(ping, intervalMs);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [intervalMs]);
  return status;
}

function TopBar() {
  const link =
    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors";
  const active = "bg-slate-100 text-slate-900";
  const idle = "text-slate-300 hover:bg-slate-800";
  const health = useBackendHealth();

  const dot =
    health === "online"
      ? "bg-emerald-400"
      : health === "offline"
      ? "bg-red-500 animate-pulse"
      : "bg-amber-400 animate-pulse";

  const label =
    health === "online"
      ? `API online · ${API_BASE_URL}`
      : health === "offline"
      ? `API OFFLINE · jalankan: php artisan serve (port 8000)`
      : "Memeriksa API…";

  return (
    <header className="flex items-center justify-between border-b border-border bg-panel px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded bg-emerald-500/20 flex items-center justify-center text-emerald-300 font-bold">
          P
        </div>
        <div>
          <div className="text-sm font-semibold tracking-wide">PACKER SISTEM</div>
          <div className="text-[11px] text-slate-400">
            Hands-free packaging video pipeline
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div
          className={`flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-[11px] ${
            health === "offline" ? "text-red-300" : "text-slate-300"
          }`}
          title={label}
        >
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {label}
        </div>
        <nav className="flex items-center gap-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `${link} ${isActive ? active : idle}`}
          >
            Packer Interface
          </NavLink>
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `${link} ${isActive ? active : idle}`}
          >
            CS Dashboard
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function RouteBoundary() {
  // ErrorBoundary needs to be re-mounted per route, otherwise an error caught
  // on /packer will persist when the user navigates to /dashboard.
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/" element={<PackerInterface />} />
        <Route path="/dashboard" element={<CSDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <div className="flex flex-col" style={{height:'100dvh'}}>
      <TopBar />
      <main className="flex-1 min-h-0">
        <RouteBoundary />
      </main>
    </div>
  );
}
