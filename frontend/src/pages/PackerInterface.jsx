import { useCallback, useEffect, useRef, useState } from "react";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner.js";
import { useVideoRecorder } from "../hooks/useVideoRecorder.js";
import { uploadVideo, listPackers } from "../api/client.js";

const STATE = {
  IDLE:      "IDLE",
  RECORDING: "RECORDING",
  CONFIRMED: "CONFIRMED",
};

const TONE = {
  IDLE:      { bar: "from-slate-800 to-slate-900",   dot: "bg-emerald-400 shadow-emerald-400/50", glow: "shadow-emerald-500/20", label: "READY" },
  RECORDING: { bar: "from-red-700 to-rose-900",        dot: "bg-red-400 animate-pulse shadow-red-500",  glow: "shadow-red-500/30",    label: "● RECORDING" },
  CONFIRMED: { bar: "from-emerald-700 to-teal-900",     dot: "bg-emerald-300 shadow-emerald-400",        glow: "shadow-emerald-500/20", label: "✓ SAVED" },
};

const MAX_LOG = 8;

export default function PackerInterface() {
  const videoEl     = useRef(null);
  const labelEl     = useRef(null);
  const labelStream = useRef(null);
  const recorder    = useVideoRecorder();
  const [packers, setPackers] = useState([]);
  const [packerCode, setPackerCode] = useState(() => localStorage.getItem("packer.code") || "");
  const [machineState, setMachineState] = useState(STATE.IDLE);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [lastBarcode,  setLastBarcode]  = useState(null);
  const [log, setLog] = useState([]);
  const [busyMessage, setBusyMessage] = useState(null);
  const [lastFailed, setLastFailed]   = useState(null);

  const stateRef        = useRef(machineState);
  const currentOrderRef = useRef(currentOrder);
  const packerCodeRef   = useRef(packerCode);
  useEffect(() => { stateRef.current = machineState; }, [machineState]);
  useEffect(() => { currentOrderRef.current = currentOrder; }, [currentOrder]);
  useEffect(() => { packerCodeRef.current = packerCode; }, [packerCode]);

  useEffect(() => {
    if (recorder.ready && videoEl.current && recorder.streamRef.current)
      videoEl.current.srcObject = recorder.streamRef.current;
  }, [recorder.ready]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "environment" },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        labelStream.current = stream;
        if (labelEl.current) labelEl.current.srcObject = stream;
      } catch (e) { console.warn("Label camera offline:", e.message); }
    })();
    return () => { cancelled = true; labelStream.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  const captureLabel = useCallback(() => {
    const stream = labelStream.current;
    if (!stream || !labelEl.current) return null;
    const canvas = document.createElement("canvas");
    const video  = labelEl.current;
    canvas.width  = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
  }, []);

  const labelBlobRef = useRef(null);
  useEffect(() => {
    if (machineState === STATE.RECORDING)
      captureLabel().then(blob => { if (blob) labelBlobRef.current = blob; });
  }, [machineState, captureLabel]);

  const pushLog = useCallback((entry) => {
    setLog(prev => [{ ...entry, ts: new Date() }, ...prev].slice(0, MAX_LOG));
  }, []);

  useEffect(() => {
    listPackers().then(setPackers).catch(e => console.warn("packers fetch failed", e));
  }, []);

  const beginRecording = useCallback((orderId) => {
    if (!recorder.ready) { pushLog({ kind: "error", message: "Camera offline" }); return false; }
    if (!recorder.start()) { pushLog({ kind: "error", message: `Cannot start recording for ${orderId}` }); return false; }
    setCurrentOrder({ orderId, startedAt: new Date() });
    setMachineState(STATE.RECORDING);
    pushLog({ kind: "start", orderId });
    return true;
  }, [recorder, pushLog]);

  const finalizeRecording = useCallback(async ({ andUpload = true } = {}) => {
    const order = currentOrderRef.current;
    const blob  = await recorder.stop();
    if (!order || !blob) return null;
    if (!andUpload) { pushLog({ kind: "discard", orderId: order.orderId }); return null; }
    const recordedAt = order.startedAt?.toISOString();
    setBusyMessage(`Uploading ${order.orderId}…`);
    try {
      await uploadVideo({ orderId: order.orderId, packerCode: packerCodeRef.current || undefined, blob, recordedAt, labelBlob: labelBlobRef.current || undefined });
      pushLog({ kind: "stop", orderId: order.orderId, sizeKb: Math.round(blob.size / 1024) });
      return order.orderId;
    } catch (err) {
      pushLog({ kind: "error", orderId: order.orderId, message: err?.response?.data?.message || err?.message || "Upload failed" });
      setLastFailed({ orderId: order.orderId, blob, recordedAt });
      return null;
    } finally { setBusyMessage(null); }
  }, [recorder, pushLog]);

  const retryUpload = useCallback(async () => {
    if (!lastFailed) return;
    const { orderId, blob, recordedAt } = lastFailed;
    setLastFailed(null);
    setBusyMessage(`Retrying ${orderId}…`);
    try {
      await uploadVideo({ orderId, packerCode: packerCodeRef.current || undefined, blob, recordedAt });
      pushLog({ kind: "stop", orderId, sizeKb: Math.round(blob.size / 1024) });
    } catch (err) {
      pushLog({ kind: "error", orderId, message: err?.response?.data?.message || err?.message || "Retry failed" });
      setLastFailed({ orderId, blob, recordedAt });
    } finally { setBusyMessage(null); }
  }, [lastFailed, pushLog]);

  const handleScan = useCallback(async (rawCode) => {
    const orderId = rawCode.trim();
    if (!orderId) return;
    setLastBarcode({ code: orderId, at: new Date() });
    const state   = stateRef.current;
    const current = currentOrderRef.current;
    if (state === STATE.IDLE) { beginRecording(orderId); return; }
    if (state === STATE.RECORDING) {
      if (current && orderId === current.orderId) {
        await finalizeRecording({ andUpload: true });
        setMachineState(STATE.CONFIRMED);
        return;
      }
      await finalizeRecording({ andUpload: true });
      beginRecording(orderId);
      return;
    }
    if (state === STATE.CONFIRMED) {
      if (current && orderId === current.orderId) { pushLog({ kind: "rerecord", orderId }); beginRecording(orderId); return; }
      setCurrentOrder(null);
      beginRecording(orderId);
    }
  }, [beginRecording, finalizeRecording, pushLog]);

  useBarcodeScanner(handleScan, { interKeyTimeoutMs: 50, minLength: 3, alwaysCapture: true, enabled: recorder.ready });

  const tone = TONE[machineState];
  const elapsed = useElapsedSeconds(machineState === STATE.RECORDING ? currentOrder?.startedAt : null);

  return (
    <div className="flex h-screen bg-black">
      {/* MAIN CAMERA */}
      <section className="flex-1 min-w-0 flex flex-col relative">
        <div className={`absolute inset-x-0 top-0 z-20 bg-gradient-to-r ${tone.bar} backdrop-blur-xl border-b border-white/10 px-6 py-4 flex items-center justify-between transition-all duration-500`}>
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full shadow-lg ${tone.dot}`} />
            <span className="text-2xl font-black tracking-[0.2em] text-white uppercase drop-shadow-lg">{tone.label}</span>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/50 mb-0.5">Current Order</div>
            <div className="text-xl font-mono font-bold text-white">{currentOrder?.orderId || "—"}</div>
          </div>
        </div>

        <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
          <video ref={videoEl} autoPlay playsInline muted className="h-full w-full object-contain" />
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.4)_100%)]" />

          {!recorder.ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm z-10">
              <div className="text-center space-y-3">
                <div className="h-16 w-16 mx-auto rounded-2xl bg-slate-800 flex items-center justify-center animate-pulse">
                  <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </div>
                <div className="text-lg font-semibold text-white">Initializing Camera</div>
                {recorder.error ? <div className="text-red-400 text-sm">{recorder.error}</div> : <div className="text-slate-400 text-sm">Allow webcam access in browser prompt</div>}
              </div>
            </div>
          )}

          {/* LABEL CAMERA PiP */}
          <div className={`absolute bottom-4 left-4 z-10 rounded-xl overflow-hidden border-2 transition-all duration-500 ${machineState === STATE.RECORDING ? 'border-red-500/70 shadow-[0_0_30px_rgba(239,68,68,0.3)] w-44' : 'border-slate-700/50 opacity-50 w-36'}`}>
            <video ref={labelEl} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover bg-black" />
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent px-2 py-1">
              <span className="text-[10px] font-semibold text-white uppercase tracking-wider">RESI</span>
            </div>
          </div>

          {machineState === STATE.RECORDING && (
            <div className="absolute top-20 left-4 z-20 flex items-center gap-2.5 rounded-full bg-black/60 backdrop-blur-md border border-red-500/30 px-4 py-2 shadow-2xl">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" />
              <span className="text-sm font-mono font-bold text-red-400 tracking-wider">{formatElapsed(elapsed)}</span>
            </div>
          )}

          {busyMessage && (
            <div className="absolute bottom-20 right-4 z-20 rounded-xl bg-black/70 backdrop-blur-xl border border-white/10 px-5 py-2.5 text-sm font-medium text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2">
              {busyMessage}
            </div>
          )}
        </div>

        {/* FOOTER BAR */}
        <div className="relative z-10 bg-black/80 backdrop-blur-xl border-t border-white/5 px-6 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="text-slate-500">
              Last scan <span className="font-mono text-slate-300 ml-1">{lastBarcode?.code || "—"}</span>
              {lastBarcode && <span className="ml-2 text-slate-600">{timeAgo(lastBarcode.at)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
            Scanner active
          </div>
        </div>
      </section>

      {/* SIDEBAR */}
      <aside className="w-[340px] shrink-0 flex flex-col border-l border-white/5 bg-black/60 backdrop-blur-xl">
        {/* Packer selector */}
        <div className="p-5 border-b border-white/5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Packer</div>
          <select value={packerCode} onChange={e => { setPackerCode(e.target.value); localStorage.setItem("packer.code", e.target.value); }}
            className="w-full rounded-lg bg-slate-900 border border-white/10 px-3 py-2.5 text-sm text-white
                       focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/30
                       transition-all duration-200 appearance-none bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iNiIgdmlld0JveD0iMCAwIDEwIDYiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMWw0IDQgNC00IiBzdHJva2U9IiM2NDc0OGIiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4=')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat">
            <option value="">— select packer —</option>
            {packers.map(p => <option key={p.id} value={p.code}>{p.code} — {p.name}{p.station ? ` · ${p.station}` : ""}</option>)}
          </select>
        </div>

        {/* State diagram */}
        <div className="p-5 border-b border-white/5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-3">Workflow</div>
          <div className="flex items-center gap-1.5">
            {["IDLE", "RECORDING", "CONFIRMED"].map((s, i) => (
              <div key={s} className="flex items-center gap-1.5 flex-1">
                <div className={`flex-1 h-1 rounded-full transition-all duration-500 ${machineState === s ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : i < ["IDLE","RECORDING","CONFIRMED"].indexOf(machineState) ? 'bg-emerald-700' : 'bg-slate-800'}`} />
                {i < 2 && <div className="w-1 h-1 rounded-full bg-slate-700 shrink-0" />}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-slate-600 font-medium">
            <span className={machineState === "IDLE" ? "text-emerald-400" : ""}>Ready</span>
            <span className={machineState === "RECORDING" ? "text-red-400" : ""}>Record</span>
            <span className={machineState === "CONFIRMED" ? "text-emerald-400" : ""}>Saved</span>
          </div>
        </div>

        {/* Event log */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2 sticky top-0 bg-black/60 backdrop-blur-sm py-1">Events</div>
          {log.length === 0 ? (
            <div className="text-xs text-slate-600 text-center py-12">Scan barcode to begin</div>
          ) : (
            log.map((e, i) => (
              <div key={i} className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 transition-all duration-200 hover:bg-white/[0.06]">
                <div className="flex items-center justify-between">
                  <EventBadge kind={e.kind} />
                  <span className="text-[10px] text-slate-600">{e.ts.toLocaleTimeString()}</span>
                </div>
                <div className="mt-1 font-mono text-xs text-slate-300">
                  {e.orderId || ""}{e.sizeKb ? ` · ${e.sizeKb} KB` : ""}
                </div>
                {e.message && <div className="mt-1 text-[11px] text-red-400">{e.message}</div>}
              </div>
            ))
          )}

          {lastFailed && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-red-400">Upload Failed</div>
                  <div className="text-[11px] text-red-500/70 font-mono mt-0.5">{lastFailed.orderId}</div>
                </div>
                <button onClick={retryUpload}
                  className="rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 px-3.5 py-1.5 text-xs font-bold text-white transition-all duration-150 shadow-lg shadow-red-600/20">
                  ↻ Retry
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Help footer */}
        <div className="p-4 border-t border-white/5 text-[10px] leading-relaxed text-slate-600 space-y-1">
          <div className="text-slate-500 font-semibold mb-1">Hands-free Flow</div>
          <div>1. Scan Resi → recording starts</div>
          <div>2. Scan again → save & confirm</div>
          <div>3. Different Resi → auto-save + start new</div>
          <div>4. Saved state → rescan = re-record</div>
        </div>
      </aside>

      {import.meta.env.DEV && <DevScanSimulator onScan={handleScan} />}
    </div>
  );
}

function EventBadge({ kind }) {
  const map = {
    start:    "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
    stop:     "border-blue-500/30 text-blue-400 bg-blue-500/10",
    rerecord: "border-amber-500/30 text-amber-400 bg-amber-500/10",
    discard:  "border-slate-500/30 text-slate-400 bg-slate-500/10",
    error:    "border-red-500/30 text-red-400 bg-red-500/10",
  };
  const labels = { start: "▶ START", stop: "⏹ STOP", rerecord: "↻ RE-REC", discard: "✕ SKIP", error: "⚠ ERROR" };
  return <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${map[kind] || map.error}`}>{labels[kind] || kind}</span>;
}

function formatElapsed(sec) {
  if (sec == null) return "00:00";
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function timeAgo(date) {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

function useElapsedSeconds(start) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!start) return;
    const id = setInterval(() => setTick(c => c + 1), 500);
    setTick(0);
    return () => clearInterval(id);
  }, [start]);
  if (!start) return null;
  return (Date.now() - start.getTime()) / 1000 + tick * 0.5;
}

function DevScanSimulator({ onScan }) {
  const [code, setCode] = useState("");
  const handle = (e) => { e.preventDefault(); if (code.trim()) { onScan(code.trim()); setCode(""); } };
  if (typeof window === "undefined") return null;
  return (
    <form onSubmit={handle} className="absolute bottom-12 right-4 z-50 flex gap-2 opacity-20 hover:opacity-100 transition-opacity duration-300">
      <input value={code} onChange={e => setCode(e.target.value)} placeholder="DEV: type resi + Enter"
        className="w-48 rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-white" />
      <button type="submit" className="rounded bg-slate-700 px-2 py-1 text-xs text-white">Scan</button>
    </form>
  );
}

const [, force] = useState(0);
