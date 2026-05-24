import { useCallback, useEffect, useRef, useState } from "react";
import { listVideos } from "../api/client.js";

const PER_PAGE = 25;

const STATUS_TONE = {
  available:      "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  compressing:    "bg-sky-500/15 text-sky-300 border-sky-500/30",
  uploaded_raw:   "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  pending_upload: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  failed:         "bg-red-500/15 text-red-300 border-red-500/30",
};

export default function CSDashboard() {
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(1);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [selected, setSelected] = useState(null);

  // 150ms debounce so each keystroke doesn't hit Postgres.
  const debounceRef = useRef(null);
  const triggerLoad = useCallback((s, p) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listVideos({ search: s, page: p, perPage: PER_PAGE });
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

  // Light polling so newly-finished compressions surface without a refresh.
  useEffect(() => {
    const id = setInterval(() => triggerLoad(search, page), 10_000);
    return () => clearInterval(id);
  }, [search, page, triggerLoad]);

  const rows = Array.isArray(data?.data) ? data.data : [];

  return (
    <div className="flex h-full">
      {/* ---------- LEFT: searchable table ---------------------------- */}
      <section className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-white/5 px-6 py-5 bg-gradient-to-r from-slate-900 to-slate-900/80 backdrop-blur-sm">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">CS Dashboard</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Search packing videos by Order ID / Resi
            </p>
          </div>
          <SearchBox
            value={search}
            onChange={(v) => {
              setPage(1);
              setSearch(v);
            }}
          />
        </header>

        <div className="flex-1 min-h-0 overflow-auto bg-slate-950">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-xl border-b border-white/5 text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold">
              <tr>
                <Th className="w-[180px]">Order ID</Th>
                <Th className="w-[130px]">Status</Th>
                <Th>Packer</Th>
                <Th className="w-[170px]">Recorded</Th>
                <Th className="w-[100px] text-right">Size</Th>
                <Th className="w-[80px]"></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
              {error && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-red-400">
                    {error}
                  </td>
                </tr>
              )}
              {!loading && !error && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-500">
                    No videos match your search.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  selected={selected?.id === row.id}
                  onSelect={() => setSelected(row)}
                />
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

      {/* ---------- RIGHT: inline player ------------------------------ */}
      <aside className="w-[480px] shrink-0 border-l border-white/5 bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col">
        <div className="p-4 border-b border-white/5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Preview
          </div>
          <div className="text-sm font-mono text-slate-200 mt-0.5 truncate">
            {selected?.order_id || "— select a row —"}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
          <PlayerCard row={selected} />
          {selected && <Metadata row={selected} />}
        </div>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function SearchBox({ value, onChange }) {
  return (
    <div className="relative">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search Order ID / Resi…"
        className="w-80 rounded-xl bg-white/[0.04] border border-white/[0.08] pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600
                   focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/20 transition-all duration-200"
      />
      <svg
        className="absolute left-3 top-3 h-4 w-4 text-slate-600"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-3.5-3.5" />
      </svg>
    </div>
  );
}

function Th({ children, className = "" }) {
  return (
    <th
      className={`px-4 py-2.5 text-left font-semibold ${className}`}
    >
      {children}
    </th>
  );
}

function Row({ row, selected, onSelect }) {
  return (
    <tr
      onClick={onSelect}
      className={`cursor-pointer border-b border-border/60 transition-all duration-150 ${
        selected ? "bg-emerald-500/5 border-l-2 border-l-emerald-400" : "hover:bg-white/[0.02] border-l-2 border-l-transparent"
      }`}
    >
      <td className="px-4 py-3 font-mono text-slate-100">{row.order_id}</td>
      <td className="px-4 py-3">
        <StatusPill status={row.status} label={row.status_label} />
        {row.status !== 'available' && row.status !== 'failed' && (
          <PipelineBar status={row.status} />
        )}
      </td>
      <td className="px-4 py-3 text-slate-300">
        {row.packer ? (
          <span>
            <span className="font-medium">{row.packer.code}</span>
            <span className="text-slate-500"> · {row.packer.name}</span>
          </span>
        ) : (
          <span className="text-slate-500">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-slate-400">
        {formatDateTime(row.recorded_at || row.created_at)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-slate-400">
        {formatSize(row.compressed_size_bytes ?? row.raw_size_bytes)}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          className="text-xs font-medium text-emerald-300 hover:text-emerald-200"
        >
          Open ›
        </button>
      </td>
    </tr>
  );
}

function StatusPill({ status, label }) {
  const tone =
    STATUS_TONE[status] ||
    "bg-slate-600/20 text-slate-300 border-slate-600/40";
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      {label || status}
    </span>
  );
}

// ═══════════════════════════════════════════
// Pipeline progress bar
// ═══════════════════════════════════════════
const PIPELINE_STAGES = [
  { key: 'uploaded_raw',   label: 'Uploaded',  icon: '⬆️' },
  { key: 'compressing',    label: 'Compress',  icon: '⚙️' },
  { key: 'available',      label: 'Ready',     icon: '▶️' },
];

function PipelineBar({ status }) {
  if (status === 'failed') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-red-400 font-semibold">❌ Failed</span>
      </div>
    );
  }
  const idx = PIPELINE_STAGES.findIndex(s => s.key === status);
  return (
    <div className="flex items-center gap-1">
      {PIPELINE_STAGES.map((stage, i) => (
        <div key={stage.key} className="flex items-center gap-1">
          <span className={`text-[10px] ${i <= idx ? 'text-emerald-400' : 'text-slate-600'}`}>
            {i <= idx ? '●' : '○'}
          </span>
          <span className={`text-[10px] ${i <= idx ? 'text-slate-300' : 'text-slate-700'}`}>
            {stage.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function PlayerCard({ row }) {
  if (!row) {
    return (
      <div className="aspect-video w-full rounded-xl border border-dashed border-white/5 bg-white/[0.02] flex flex-col items-center justify-center text-slate-600 text-sm gap-2">
        <svg className="w-10 h-10 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        Select a video to play
      </div>
    );
  }
  if (row.status !== "available" || (!row.minio_object_key && !row.minio_url)) {
    return (
      <div className="aspect-video w-full rounded-xl border border-white/5 bg-white/[0.02] flex flex-col items-center justify-center gap-3">
        <StatusPill status={row.status} label={row.status_label} />
        <span>
          {row.status === "failed"
            ? row.error_message || "Processing failed."
            : "Video is still being processed…"}
        </span>
      </div>
    );
  }

  const streamUrl = `${import.meta.env.VITE_API_BASE_URL}/api/packing-videos/${row.id}/stream`;

  return (
    <>
      <div className="rounded-xl overflow-hidden border border-white/5 shadow-2xl shadow-black/50 ring-1 ring-white/[0.03]">
        <video
          key={row.id}
          controls
          autoPlay={false}
          preload="metadata"
          src={streamUrl}
          className="w-full bg-black aspect-video"
        >
          Your browser does not support inline video playback.
        </video>
      </div>
      <LabelDownload row={row} />
    </>
  );
}

function LabelDownload({ row }) {
  if (!row.label_path) return null;
  const labelUrl = `${import.meta.env.VITE_API_BASE_URL}/api/packing-videos/${row.id}/label`;
  return (
    <a
      href={labelUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-flex items-center gap-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 hover:border-blue-400/30 px-4 py-2 text-xs font-semibold text-blue-300 transition-all duration-200"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
      Download Label
    </a>
  );
}

function Metadata({ row }) {
  const items = [
    ["Order ID",        row.order_id],
    ["Packer",          row.packer ? `${row.packer.code} — ${row.packer.name}` : "—"],
    ["Status",          row.status_label || row.status],
    ["MIME",            row.mime_type || "—"],
    ["Raw size",        formatSize(row.raw_size_bytes)],
    ["Compressed size", formatSize(row.compressed_size_bytes)],
    ["Recorded at",     formatDateTime(row.recorded_at)],
    ["Uploaded at",     formatDateTime(row.uploaded_at)],
    ["Compressed at",   formatDateTime(row.compressed_at)],
    ["MinIO object",    row.minio_object_key || "—"],
  ];
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-3">Metadata</div>
      <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-2 text-[11px]">
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
        Page <span className="text-slate-300 font-bold">{page}</span> of{" "}
        <span className="text-slate-300 font-bold">{lastPage}</span>
        <span className="ml-3 text-slate-700">·</span>
        <span className="ml-3 text-slate-300 font-bold">{total.toLocaleString()}</span> total
      </div>
      <div className="flex gap-2">
        <PageBtn disabled={page <= 1} onClick={() => onChange(page - 1)}>
          ← Prev
        </PageBtn>
        <PageBtn disabled={page >= lastPage} onClick={() => onChange(page + 1)}>
          Next →
        </PageBtn>
      </div>
    </div>
  );
}

function PageBtn({ children, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 py-2 font-semibold text-slate-400
                 hover:bg-white/[0.06] hover:text-slate-200 hover:border-white/10
                 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
    >
      {children}
    </button>
  );
}

/* ----- helpers ------------------------------------------------------------ */
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
  return d.toLocaleString();
}
