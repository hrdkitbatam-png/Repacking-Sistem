import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';

export default function PackersPage() {
  const [packers, setPackers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPackers = useCallback(async () => {
    try {
      
      

      // Get packers from both sources: users with role=packer AND packers table
      const [usersRes, packersRes] = await Promise.all([
        api.get('/users?per_page=100'),
        api.get('/packers'),
      ]);

      // Merge: users with role=packer
      const packerUsers = (usersRes.data?.data || []).filter((u) => u.role === 'packer');

      // Create lookup from packers table
      const packerLookup = {};
      (packersRes.data || []).forEach((p) => { packerLookup[p.code] = p; });

      const merged = packerUsers.map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        packer_code: u.packer_code,
        station: packerLookup[u.packer_code]?.station || 'Tidak ditentukan',
        active: u.is_active,
      }));

      setPackers(merged);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchPackers(); }, [fetchPackers]);

  const activePackers = packers.filter((p) => p.active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Daftar Packer</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {activePackers.length} packer aktif dari {packers.length} terdaftar
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-5 border border-slate-700/50">
          <div className="text-sm text-slate-400 mb-1">Total Packer</div>
          <div className="text-3xl font-black text-white">{packers.length}</div>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-5 border border-slate-700/50">
          <div className="text-sm text-slate-400 mb-1">Aktif</div>
          <div className="text-3xl font-black text-emerald-400">{activePackers.length}</div>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-5 border border-slate-700/50">
          <div className="text-sm text-slate-400 mb-1">Kode Tertinggi</div>
          <div className="text-3xl font-black text-white font-mono">
            {packers.length > 0
              ? [...packers].sort((a, b) => (b.packer_code || '').localeCompare(a.packer_code || ''))[0]?.packer_code || '-'
              : '-'}
          </div>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-5 border border-slate-700/50">
          <div className="text-sm text-slate-400 mb-1">Nonaktif</div>
          <div className="text-3xl font-black text-rose-400">{packers.filter((p) => !p.active).length}</div>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="p-16 text-center">
          <svg className="animate-spin h-8 w-8 text-slate-500 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : packers.length === 0 ? (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-16 text-center border border-slate-700/50">
          <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-white mb-1">Belum ada packer</h3>
          <p className="text-sm text-slate-400">Buat user dengan role Packer di halaman Manajemen User</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packers.map((packer) => (
            <div
              key={packer.id}
              className="group bg-slate-800/50 backdrop-blur-xl rounded-2xl p-5 border border-slate-700/50 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg">
                    {packer.name?.[0]?.toUpperCase() || 'P'}
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{packer.name}</h3>
                    <span className="text-xs text-slate-400">@{packer.username}</span>
                  </div>
                </div>
                <div className={`h-2.5 w-2.5 rounded-full ${packer.active ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-slate-600'}`} />
              </div>

              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {packer.packer_code || 'KODE-?'}
                </span>
                <span className="text-xs text-slate-500">{packer.station}</span>
              </div>

              <div className="flex gap-1.5">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  packer.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700/50 text-slate-500'
                }`}>
                  {packer.active ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
