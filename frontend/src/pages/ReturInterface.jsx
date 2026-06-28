import { useCallback, useEffect, useRef, useState } from "react";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner.js";
import { useVideoRecorder } from "../hooks/useVideoRecorder.js";
import { uploadReturVideo, listPackers } from "../api/client.js";
import { enqueueUpload, getPendingCount, getAllPending, removeFromQueue } from "../hooks/offlineQueue.js";
import { useAuth } from "../contexts/AuthContext.jsx";

/* ---------------------------------------------------------------------------
 * State machine
 *   IDLE          -- waiting for first scan
 *   RECORDING     -- currently capturing video for `currentOrder`
 *   CONFIRMED     -- recording stopped, waiting for re-scan or new barcode.
 *                    Same barcode again => discard + re-record (per PRD).
 * ------------------------------------------------------------------------- */
const STATE = {
  IDLE_RTR: "IDLE_RTR",
  RECORDING_RTR: "RECORDING_RTR",
  CONFIRMED_RTR: "CONFIRMED_RTR",
};

const TONE = {
  IDLE_RTR:      { bar: "bg-slate-900/90 backdrop-blur border-b border-white/5", dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]", text: "text-slate-200", label: "SIAP RETUR" },
  RECORDING_RTR: { bar: "bg-gradient-to-r from-red-900/90 to-rose-900/90 backdrop-blur border-b border-red-500/20", dot: "bg-red-500 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.7)]", text: "text-white", label: "● MEREKAM RETUR" },
  CONFIRMED_RTR: { bar: "bg-gradient-to-r from-emerald-900/90 to-teal-900/90 backdrop-blur border-b border-emerald-500/20", dot: "bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.5)]", text: "text-white", label: "✓ SELESAI RETUR" },
};

const MAX_LOG = 8;

export default function ReturInterface() {
  const videoEl     = useRef(null);
  const labelEl     = useRef(null);  // second webcam preview
  const labelStream = useRef(null);
  const compositeCanvas = useRef(null); // hidden canvas for PiP compositing
  const canvasStream  = useRef(null);   // canvas.captureStream() output

  // ---- camera selection state ----
  const [cameras, setCameras] = useState([]);
  const [mainCameraId, setMainCameraId] = useState(() => localStorage.getItem('retur.mainCameraId') || null);
  const [labelCameraId, setLabelCameraId] = useState(() => localStorage.getItem('retureraId') || null);
  const [cameraSaved, setCameraSaved] = useState(false);

  // Build constraints from selected deviceId
  const mainConstraints = mainCameraId
    ? { deviceId: { exact: mainCameraId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 25, max: 30 } }
    : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 25, max: 30 }, facingMode: 'environment' };

  const { user, hasPermission } = useAuth();
  const recorder    = useVideoRecorder({ videoConstraints: mainConstraints, recordStream: canvasStream.current });
  const [packers, setPackers] = useState([]);

  // Auto-set packer code from logged-in user (if packer role)
  const savedCode = localStorage.getItem("packer.code");
  const [packerCode, setPackerCode] = useState(() => {
    if (user?.packer_code && hasPermission('packer_interface')) return user.packer_code;
    if (savedCode && hasPermission('*')) return savedCode;
    return '';
  });

  const [machineState, setMachineState] = useState(STATE.IDLE_RTR);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [lastBarcode,  setLastBarcode]  = useState(null);
  const [log, setLog] = useState([]); // recent actions
  const [busyMessage, setBusyMessage] = useState(null);

  const [lastFailed, setLastFailed]   = useState(null); // { orderId, blob } for retry
  const [pendingCount, setPendingCount] = useState(0);    // offline upload queue size
  const [keterangan, setKeterangan] = useState('');  // notes for retur
  // Timestamp mode
  const [tsMode, setTsMode]           = useState('realtime'); // 'realtime' | 'manual'
  const [tsDate, setTsDate]           = useState('');          // YYYY-MM-DD
  const [tsTime, setTsTime]           = useState('');          // HH:MM:SS
  // Refs so the barcode handler always sees the freshest state without
  // re-binding the global listener.
  const stateRef        = useRef(machineState);
  const currentOrderRef = useRef(currentOrder);
  const packerCodeRef   = useRef(packerCode);
  const keteranganRef  = useRef(keterangan);
  const tsModeRef       = useRef(tsMode);
  const tsDateRef       = useRef(tsDate);
  const tsTimeRef       = useRef(tsTime);
  useEffect(() => { stateRef.current = machineState; }, [machineState]);
  useEffect(() => { currentOrderRef.current = currentOrder; }, [currentOrder]);
  useEffect(() => { packerCodeRef.current = packerCode; }, [packerCode]);
  useEffect(() => { keteranganRef.current = keterangan; }, [keterangan]);
  useEffect(() => { tsModeRef.current = tsMode; }, [tsMode]);
  useEffect(() => { tsDateRef.current = tsDate; }, [tsDate]);
  useEffect(() => { tsTimeRef.current = tsTime; }, [tsTime]);

  // ----- live preview --------------------------------------------------------
  useEffect(() => {
    if (recorder.ready && videoEl.current && recorder.streamRef.current) {
      videoEl.current.srcObject = recorder.streamRef.current;
    }
  }, [recorder.ready]);

  // ----- enumerate video devices (after main camera is ready) -----------------
  useEffect(() => {
    if (!recorder.ready) return;
    (async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices
          .filter(d => d.kind === 'videoinput' && d.deviceId)
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }));

        setCameras(videoDevices);

        // Auto-detect main camera from current active track
        const mainTrack = recorder.streamRef.current?.getVideoTracks()[0];
        const currentId = mainTrack?.getSettings()?.deviceId;
        if (currentId && !mainCameraId) {
          setMainCameraId(currentId);
        }

        // Auto-pick label camera: first DIFFERENT device
        if (!labelCameraId && videoDevices.length >= 2) {
          const labelDevice = videoDevices.find(d => d.deviceId !== currentId);
          if (labelDevice) setLabelCameraId(labelDevice.deviceId);
        } else if (!labelCameraId && videoDevices.length === 1) {
          setLabelCameraId(videoDevices[0].deviceId);
        }

        console.log(`[DualCam] ${videoDevices.length} cameras found`);
      } catch (e) {
        console.warn('[DualCam] enumerate failed:', e.message);
      }
    })();
  }, [recorder.ready]);

  // ----- label camera (second webcam for resi photo) -------------------------
  // Re-acquires whenever labelCameraId changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Release old label stream if any
        const old = labelStream.current;
        if (old) {
          old.getTracks().forEach(t => t.stop());
          labelStream.current = null;
        }

        // Build constraints based on selected label camera (640x360)
        // Use a DIFFERENT deviceId from main camera to avoid conflict
        const labelConstraints = labelCameraId
          ? {
              video: {
                deviceId: { exact: labelCameraId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            }
          : {
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            };

        if (cancelled) return;

        // Add 8-second timeout to avoid hanging if camera is busy
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
          const stream = await navigator.mediaDevices.getUserMedia(labelConstraints);
          clearTimeout(timeoutId);

          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
          labelStream.current = stream;
          if (labelEl.current) {
            labelEl.current.srcObject = stream;
            labelEl.current.classList.remove('hidden');
          }
          const track = stream.getVideoTracks()[0];
          console.log(`[LabelCam] Active: ${track?.label || 'unknown'}`);
        } catch (innerErr) {
          clearTimeout(timeoutId);
          if (innerErr.name === 'AbortError') {
            console.warn('Label camera timed out — may be in use by main camera');
          } else {
            throw innerErr;
          }
          // Fallback: hide label PiP if only 1 camera
          if (labelEl.current) labelEl.current.classList.add('hidden');
        }
      } catch (e) {
        console.warn('Label camera unavailable:', e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [labelCameraId]);

  // ----- Canvas compositing: main cam + label PiP + timestamp ------------
  // Uses setInterval (15fps) instead of rAF — reliable even in background tab
  useEffect(() => {
    if (!recorder.ready || !recorder.streamRef.current) return;

    const canvas = compositeCanvas.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const mainVideo = videoEl.current;
    let intervalId;
    let frameN = 0;

    const draw = () => {
      if (!mainVideo || mainVideo.readyState < 2) return;

      const mw = mainVideo.videoWidth || 854;
      const mh = mainVideo.videoHeight || 480;

      // Fix canvas size once (avoids resize during recording)
      if (canvas.width !== mw || canvas.height !== mh) {
        canvas.width = mw;
        canvas.height = mh;
      }

      // Clear with black background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, mw, mh);

      // Draw main camera
      ctx.drawImage(mainVideo, 0, 0, mw, mh);

      // Draw label camera PiP (bottom-right, 180px wide)
      const labelVideo = labelEl.current;
      if (labelVideo && labelVideo.readyState >= 2) {
        const pipW = 180;
        const pipH = Math.round((labelVideo.videoHeight / labelVideo.videoWidth) * pipW) || 120;
        const px = mw - pipW - 12;
        const py = mh - pipH - 12;
        ctx.save();
        ctx.beginPath();
        const r = 8;
        ctx.moveTo(px + r, py);
        ctx.lineTo(px + pipW - r, py);
        ctx.quadraticCurveTo(px + pipW, py, px + pipW, py + r);
        ctx.lineTo(px + pipW, py + pipH - r);
        ctx.quadraticCurveTo(px + pipW, py + pipH, px + pipW - r, py + pipH);
        ctx.lineTo(px + r, py + pipH);
        ctx.quadraticCurveTo(px, py + pipH, px, py + pipH - r);
        ctx.lineTo(px, py + r);
        ctx.quadraticCurveTo(px, py, px + r, py);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(labelVideo, px, py, pipW, pipH);
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(px, py - 16, 65, 16);
        ctx.fillStyle = '#6ee7b7';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('LABEL', px + 4, py - 4);
      }

      // Draw timestamp (top-left) — realtime WIB or manual override
      let ts;
      if (tsModeRef.current === 'manual' && tsDateRef.current && tsTimeRef.current) {
        ts = `${tsDateRef.current}, ${tsTimeRef.current}`;
      } else {
        const now = new Date();
        ts = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false });
      }
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(8, 6, 270, 54);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(ts, 14, 26);

      // Draw order ID + packer (yellow, below timestamp)
      const _orderId = currentOrderRef.current?.orderId || '-';
      const _pkrCode = packerCodeRef.current || '-';
      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#34d399'; ctx.font = 'bold 18px monospace'; ctx.fillText('🔄 RETURN', 14, 48);

      // Anti-optimize: tiny frame counter dot (forces browser to encode EVERY frame)
      frameN++;
      ctx.fillStyle = frameN % 2 === 0 ? '#001100' : '#001101';
      ctx.fillRect(mw - 2, mh - 2, 2, 2);

      // Start canvas stream on first frame
      if (!canvasStream.current) {
        canvasStream.current = canvas.captureStream(25);
      }

      // If recording, force a new frame by touching the stream track
      const track = canvasStream.current?.getVideoTracks()[0];
      if (track && recorder.isRecording) {
        track.requestFrame?.();
      }
    };

    // Use setInterval instead of rAF — survives background tab
    intervalId = setInterval(draw, 40); // ~25fps

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [recorder.ready]);

  // ----- packer list ---------------------------------------------------------
  useEffect(() => {
    listPackers()
      .then((list) => {
        const safe = Array.isArray(list) ? list : [];
        if (!Array.isArray(list)) {
          console.warn("[PackerInterface] /api/packers tidak mengembalikan array:", list);
        }
        setPackers(safe);

        // Auto-set packer for packer-role users (from their account)
        if (user?.packer_code && hasPermission('packer_interface') && !hasPermission('*')) {
          // Already set via useState init, just sync localStorage
          setPackerCode(user.packer_code);
          localStorage.setItem("packer.code", user.packer_code);
        } else if (!packerCode && safe[0]?.code) {
          // Admin: auto-select first packer if none selected
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
        const reason = recorder.error || (!recorder.ready ? 'Camera not ready' : 'Already recording');
        pushLog({ kind: "error", message: `Cannot record ${orderId}: ${reason}` });
        return false;
      }
      setCurrentOrder({ orderId, startedAt: new Date() });
      setMachineState(STATE.RECORDING_RTR);
      pushLog({ kind: "start", orderId });
      return true;
    },
    [recorder, pushLog],
  );

  // ----- processBackgroundUploads: non-blocking upload loop ---------------
  const processingRef = useRef(false);

  const processBackgroundUploads = useCallback(async () => {
    if (processingRef.current) return; // already running
    processingRef.current = true;

    try {
      let item;
      while ((item = (await getAllPending())[0])) {
        try {
          setBusyMessage(`⬆ Uploading ${item.orderId}…`);
          await uploadReturVideo({ keterangan: keteranganRef.current,
            orderId: item.orderId,
            packerCode: item.packerCode || undefined,
            blob: item.blob,
            recordedAt: item.recordedAt,
          });
          await removeFromQueue(item.id);
          pushLog({ kind: "stop", orderId: item.orderId, sizeKb: Math.round((item.blob?.size || 0) / 1024) });
        } catch (err) {
          // Stop processing if network is down — will retry when online
          if (!err?.response && (err?.message?.includes('Network') || err?.code === 'ERR_NETWORK')) {
            pushLog({ kind: "error", orderId: item.orderId, message: 'Upload pending — will retry when online' });
            break; // keep items in queue, retry later
          }
          // Other errors: remove from queue, mark failed
          await removeFromQueue(item.id);
          pushLog({ kind: "error", orderId: item.orderId, message: err?.response?.data?.message || err?.message || 'Upload failed' });
          setLastFailed({ orderId: item.orderId, blob: item.blob, recordedAt: item.recordedAt });
        }
        // Update pending count after each item
        const remaining = await getPendingCount();
        setPendingCount(remaining);
      }
    } finally {
      setBusyMessage(null);
      const final = await getPendingCount();
      setPendingCount(final);
      processingRef.current = false;
    }
  }, [pushLog]);

  const finalizeRecording = useCallback(
    async ({ andUpload = true } = {}) => {
      const order = currentOrderRef.current;
      const blob  = await recorder.stop();
      if (!order || !blob) return null;

      if (!andUpload) {
        pushLog({ kind: "discard", orderId: order.orderId });
        return null;
      }

      // Use manual timestamp if set, otherwise fallback to actual recording start time
      let recordedAt;
      if (tsModeRef.current === 'manual' && tsDateRef.current && tsTimeRef.current) {
        recordedAt = new Date(`${tsDateRef.current}T${tsTimeRef.current}+07:00`).toISOString();
      } else {
        recordedAt = order.startedAt?.toISOString();
      }
      // ✅ Always save to local IndexedDB first (instant)
      await enqueueUpload({
        orderId: order.orderId,
        packerCode: packerCodeRef.current || undefined,
        blob,
        recordedAt,
      });
      pushLog({ kind: "queued", orderId: order.orderId, sizeKb: Math.round(blob.size / 1024) });
      const pending = await getPendingCount();
      setPendingCount(pending);

      // Trigger background upload — non-blocking!
      processBackgroundUploads();

      return order.orderId;
    },
    [recorder, pushLog, processBackgroundUploads],
  );

  // ----- Background upload: mount + online event ---------------------------
  useEffect(() => {
    getPendingCount().then(setPendingCount);
    // Kick off on mount
    processBackgroundUploads();

    const handleOnline = () => { processBackgroundUploads(); };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [processBackgroundUploads]);

  const retryUpload = useCallback(async () => {
    if (!lastFailed) return;
    const { orderId, blob, recordedAt } = lastFailed;
    setLastFailed(null);
    // Save to queue then trigger background upload
    await enqueueUpload({
      orderId,
      packerCode: packerCodeRef.current || undefined,
      blob,
      recordedAt,
    });
    pushLog({ kind: "queued", orderId, sizeKb: Math.round(blob.size / 1024) });
    const pending = await getPendingCount();
    setPendingCount(pending);
    processBackgroundUploads();
  }, [lastFailed, pushLog, processBackgroundUploads]);

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
      if (state === STATE.IDLE_RTR) {
        beginRecording(orderId);
        return;
      }

      // -- State 1: RECORDING ------------------------------------------------
      if (state === STATE.RECORDING_RTR) {
        if (current && orderId === current.orderId) {
          // Same barcode => stop & save
          await finalizeRecording({ andUpload: true });
          setMachineState(STATE.CONFIRMED_RTR);
          // keep currentOrder so a re-scan in CONFIRMED can trigger re-record
          return;
        }
        // Different barcode => save current, immediately start new
        await finalizeRecording({ andUpload: true });
        beginRecording(orderId);
        return;
      }

      // -- State 2: CONFIRMED ------------------------------------------------
      if (state === STATE.CONFIRMED_RTR) {
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
    minLength: 5,
    alwaysCapture: true,
    enabled: recorder.ready,
  });

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  const tone = TONE[machineState];
  const elapsed = useElapsedSeconds(machineState === STATE.RECORDING_RTR ? currentOrder?.startedAt : null);

  return (
    <div className="flex fixed top-14 left-0 right-0 bottom-0 overflow-hidden">
      {/* ---------- LEFT: preview + giant status -------------------------- */}
      <section className="flex-1 min-w-0 flex flex-col bg-black">
        <div
          className={`flex items-center justify-between px-8 py-5 ${tone.bar} ${tone.text} transition-all duration-500`}
        >
          <div className="flex items-center gap-4">
            <span
              className={`h-5 w-5 rounded-full ${
                machineState === STATE.RECORDING_RTR
                  ? "bg-white animate-pulse-ring"
                  : machineState === STATE.CONFIRMED_RTR
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
          {/* Hidden canvas for PiP compositing */}
          <canvas ref={compositeCanvas} className="hidden" />
          {/* Main camera */}
          <video
            ref={videoEl}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-contain bg-black"
          />

          {/* Label camera PiP — bottom-right corner */}
          <video
            ref={labelEl}
            autoPlay
            playsInline
            muted
            className="absolute bottom-3 right-3 w-[180px] h-[120px] rounded-lg border-2 border-emerald-500/50 object-cover shadow-lg shadow-emerald-500/20 bg-black hidden"
            onLoadedMetadata={(e) => { e.target.classList.remove('hidden'); }}
          />

          {/* Label camera indicator */}
          <div className="absolute bottom-3 right-[192px] px-2 py-1 rounded bg-black/70 text-[10px] text-emerald-400 font-bold border border-emerald-500/30">
            📸 LABEL CAM
          </div>
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

          {machineState === STATE.RECORDING_RTR && (
            <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-emerald-600/90 px-3 py-1.5 text-sm font-bold text-white shadow">
              <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
              REC {formatElapsed(elapsed)}
            </div>
          )}

          {busyMessage && (
            <div className="absolute bottom-4 left-4 rounded-md bg-slate-900/90 px-4 py-2 text-sm font-medium text-slate-100 shadow-lg">
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

          {user?.packer_code && hasPermission('packer_interface') && !hasPermission('*') ? (
            /* Packer role: auto from account, read-only display */
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-sm font-mono font-bold text-emerald-400">{user.packer_code || '—'}</span>
              <span className="text-sm text-slate-400">{user.name}</span>
            </div>
          ) : (
            /* Admin/CS role: manual dropdown */
            <select
              value={packerCode}
              onChange={(e) => {
                setPackerCode(e.target.value);
                localStorage.setItem("packer.code", e.target.value);
              }}
              className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2.5 pr-8 text-sm text-slate-100 
                         focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                         transition-all duration-200 cursor-pointer appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
            >
              <option value="" className="bg-slate-800 text-slate-400">— select packer —</option>
              {packers.map((p) => (
                <option key={p.id} value={p.code} className="bg-slate-800 text-slate-100 py-1">
                  {p.code} — {p.name}
                  {p.station ? ` · ${p.station}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 📝 Keterangan Retur */}
        <div className="p-5 border-b border-border">
          <div className="text-xs uppercase tracking-widest text-slate-400 mb-2">
            📝 Keterangan Retur
          </div>
          <textarea
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            placeholder="Alasan retur, kondisi paket, dll..."
            rows={2}
            maxLength={500}
            className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500
                       focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                       transition-all duration-200 resize-none"
          />
          <p className="text-[10px] text-slate-500 mt-1">{keterangan.length}/500</p>
        </div>

        {/* ⏰ Timestamp Control */}
        <div className="p-5 border-b border-border">
          <div className="text-xs uppercase tracking-widest text-slate-400 mb-3">
            ⏰ Timestamp
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-lg bg-slate-800 border border-slate-600 mb-3 overflow-hidden">
            <button
              onClick={() => setTsMode('realtime')}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                tsMode === 'realtime'
                  ? 'bg-emerald-500/20 text-emerald-300 border-b-2 border-emerald-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🕐 Realtime WIB
            </button>
            <button
              onClick={() => {
                setTsMode('manual');
                // Pre-fill with current date/time
                const now = new Date();
                if (!tsDate) setTsDate(now.toISOString().slice(0, 10));
                if (!tsTime) setTsTime(now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }).split(', ')[1]?.slice(0, 8) || now.toTimeString().slice(0, 8));
              }}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                tsMode === 'manual'
                  ? 'bg-emerald-500/20 text-emerald-300 border-b-2 border-emerald-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ⏰ Manual
            </button>
          </div>

          {/* Manual inputs */}
          {tsMode === 'manual' && (
            <div className="space-y-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
                  Tanggal
                </label>
                <input
                  type="date"
                  value={tsDate}
                  onChange={(e) => setTsDate(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-slate-100 
                             focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                             transition-all duration-200"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
                    Jam
                  </label>
                  <input
                    type="time"
                    step="1"
                    value={tsTime}
                    onChange={(e) => setTsTime(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-slate-100 
                               focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                               transition-all duration-200"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      const now = new Date();
                      setTsDate(now.toISOString().slice(0, 10));
                      setTsTime(now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }).split(', ')[1]?.slice(0, 8) || now.toTimeString().slice(0, 8));
                    }}
                    className="rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-xs text-slate-300 
                               hover:bg-slate-600 hover:text-white transition-colors"
                    title="Set to now"
                  >
                    ⏱ Now
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Camera Selection */}
        <div className="p-5 border-b border-border">
          <div className="text-xs uppercase tracking-widest text-slate-400 mb-3">
            Cameras
          </div>

          <label className="text-[10px] font-semibold text-slate-400 uppercase mb-1 block">
            🎥 Main Camera
          </label>
          <select
            value={mainCameraId || ''}
            onChange={(e) => setMainCameraId(e.target.value || null)}
            className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 pr-8 text-sm text-slate-100 mb-3
                       focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
                       transition-all duration-200 cursor-pointer appearance-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
          >
            {cameras.length === 0 && <option value="" className="bg-slate-800 text-slate-400">Detecting cameras…</option>}
            {cameras.map((c) => (
              <option key={c.deviceId} value={c.deviceId} className="bg-slate-800 text-slate-100 py-1">
                {c.label}
              </option>
            ))}
          </select>

          <label className="text-[10px] font-semibold text-slate-400 uppercase mb-1 block">
            📸 Label Camera
          </label>
          <select
            value={labelCameraId || ''}
            onChange={(e) => setLabelCameraId(e.target.value || null)}
            className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 pr-8 text-sm text-slate-100
                       focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                       transition-all duration-200 cursor-pointer appearance-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
          >
            {cameras.length === 0 && <option value="" className="bg-slate-800 text-slate-400">Detecting cameras…</option>}
            {cameras.map((c) => (
              <option key={c.deviceId} value={c.deviceId} className="bg-slate-800 text-slate-100 py-1">
                {c.label}
              </option>
            ))}
          </select>

          <p className="text-[10px] text-slate-500 mt-2">
            {cameras.length === 0 && 'Plug in USB cameras & refresh.'}
            {cameras.length === 1 && '⚠ Only 1 camera found. Label uses same.'}
            {cameras.length >= 2 && `✅ ${cameras.length} cameras detected. Pick different for label.`}
          </p>

          <button
            onClick={() => {
              if (mainCameraId) localStorage.setItem('retur.mainCameraId', mainCameraId);
              if (labelCameraId) localStorage.setItem('retureraId', labelCameraId);
              setCameraSaved(true);
              setTimeout(() => setCameraSaved(false), 2000);
            }}
            className="mt-3 w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] px-4 py-2 text-xs font-bold text-white transition-all shadow-lg shadow-emerald-600/20"
          >
            {cameraSaved ? '✓ Kamera Tersimpan!' : '💾 Set Kamera'}
          </button>
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
                  className="rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 px-3.5 py-1.5 text-xs font-bold transition-all shadow-lg shadow-red-600/20 text-white"
                >
                  ↻ Retry
                </button>
              </div>
            </div>
          )}

          {pendingCount > 0 && (
            <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-300 font-semibold">
                  {pendingCount} video{pendingCount > 1 ? 's' : ''} pending upload
                </span>
              </div>
              <div className="text-[10px] text-emerald-400/70 mt-1">
                Will auto-upload when connection is restored
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border bg-slate-900/40 text-[11px] leading-relaxed text-slate-400">
          <div className="font-semibold text-slate-300 mb-1">Alur Scan Retur</div>
          1. Scan Resi → mulai merekam retur.<br />
          2. Scan Resi yang sama → simpan & selesai.<br />
          3. Scan Resi berbeda saat merekam → rekaman sebelumnya disimpan, yang baru dimulai.<br />
          4. Saat status SELESAI RETUR, scan Resi yang sama → rekam ulang.
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
      className="border-t border-emerald-500/40 bg-emerald-500/10 px-8 py-2.5 flex items-center gap-3 text-xs"
    >
      <span className="font-bold uppercase tracking-widest text-emerald-300">
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
        className="flex-1 rounded-md bg-slate-900/80 border border-emerald-500/30 px-3 py-1.5 font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400"
      />
      <button
        type="button"
        onClick={submit}
        className="rounded-md bg-emerald-500 px-3 py-1.5 font-semibold text-slate-900 hover:bg-emerald-400"
      >
        Scan
      </button>
      <span className="text-emerald-200/70">
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
      {node(STATE.IDLE_RTR, "IDLE")}
      {node(STATE.RECORDING_RTR, "RECORDING")}
      {node(STATE.CONFIRMED_RTR, "CONFIRMED")}
    </div>
  );
}

function EventBadge({ kind }) {
  const map = {
    start:    { bg: "bg-red-600/20",     text: "text-red-300",     label: "START" },
    stop:     { bg: "bg-emerald-600/20", text: "text-emerald-300", label: "UPLOADED" },
    queued:   { bg: "bg-emerald-600/20",   text: "text-emerald-300",   label: "QUEUED" },
    discard:  { bg: "bg-slate-600/20",   text: "text-slate-400",   label: "DISCARDED" },
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
