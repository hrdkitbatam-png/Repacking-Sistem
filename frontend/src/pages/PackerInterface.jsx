import { useCallback, useEffect, useRef, useState } from "react";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner.js";
import { useVideoRecorder } from "../hooks/useVideoRecorder.js";
import { uploadVideo, listPackers } from "../api/client.js";

/* ---------------------------------------------------------------------------
 * State machine
 *   IDLE          -- waiting for first scan
 *   RECORDING     -- currently capturing video for `currentOrder`
 *   CONFIRMED     -- recording stopped, waiting for re-scan or new barcode.
 *                    Same barcode again => discard + re-record (per PRD).
 * ------------------------------------------------------------------------- */
const STATE = {
  IDLE:      "IDLE",
  RECORDING: "RECORDING",
  CONFIRMED: "CONFIRMED",
};

const TONE = {
  IDLE:      { bar: "bg-slate-900/90 backdrop-blur border-b border-white/5", dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]", text: "text-slate-200", label: "READY" },
  RECORDING: { bar: "bg-gradient-to-r from-red-900/90 to-rose-900/90 backdrop-blur border-b border-red-500/20", dot: "bg-red-500 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.7)]", text: "text-white", label: "● RECORDING" },
  CONFIRMED: { bar: "bg-gradient-to-r from-emerald-900/90 to-teal-900/90 backdrop-blur border-b border-emerald-500/20", dot: "bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.5)]", text: "text-white", label: "✓ SAVED" },
};

const MAX_LOG = 8;

export default function PackerInterface() {
  const videoEl     = useRef(null);
  const labelEl     = useRef(null);  // second webcam for label photo
  const labelStream = useRef(null);
  const recorder    = useVideoRecorder();
  const [packers, setPackers] = useState([]);
  const [packerCode, setPackerCode] = useState(
    () => localStorage.getItem("packer.code") || "",
  );

  const [machineState, setMachineState] = useState(STATE.IDLE);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [lastBarcode,  setLastBarcode]  = useState(null);
  const [log, setLog] = useState([]); // recent actions
  const [busyMessage, setBusyMessage] = useState(null);

  const [lastFailed, setLastFailed]   = useState(null); // { orderId, blob } for retry
  // Refs so the barcode handler always sees the freshest state without
  // re-binding the global listener.
  const stateRef        = useRef(machineState);
  const currentOrderRef = useRef(currentOrder);
  const packerCodeRef   = useRef(packerCode);
  useEffect(() => { stateRef.current = machineState; }, [machineState]);
  useEffect(() => { currentOrderRef.current = currentOrder; }, [currentOrder]);
  useEffect(() => { packerCodeRef.current = packerCode; }, [packerCode]);

  // ----- live preview --------------------------------------------------------
  useEffect(() => {
    if (recorder.ready && videoEl.current && recorder.streamRef.current) {
      videoEl.current.srcObject = recorder.streamRef.current;
    }
  }, [recorder.ready]);

  // ----- label camera (second webcam for resi photo) -------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'environment',
          },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        labelStream.current = stream;
        if (labelEl.current) labelEl.current.srcObject = stream;
      } catch (e) {
        console.warn('Label camera unavailable:', e.message);
      }
    })();
    return () => { cancelled = true; labelStream.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  // Capture snapshot from label camera (called when recording starts)
  const captureLabel = useCallback(() => {
    const stream = labelStream.current;
    if (!stream || !labelEl.current) return null;
    const canvas = document.createElement('canvas');
    const video  = labelEl.current;
    canvas.width  = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  }, []);

  // Capture when recording begins
  const labelBlobRef = useRef(null);
  useEffect(() => {
    if (machineState === STATE.RECORDING) {
      captureLabel().then(blob => { if (blob) labelBlobRef.current = blob; });
    }
  }, [machineState, captureLabel]);

  // ----- packer list ---------------------------------------------------------
  useEffect(() => {
    listPackers()
      .then((list) => {
        // Backend dapat saja down / mengembalikan HTML; jangan crash UI.
        const safe = Array.isArray(list) ? list : [];
        if (!Array.isArray(list)) {
          // eslint-disable-next-line no-console
          console.warn(
            "[PackerInterface] /api/packers tidak mengembalikan array:",
            list,
          );
        }
        setPackers(safe);
        if (!packerCode && safe[0]?.code) {
          setPackerCode(safe[0].code);
          localStorage.setItem("packer.code", safe[0].code);
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(
          "[PackerInterface] gagal memuat /api/packers — backend mungkin belum jalan:",
          err?.message || err,
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushLog = useCallback((entry) => {
    setLog((prev) => [{ ts: new Date(), ...entry }, ...prev].slice(0, MAX_LOG));
  }, []);

  // ---------------------------------------------------------------------------
  // Core actions
  // ---------------------------------------------------------------------------

  const beginRecording = useCallback(
    (orderId) => {
      const ok = recorder.start();
      if (!ok) {
        pushLog({ kind: "error", message: `Cannot start recording for ${orderId}` });
        return false;
      }
      setCurrentOrder({ orderId, startedAt: new Date() });
      setMachineState(STATE.RECORDING);
      pushLog({ kind: "start", orderId });
      return true;
    },
    [recorder, pushLog],
  );

  const finalizeRecording = useCallback(
    async ({ andUpload = true } = {}) => {
      const order = currentOrderRef.current;
      const blob  = await recorder.stop();
      if (!order || !blob) return null;

      if (!andUpload) {
        pushLog({ kind: "discard", orderId: order.orderId });
        return null;
      }

      const recordedAt = order.startedAt?.toISOString();
      setBusyMessage(`Uploading ${order.orderId}…`);
      try {
        await uploadVideo({
          orderId: order.orderId,
          packerCode: packerCodeRef.current || undefined,
          blob,
          recordedAt,
          labelBlob: labelBlobRef.current || undefined,
        });
        pushLog({ kind: "stop", orderId: order.orderId, sizeKb: Math.round(blob.size / 1024) });
        return order.orderId;
      } catch (err) {
        pushLog({
          kind:    "error",
          orderId: order.orderId,
          message: err?.response?.data?.message || err?.message || "Upload failed",
        });
        setLastFailed({ orderId: order.orderId, blob, recordedAt });
        return null;
      } finally {
        setBusyMessage(null);
      }
    },
    [recorder, pushLog],
  );

  const retryUpload = useCallback(async () => {
    if (!lastFailed) return;
    const { orderId, blob, recordedAt } = lastFailed;
    setLastFailed(null);
    setBusyMessage(`Retrying upload ${orderId}…`);
    try {
      await uploadVideo({
        orderId,
        packerCode: packerCodeRef.current || undefined,
        blob,
        recordedAt,
      });
      pushLog({ kind: "stop", orderId, sizeKb: Math.round(blob.size / 1024) });
    } catch (err) {
      pushLog({
        kind: "error",
        orderId,
        message: err?.response?.data?.message || err?.message || "Retry failed",
      });
      setLastFailed({ orderId, blob, recordedAt });
    } finally {
      setBusyMessage(null);
    }
  }, [lastFailed, pushLog]);

  // ---------------------------------------------------------------------------
  // Barcode handler — implements the PRD state machine
  // ---------------------------------------------------------------------------
  const handleScan = useCallback(
    async (rawCode) => {
      const orderId = rawCode.trim();
      if (!orderId) return;

      setLastBarcode({ code: orderId, at: new Date() });

      const state   = stateRef.current;
      const current = currentOrderRef.current;

      // -- State 0: IDLE -----------------------------------------------------
      if (state === STATE.IDLE) {
        beginRecording(orderId);
        return;
      }

      // -- State 1: RECORDING ------------------------------------------------
      if (state === STATE.RECORDING) {
        if (current && orderId === current.orderId) {
          // Same barcode => stop & save
          await finalizeRecording({ andUpload: true });
          setMachineState(STATE.CONFIRMED);
          // keep currentOrder so a re-scan in CONFIRMED can trigger re-record
          return;
        }
        // Different barcode => save current, immediately start new
        await finalizeRecording({ andUpload: true });
        beginRecording(orderId);
        return;
      }

      // -- State 2: CONFIRMED ------------------------------------------------
      if (state === STATE.CONFIRMED) {
        if (current && orderId === current.orderId) {
          // Per PRD: re-record. We have to ALSO drop the previously uploaded
          // copy on the server side — but to keep the hot loop lean we simply
          // upload a new row; the CS can pick the latest by recorded_at.
          pushLog({ kind: "rerecord", orderId });
          beginRecording(orderId);
          return;
        }
        // New order — fresh recording
        setCurrentOrder(null);
        beginRecording(orderId);
      }
    },
    [beginRecording, finalizeRecording, pushLog],
  );

  useBarcodeScanner(handleScan, {
    interKeyTimeoutMs: 50,
    minLength: 3,
    alwaysCapture: true,
    enabled: recorder.ready,
  });

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  const tone = TONE[machineState];
  const elapsed = useElapsedSeconds(machineState === STATE.RECORDING ? currentOrder?.startedAt : null);

  return (
    <div className="flex h-full">
      {/* ---------- LEFT: preview + giant status -------------------------- */}
      <section className="flex-1 min-w-0 flex flex-col bg-black">
        <div
          className={`flex items-center justify-between px-8 py-5 ${tone.bar} ${tone.text} transition-all duration-500`}
        >
          <div className="flex items-center gap-4">
            <span
              className={`h-5 w-5 rounded-full ${
                machineState === STATE.RECORDING
                  ? "bg-white animate-pulse-ring"
                  : machineState === STATE.CONFIRMED
                  ? "bg-white"
                  : "bg-slate-400"
              }`}
            />
            <div className="text-3xl font-extrabold tracking-widest">
              {tone.label}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase opacity-80">Current Order</div>
            <div className="text-2xl font-mono font-bold">
              {currentOrder?.orderId || "—"}
            </div>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
          <video
            ref={videoEl}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-contain bg-black"
          />
          {!recorder.ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-center">
              <div>
                <div className="text-xl font-semibold mb-2">Initializing camera…</div>
                {recorder.error ? (
                  <div className="text-red-400 text-sm">{recorder.error}</div>
                ) : (
                  <div className="text-slate-400 text-sm">
                    Allow webcam access in the browser prompt.
                  </div>
                )}
              </div>
            </div>
          )}

          {machineState === STATE.RECORDING && (
            <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1.5 text-sm font-bold text-white shadow">
              <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
              REC {formatElapsed(elapsed)}
            </div>
          )}

          {busyMessage && (
            <div className="absolute bottom-4 right-4 rounded-md bg-slate-900/90 px-4 py-2 text-sm font-medium text-slate-100 shadow-lg">
              {busyMessage}
            </div>
          )}
        </div>

        <div className="px-8 py-3 bg-black/60 backdrop-blur-sm border-t border-white/5 text-xs text-slate-500 flex items-center justify-between">
          <div>
            Last scan:{" "}
            <span className="font-mono text-slate-400">
              {lastBarcode?.code || "—"}
            </span>
            {lastBarcode && (
              <span className="ml-2 text-slate-500">
                {timeAgo(lastBarcode.at)}
              </span>
            )}
          </div>
          <div>
            Scanner active{" "}
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 ml-1 align-middle" />
          </div>
        </div>

        {import.meta.env.DEV && <DevScanSimulator onScan={handleScan} />}
      </section>

      {/* ---------- RIGHT: side panel ------------------------------------- */}
      <aside className="w-[360px] shrink-0 flex flex-col border-l border-white/5 bg-slate-950/80 backdrop-blur-sm">
        <div className="p-5 border-b border-border">
          <div className="text-xs uppercase tracking-widest text-slate-400 mb-2">
            Packer
          </div>
          <select
            value={packerCode}
            onChange={(e) => {
              setPackerCode(e.target.value);
              localStorage.setItem("packer.code", e.target.value);
            }}
            className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm text-white
                       focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/30
                       transition-all duration-200"
          >
            <option value="">— select packer —</option>
            {packers.map((p) => (
              <option key={p.id} value={p.code}>
                {p.code} — {p.name}
                {p.station ? ` · ${p.station}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="p-5 border-b border-border">
          <div className="text-xs uppercase tracking-widest text-slate-400 mb-3">
            State Machine
          </div>
          <StateDiagram active={machineState} />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          <div className="text-xs uppercase tracking-widest text-slate-400 mb-3">
            Recent Events
          </div>
          {log.length === 0 ? (
            <div className="text-sm text-slate-500">Nothing yet. Scan a barcode to begin.</div>
          ) : (
            <div className="space-y-2">
              {log.map((e, i) => (
                <div key={i} className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 transition-all duration-200 hover:bg-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <EventBadge kind={e.kind} />
                    <span className="text-[11px] text-slate-500">
                      {e.ts.toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-200">
                    {e.orderId || ""}
                    {e.sizeKb ? ` · ${e.sizeKb} KB` : ""}
                  </div>
                  {e.message && (
                    <div className="mt-1 text-[11px] text-red-300">{e.message}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {lastFailed && (
            <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-red-300 font-semibold">Upload gagal</div>
                  <div className="text-[11px] text-red-400 font-mono">{lastFailed.orderId}</div>
                </div>
                <button
                  onClick={retryUpload}
                  className="rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 px-3.5 py-1.5 text-xs font-bold transition-all shadow-lg shadow-red-600/20 text-white transition"
                >
                  ↻ Retry
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border bg-slate-900/40 text-[11px] leading-relaxed text-slate-400">
          <div className="font-semibold text-slate-300 mb-1">Hotkey-free flow</div>
          1. Scan a Resi → recording starts.<br />
          2. Scan the same Resi → save & confirm.<br />
          3. Scan a different Resi mid-recording → previous is saved, new one starts.<br />
          4. In SAVED state, scan the same Resi again → re-record.
        </div>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Dev-only: simulator scan barcode (hanya aktif saat `npm run dev`)         */
/* -------------------------------------------------------------------------- */
function DevScanSimulator({ onScan }) {
  const [code, setCode] = useState("");
  const submit = () => {
    const c = code.trim();
    if (!c) return;
    onScan(c);
    setCode("");
  };
  return (
    <div
      data-bypass-scanner
      className="border-t border-amber-500/40 bg-amber-500/10 px-8 py-2.5 flex items-center gap-3 text-xs"
    >
      <span className="font-bold uppercase tracking-widest text-amber-300">
        Dev · Simulator Scan
      </span>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            submit();
          }
        }}
        placeholder="ketik barcode lalu Enter (mis. ORDER-001)"
        className="flex-1 rounded-md bg-slate-900/80 border border-amber-500/30 px-3 py-1.5 font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
      />
      <button
        type="button"
        onClick={submit}
        className="rounded-md bg-amber-500 px-3 py-1.5 font-semibold text-slate-900 hover:bg-amber-400"
      >
        Scan
      </button>
      <span className="text-amber-200/70">
        Hanya muncul di mode dev — scanner USB asli tetap berfungsi normal.
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small presentational pieces                                               */
/* -------------------------------------------------------------------------- */

function StateDiagram({ active }) {
  const node = (key, label) => {
    const isActive = active === key;
    return (
      <div
        key={key}
        className={`rounded-md border px-3 py-2 text-center text-xs font-semibold transition-colors ${
          isActive
            ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
            : "border-border bg-slate-900 text-slate-400"
        }`}
      >
        {label}
      </div>
    );
  };
  return (
    <div className="grid grid-cols-3 gap-2">
      {node(STATE.IDLE, "IDLE")}
      {node(STATE.RECORDING, "RECORDING")}
      {node(STATE.CONFIRMED, "CONFIRMED")}
    </div>
  );
}

function EventBadge({ kind }) {
  const map = {
    start:    { bg: "bg-red-600/20",     text: "text-red-300",     label: "START" },
    stop:     { bg: "bg-emerald-600/20", text: "text-emerald-300", label: "STOP" },
    discard:  { bg: "bg-amber-600/20",   text: "text-amber-300",   label: "DISCARDED" },
    rerecord: { bg: "bg-sky-600/20",     text: "text-sky-300",     label: "RE-RECORD" },
    error:    { bg: "bg-red-600/30",     text: "text-red-200",     label: "ERROR" },
  }[kind] || { bg: "bg-slate-600/20", text: "text-slate-300", label: kind?.toUpperCase() };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${map.bg} ${map.text}`}>
      {map.label}
    </span>
  );
}

function useElapsedSeconds(startedAt) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!startedAt) return undefined;
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) : 0;
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}
