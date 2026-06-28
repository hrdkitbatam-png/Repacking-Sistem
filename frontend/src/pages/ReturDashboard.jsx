import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";

const PER_PAGE = 25;

const STATUS_TONE = {
  available:      "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  compressing:    "bg-sky-500/15 text-sky-300 border-sky-500/30",
  uploaded_raw:   "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  pending_upload: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  failed:         "bg-red-500/15 text-red-300 border-red-500/30",
};

async function listReturVideos({ search = "", page = 1, perPage = PER_PAGE } = {}) {
  const { data } = await api.get("/retur-videos", {
    params: { search, page, per_page: perPage },
  });
  return data;
}

export default function ReturDashboard() {
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(1);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [selected, setSelected] = useState(null);

  const debounceRef = useRef(null);
  const triggerLoad = useCallback((s, p) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listReturVideos({ search: s, page: p });
        setData(res);
      } catch (e) {
        setError(e?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    }, 150);
  }, []);

  useEffect(() => {
    triggerLoad(search, page);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [search, page, triggerLoad]);

  useEffect(() => {
    const id = setInterval(() => triggerLoad(search, page), 10_000);
    return () => clearInterval(id);
  }, [search, page, triggerLoad]);

  const rows = Array.isArray(data?.data) ? data.data : [];

  return (
    <div className="flex h-full">
      {/* LEFT: searchable table */}
      <section className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-white/5 px-6 py-5 bg-gradient-to-r from-slate-900 to-slate-900/80 backdrop-blur-sm">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Dashboard Retur</h1>
            <p className="text-xs text-slate-500 mt-0.5">Cari video retur by Order ID</p>
          </div>
          <SearchBox value={search} onChange={(v) => { setPage(1); setSearch(v); }} />
        </header>

        <div className="flex-1 min-h-0 overflow-auto bg-slate-950">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-xl border-b border-white/5 text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold">
              <tr>
                <Th className="w-[180px]">Order ID</Th>
                <Th className="w-[110px]">Status</Th>
                <Th>Packer</Th>
                <Th className="w-[240px]">Keterangan</Th>
                <Th className="w-[170px]">Direkam</Th>
                <Th className="w-[90px] text-right">Size</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {loading && rows.length === 0 && (
                <tr><td colSpan={6} className="py-16 text-center text-slate-500">Memuat…</td></tr>
              )}
              {error && (
                <tr><td colSpan={6} className="py-16 text-center text-red-400">{error}</td></tr>
              )}
              {!loading && !error && rows.length === 0 && (
                <tr><td colSpan={6} className="py-16 text-center text-slate-500">Belum ada video retur</td></tr>
              )}
              {rows.map((row) => (
                <Row key={row.id} row={row} selected={selected?.id === row.id} onSelect={() => setSelected(row)} />
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={data?.current_page ?? page}
          lastPage={data?.last_page ?? 1}
          total={data?.total ?? 0}
          onChange={setPage}
        />
      </section>

      {/* RIGHT: inline player */}
      <aside className="w-[480px] shrink-0 border-l border-white/5 bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col">
        <div className="p-4 border-b border-white/5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Preview</div>
          <div className="text-sm font-mono text-slate-200 mt-0.5 truncate">{selected?.order_id || "— pilih video —"}</div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
          <PlayerCard row={selected} />
          {selected && <ReturMetadata row={selected} />}
        </div>
      </aside>
    </div>
  );
}

function SearchBox({ value, onChange }) {
  return (
    <div className="relative">
      <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder="Cari Order ID…"
        className="w-80 rounded-xl bg-white/[0.04] border border-white/[0.08] pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/20 transition-all duration-200" />
      <svg className="absolute left-3 top-3 h-4 w-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" />
      </svg>
    </div>
  );
}

function Th({ children, className = "" }) {
  return <th className={`px-4 py-2.5 text-left font-semibold ${className}`}>{children}</th>;
}

function Row({ row, selected, onSelect }) {
  return (
    <tr onClick={onSelect}
      className={`cursor-pointer border-b border-border/60 transition-all duration-150 ${selected ? "bg-emerald-500/5 border-l-2 border-l-emerald-400" : "hover:bg-white/[0.02] border-l-2 border-l-transparent"}`}>
      <td className="px-4 py-3 font-mono text-slate-100">{row.order_id}</td>
      <td className="px-4 py-3"><StatusPill status={row.status} /></td>
      <td className="px-4 py-3 text-slate-300">
        {row.packer ? <span><span className="font-medium">{row.packer.code}</span><span className="text-slate-500"> · {row.packer.name}</span></span> : <span className="text-slate-500">—</span>}
      </td>
      <td className="px-4 py-3 text-slate-400 text-xs max-w-[220px] truncate">{row.keterangan || '—'}</td>
      <td className="px-4 py-3 text-slate-400">{formatDateTime(row.recorded_at || row.created_at)}</td>
      <td className="px-4 py-3 text-right font-mono text-slate-400">{formatSize(row.compressed_size_bytes ?? row.raw_size_bytes)}</td>
    </tr>
  );
}

function StatusPill({ status }) {
  const labels = { available: 'Siap', compressing: 'Proses', uploaded_raw: 'Upload', pending_upload: 'Antri', failed: 'Gagal' };
  const tone = STATUS_TONE[status] || "bg-slate-600/20 text-slate-300 border-slate-600/40";
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{labels[status] || status}</span>;
}

function PlayerCard({ row }) {
  if (!row) {
    return (
      <div className="aspect-video w-full rounded-xl border border-dashed border-white/5 bg-white/[0.02] flex flex-col items-center justify-center text-slate-600 text-sm gap-2">
        <svg className="w-10 h-10 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        Pilih video untuk diputar
      </div>
    );
  }
  if (row.status !== "available" || !row.minio_url) {
    return (
      <div className="aspect-video w-full rounded-xl border border-white/5 bg-white/[0.02] flex flex-col items-center justify-center gap-3">
        <StatusPill status={row.status} />
        <span className="text-slate-500 text-sm">
          {row.status === "failed" ? row.error_message || "Gagal diproses." : "Video sedang diproses…"}
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl overflow-hidden border border-white/5 shadow-2xl shadow-black/50 ring-1 ring-white/[0.03]">
        <video key={row.id} controls preload="metadata" src={row.minio_url} crossOrigin="anonymous" className="w-full bg-black aspect-video">
          Browser tidak mendukung video playback.
        </video>
      </div>
      <a href={row.minio_url} download className="mt-2 inline-flex items-center gap-2 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300 transition-all">
        ⬇ Download Video
      </a>
    </>
  );
}

function ReturMetadata({ row }) {
  const items = [
    ["Order ID",      row.order_id],
    ["Packer",        row.packer ? `${row.packer.code} — ${row.packer.name}` : "—"],
    ["Status",        row.status],
    ["Keterangan",    row.keterangan || "—"],
    ["MIME",          row.mime_type || "—"],
    ["Raw size",      formatSize(row.raw_size_bytes)],
    ["Final size",    formatSize(row.compressed_size_bytes)],
    ["Direkam",       formatDateTime(row.recorded_at)],
    ["Upload",        formatDateTime(row.uploaded_at)],
  ];
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-3">Metadata</div>
      <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 text-[11px]">
        {items.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500 font-medium">{k}</dt>
            <dd className="text-slate-300 font-mono truncate">{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Pagination({ page, lastPage, total, onChange }) {
  return (
    <div className="flex items-center justify-between border-t border-white/5 bg-slate-900/80 backdrop-blur-sm px-6 py-3 text-xs text-slate-500">
      <div>
        Halaman <span className="text-slate-300 font-bold">{page}</span> dari <span className="text-slate-300 font-bold">{lastPage}</span>
        <span className="ml-3 text-slate-700">·</span>
        <span className="ml-3 text-slate-300 font-bold">{total.toLocaleString()}</span> total
      </div>
      <div className="flex gap-2">
        <PageBtn disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</PageBtn>
        <PageBtn disabled={page >= lastPage} onClick={() => onChange(page + 1)}>Next →</PageBtn>
      </div>
    </div>
  );
}

function PageBtn({ children, disabled, onClick }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 py-2 font-semibold text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 hover:border-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150">
      {children}
    </button>
  );
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}
