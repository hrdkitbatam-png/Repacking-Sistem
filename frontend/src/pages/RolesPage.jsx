import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';

const AVAILABLE_PERMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'packer_interface', label: 'Packer Interface' },
  { key: 'retur_packer', label: 'Retur Interface' },
  { key: 'users', label: 'Manajemen User' },
  { key: 'roles', label: 'Manajemen Role' },
  { key: 'packers', label: 'Daftar Packer' },
  { key: 'packing_videos', label: 'Packing Videos' },
  { key: 'audit_logs', label: 'Audit Logs' },
];

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', permissions: [] });
  const [error, setError] = useState('');

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await api.get('/roles');
      setRoles(r.data || []);
    } catch (err) {
      console.error("[RolesPage] fetchRoles error:", err);
      setError(err.response?.data?.message || 'Gagal memuat data role. Pastikan Anda memiliki akses admin.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', permissions: [] });
    setError('');
    setShowModal(true);
  };

  const openEdit = (role) => {
    setEditingId(role.id);
    setForm({ name: role.name, permissions: role.permissions || [] });
    setError('');
    setShowModal(true);
  };

  const togglePerm = (key) => {
    setForm((prev) => {
      const perms = [...prev.permissions];
      const idx = perms.indexOf(key);
      if (idx >= 0) perms.splice(idx, 1);
      else perms.push(key);
      return { ...prev, permissions: perms };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = { name: form.name, permissions: form.permissions };
      if (editingId) await api.put(`/roles/${editingId}`, payload);
      else await api.post('/roles', payload);

      setShowModal(false);
      await fetchRoles();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Hapus role ini?')) return;
    try {
      await api.delete(`/roles/${id}`);
      await fetchRoles();
    } catch {}
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Manajemen Role</h1>
          <p className="text-sm text-slate-400 mt-0.5">Kelola role & permission pengguna</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-all">
          + Tambah Role
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-full p-16 text-center">
            <svg className="animate-spin h-8 w-8 text-slate-500 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : (
          roles.length > 0 ? (
            roles.map((role) => (
              <div key={role.id} className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-5 border border-slate-700/50 hover:border-emerald-500/30 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-white">{role.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{(role.permissions || []).length} permission</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => openEdit(role)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20">Edit</button>
                    <button onClick={() => handleDelete(role.id)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-400 hover:bg-rose-500/20">Hapus</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(role.permissions || []).map((p) => (
                    <span key={p} className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {AVAILABLE_PERMS.find((ap) => ap.key === p)?.label || p}
                    </span>
                  ))}
                  {(!role.permissions || role.permissions.length === 0) && (
                    <span className="text-xs text-slate-600 italic">Tidak ada permission</span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full p-16 text-center bg-slate-900/50 rounded-2xl border border-dashed border-slate-700">
              <p className="text-slate-500">Tidak ada data role yang ditemukan.</p>
            </div>
          )
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm pt-10 overflow-y-auto" onClick={() => setShowModal(false)}>
          <div className="bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4 mb-10 border border-slate-700/50" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">{editingId ? 'Edit Role' : 'Tambah Role'}</h3>
            {error && <div className="mb-4 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm text-rose-300">{error}</div>}
            <form onSubmit={handleSubmit}>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required placeholder="Nama Role" className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm placeholder:text-slate-500 mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />

              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Permission</p>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {AVAILABLE_PERMS.map((perm) => {
                  const checked = form.permissions.includes(perm.key);
                  return (
                    <label key={perm.key} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer select-none transition-all ${
                      checked ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-900 border border-slate-700/50 hover:border-slate-600'
                    }`}>
                      <input type="checkbox" checked={checked} onChange={() => togglePerm(perm.key)}
                        className="w-4 h-4 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 bg-slate-900" />
                      <span className={`text-sm font-medium ${checked ? 'text-emerald-300' : 'text-slate-400'}`}>{perm.label}</span>
                      <code className="text-[10px] text-slate-600 ml-auto">{perm.key}</code>
                    </label>
                  );
                })}
              </div>

              <div className="flex gap-3 pt-4 mt-4 border-t border-slate-700/50">
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700">Simpan</button>
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 rounded-xl bg-slate-700 text-slate-300 text-sm font-bold hover:bg-slate-600">Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
