import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState({ user_id: '', action: '', from: '', to: '' });

  const fetchData = useCallback(async () => {
    try {
      const [logRes, userRes, actionRes] = await Promise.all([
        api.get('/audit-logs', { params: { ...filter, page, per_page: 50 } }),
        api.get('/users', { params: { per_page: 200 } }),
        api.get('/audit-logs/actions'),
      ]);
      setLogs(logRes.data?.data || []);
      setTotal(logRes.data?.total || 0);
      setUsers(userRes.data?.data || []);
      setActions(actionRes.data || []);
    } catch {}
    setLoading(false);
  }, [page, filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const actionLabel = (a) => {
    const map = {
      login: 'Login', logout: 'Logout',
      create_user: 'Buat User', update_user: 'Edit User', delete_user: 'Hapus User',
      create_role: 'Buat Role', update_role: 'Edit Role', delete_role: 'Hapus Role',
      upload_video: 'Upload Video', upload_retur: 'Upload Retur',
    };
    return map[a] || a;
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Audit Log</h1>
        <p className="text-sm text-slate-400 mt-0.5">Aktivitas semua akun</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filter.user_id}
          onChange={(e) => { setFilter(p => ({ ...p, user_id: e.target.value })); setPage(1); }}
          className="rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">Semua User</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>
          ))}
        </select>

        <select
          value={filter.action}
          onChange={(e) => { setFilter(p => ({ ...p, action: e.target.value })); setPage(1); }}
          className="rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">Semua Aksi</option>
          {actions.map(a => (
            <option key={a} value={a}>{actionLabel(a)}</option>
          ))}
        </select>

        <input type="date" value={filter.from} onChange={(e) => { setFilter(p => ({ ...p, from: e.target.value })); setPage(1); }}
          className="rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-slate-200" placeholder="Dari" />
        <input type="date" value={filter.to} onChange={(e) => { setFilter(p => ({ ...p, to: e.target.value })); setPage(1); }}
          className="rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-slate-200" placeholder="Sampai" />
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center">
            <svg className="animate-spin h-8 w-8 text-slate-500 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-16 text-center text-sm text-slate-500">Belum ada aktivitas</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80">
                <th className="px-4 py-3 text-left font-semibold text-slate-400 text-xs uppercase">Waktu</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400 text-xs uppercase">User</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400 text-xs uppercase">Aksi</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400 text-xs uppercase">Deskripsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                    {new Date(l.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-200 text-sm">{l.user?.name || 'System'}</span>
                    {l.user && <span className="text-slate-500 text-xs ml-1">@{l.user.username}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700/50 text-slate-300">
                      {actionLabel(l.action)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{l.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-sm text-slate-300 disabled:opacity-30">← Prev</button>
          <span className="text-sm text-slate-400">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-sm text-slate-300 disabled:opacity-30">Next →</button>
        </div>
      )}
    </div>
  );
}
