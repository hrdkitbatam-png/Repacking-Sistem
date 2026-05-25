import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'packer', packer_code: '', is_active: true });
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      
      
      const [ur, rr] = await Promise.all([
        api.get('/users'),
        api.get('/roles'),
      ]);
      setUsers(ur.data?.data || []);
      setRoles(rr.data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', username: '', password: '', role: 'packer', packer_code: '', is_active: true });
    setError('');
    setShowModal(true);
  };

  const openEdit = (user) => {
    setEditingId(user.id);
    setForm({
      name: user.name,
      username: user.username,
      password: '',
      role: user.role,
      packer_code: user.packer_code || '',
      is_active: !!user.is_active,
    });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const payload = {
        name: form.name,
        username: form.username,
        role: form.role,
        packer_code: form.role === 'packer' ? form.packer_code : null,
        is_active: form.is_active,
      };
      if (form.password) payload.password = form.password;
      if (!editingId && !form.password) { setError('Password wajib diisi'); return; }

      if (editingId) await api.put(`/users/${editingId}`, payload);
      else await api.post('/users', payload);

      setShowModal(false);
      await fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Hapus user ini?')) return;

    try {
      await api.delete(`/users/${id}`);
      await fetchUsers();
    } catch {}
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Manajemen User</h1>
          <p className="text-sm text-slate-400 mt-0.5">{users.length} user terdaftar</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-all">
          + Tambah User
        </button>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center">
            <svg className="animate-spin h-8 w-8 text-slate-500 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : users.length === 0 ? (
          <div className="p-16 text-center">
            <div className="h-12 w-12 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-3">
              <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">Tidak ada user</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80">
                <th className="px-4 py-3 text-left font-semibold text-slate-400 text-xs uppercase">Nama</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400 text-xs uppercase">Username</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400 text-xs uppercase">Role</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400 text-xs uppercase">Packer</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-400 text-xs uppercase">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-400 text-xs uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-medium text-slate-200">{u.name}</td>
                  <td className="px-4 py-3 text-slate-400">@{u.username}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      u.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                      u.role === 'cs' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {u.role?.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'packer' && u.packer_code ? (
                      <span className="font-mono text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{u.packer_code}</span>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                      u.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700/50 text-slate-500'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                      {u.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openEdit(u)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20">Edit</button>
                      <button onClick={() => handleDelete(u.id)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-400 hover:bg-rose-500/20">Hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 border border-slate-700/50" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">{editingId ? 'Edit User' : 'Tambah User'}</h3>
            {error && <div className="mb-4 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm text-rose-300">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required placeholder="Nama" className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
              <input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} required placeholder="Username" className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
              <input value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} type="password" placeholder={editingId ? 'Kosongkan jika tidak ubah' : 'Password'} className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
              <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
                <option value="admin">Admin</option>
                <option value="cs">CS</option>
                <option value="packer">Packer</option>
              </select>
              {form.role === 'packer' && (
                <input value={form.packer_code} onChange={(e) => setForm((p) => ({ ...p, packer_code: e.target.value.toUpperCase() }))} placeholder="Kode Packer (PKR001)" className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
              )}
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 bg-slate-900" />
                <span className="text-sm text-slate-300">Akun Aktif</span>
              </label>
              <div className="flex gap-3 pt-2">
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
