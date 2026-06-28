import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api } from '../api/client.js';

const NAV_GROUPS = [
  {
    label: 'Packing',
    items: [
      { path: '/', label: 'Packer Interface', icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z', perm: 'packer_interface' },
      { path: '/dashboard', label: 'CS Dashboard', icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75a2.25 2.25 0 012.25-2.25h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z', perm: 'dashboard' },
    ],
  },
  {
    label: 'Return',
    items: [
      { path: '/retur', label: 'Retur Interface', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z', perm: 'retur_packer' },
      { path: '/retur-dashboard', label: 'Dashboard Retur', icon: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6', perm: 'dashboard' },
    ],
  },
];

const SETTING_ITEMS = [
  { path: '/packers', label: 'Daftar Packer', icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z', perm: 'packers' },
  { path: '/users', label: 'Manajemen User', icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z', perm: 'users' },
  { path: '/roles', label: 'Manajemen Role', icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z', perm: 'roles' },
  { path: '/audit-logs', label: 'Audit Log', icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z', perm: 'audit_logs' },
];

export default function SidebarLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [storage, setStorage] = useState(null);
  const profileRef = useRef(null);
  const { user, logout, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const role = user?.role || 'packer';

  // Filter menu items by user permissions (from roles table)
  const filteredGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(i => hasPermission(i.perm)),
  })).filter(g => g.items.length > 0);
  const filteredSettings = SETTING_ITEMS.filter((i) => hasPermission(i.perm));

  // Fetch storage info (anyone with dashboard or admin permissions)
  useEffect(() => {
    if (!hasPermission('dashboard') && !hasPermission('*')) return;
    api.get('/storage/status').then(r => setStorage(r.data)).catch(() => {});
  }, [user]);

  useEffect(() => {
    function handleClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    // Exact match for paths that could be prefixes of other paths
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Top Nav */}
      <nav className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-2xl border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <Link to="/" className="flex items-center gap-2.5 shrink-0">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-black text-sm">
                  P
                </div>
                <span className="text-sm font-bold text-white hidden sm:inline">Packer Sistem</span>
              </Link>

              {/* Desktop Nav — dropdown groups */}
              <div className="hidden lg:flex items-center gap-0.5">
                {filteredGroups.map((group) => {
                  const anyActive = group.items.some(item => isActive(item.path));
                  const isOpen = openDropdown === group.label;
                  return (
                    <div key={group.label} className="relative">
                      <button
                        onClick={() => setOpenDropdown(openDropdown === group.label ? null : group.label)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                          anyActive
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                        }`}
                      >
                        {group.label}
                        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                      {isOpen && (
                        <div className="absolute top-full left-0 mt-1 w-52 bg-slate-800 rounded-xl shadow-xl border border-slate-700/50 overflow-hidden z-50">
                          {group.items.map((item) => {
                            const active = isActive(item.path);
                            return (
                              <Link
                                key={item.path}
                                to={item.path}
                                onClick={() => setOpenDropdown(null)}
                                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                                  active ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                                }`}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                                </svg>
                                {item.label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Profile */}
            <div className="flex items-center gap-2" ref={profileRef}>
              <div className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 transition-colors cursor-pointer"
                >
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[10px] font-bold">
                    {user?.name?.[0]?.toUpperCase() || 'P'}
                  </div>
                  <span className="text-sm font-medium text-slate-300 hidden sm:inline">{user?.name || 'Packer'}</span>
                  <svg
                    className={`w-3 h-3 text-slate-500 transition-transform ${profileOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-slate-800 rounded-2xl shadow-xl border border-slate-700/50 overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-slate-700/50">
                      <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                      <p className="text-xs text-slate-400 truncate">@{user?.username}</p>
                      <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {user?.role?.toUpperCase()}
                      </span>
                    </div>

                    {filteredSettings.length > 0 && (
                      <div className="py-1">
                        {filteredSettings.map((item) => {
                          const active = isActive(item.path);
                          return (
                            <Link
                              key={item.path}
                              to={item.path}
                              onClick={() => setProfileOpen(false)}
                              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                                active ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                              }`}
                            >
                              <svg className={`w-3.5 h-3.5 ${active ? 'text-emerald-400' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                              </svg>
                              {item.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}

                    {/* Storage bar (admin only) */}
                    {storage && (
                      <div className="border-t border-slate-700/50 px-4 py-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-500 uppercase">Storage</span>
                          <span className="text-[10px] text-slate-400">{storage.disk.used_gb} / {storage.disk.total_gb} GB</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${storage.disk.percent_used > 80 ? 'bg-rose-500' : storage.disk.percent_used > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(storage.disk.percent_used, 100)}%` }}
                          />
                        </div>
                        <div className="text-[9px] text-slate-600 mt-1">
                          {storage.database.video_count} videos · {storage.retention_days}d retention
                        </div>
                      </div>
                    )}

                    <div className="border-t border-slate-700/50 py-1">
                      <button
                        onClick={async () => {
                          await logout();
                          navigate('/login');
                        }}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors w-full text-left"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                        </svg>
                        Keluar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile toggle */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden p-2 rounded-xl text-slate-400 hover:bg-slate-800"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {mobileOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-slate-800 bg-slate-900/95 backdrop-blur-2xl p-4 space-y-3">
            {filteredGroups.map((group) => (
              <div key={group.label}>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 px-1">{group.label}</div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                          active ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-800/50'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                        </svg>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* Content */}
      <main className="flex-1 min-h-0 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
