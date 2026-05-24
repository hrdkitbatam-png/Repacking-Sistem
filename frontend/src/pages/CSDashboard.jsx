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
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4 bg-panel">
          <div>
            <h1 className="text-xl font-bold">Customer Service Dashboard</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Search packing videos by Order ID / Resi, then play inline.
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

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-border text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <Th className="w-[180px]">Order ID</Th>
                <Th className="w-[130px]">Status</Th>
                <Th>Packer</Th>
                <Th className="w-[170px]">Recorded</Th>
                <Th className="w-[100px] text-right">Size</Th>
                <Th className="w-[80px]"></Th>
              </tr>
            </thead>
            <tbody>
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
      <aside className="w-[480px] shrink-0 border-l border-border bg-panel flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="text-xs uppercase tracking-widest text-slate-400">
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
        className="w-80 rounded-md bg-slate-800 border border-border pl-9 pr-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <svg
        className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500"
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
      className={`cursor-pointer border-b border-border/60 transition-colors ${
        selected ? "bg-emerald-500/5" : "hover:bg-slate-800/40"
      }`}
    >
      <td className="px-4 py-3 font-mono text-slate-100">{row.order_id}</td>
      <td className="px-4 py-3">
        <StatusPill status={row.status} label={row.status_label} />
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

function PlayerCard({ row }) {
  if (!row) {
    return (
      <div className="aspect-video w-full rounded-md border border-dashed border-border bg-slate-900/40 flex items-center justify-center text-slate-500 text-sm">
        Select a video on the left to play it here.
      </div>
    );
  }
  if (row.status !== "available" || !row.minio_url) {
    return (
      <div className="aspect-video w-full rounded-md border border-border bg-slate-900/60 flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
        <StatusPill status={row.status} label={row.status_label} />
        <span>
          {row.status === "failed"
            ? row.error_message || "Processing failed."
            : "Video is still being processed…"}
        </span>
      </div>
    );
  }
  return (
    <video
      key={row.id}
      controls
      autoPlay={false}
      preload="metadata"
      src={row.minio_url}
      className="w-full rounded-md bg-black aspect-video"
    >
      Your browser does not support inline video playback.
    </video>
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
    <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-xs">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="text-slate-200 font-mono break-all">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Pagination({ page, lastPage, total, onChange }) {
  return (
    <div className="flex items-center justify-between border-t border-border bg-slate-900 px-6 py-3 text-xs text-slate-400">
      <div>
        Page <span className="text-slate-200 font-semibold">{page}</span> of{" "}
        <span className="text-slate-200 font-semibold">{lastPage}</span>
        <span className="ml-3 text-slate-500">·</span>
        <span className="ml-3 text-slate-200 font-semibold">{total.toLocaleString()}</span> total
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
      className="rounded-md border border-border bg-slate-800 px-3 py-1.5 font-medium hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800"
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
