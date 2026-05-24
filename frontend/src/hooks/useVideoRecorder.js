import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tiny wrapper over MediaRecorder.
 *
 * - Acquires a single webcam stream on mount and reuses it for every
 *   recording (so we don't re-prompt for permission on each barcode).
 * - Picks the best codec the browser supports (VP9/Opus > VP8/Opus > MP4).
 *   The Laravel backend re-encodes everything to H.265 anyway, so this
 *   is purely an in-browser intermediate.
 * - `start()` returns immediately. `stop()` returns a Promise<Blob>.
 */
export function useVideoRecorder({ videoConstraints, audio = true } = {}) {
  const streamRef    = useRef(null);
  const recorderRef  = useRef(null);
  const chunksRef    = useRef([]);
  const stopResolver = useRef(null);

  const [ready, setReady]     = useState(false);
  const [error, setError]     = useState(null);
  const [isRecording, setIsRecording] = useState(false);

  // ----- one-time webcam acquisition --------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "getUserMedia tidak tersedia. Pastikan halaman dibuka via http://localhost (bukan IP) dan pakai browser Chrome/Edge/Firefox.",
          );
        }
        if (typeof MediaRecorder === "undefined") {
          throw new Error("MediaRecorder tidak didukung oleh browser ini.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints ?? {
            width:  { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: "environment",
          },
          audio,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setReady(true);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[useVideoRecorder] getUserMedia failed:", e);
        setError(e?.message || String(e));
      }
    })();

    return () => {
      cancelled = true;
      const stream = streamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickMimeType = () => {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    for (const m of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
        return m;
      }
    }
    return ""; // browser default
  };

  const start = useCallback(() => {
    if (!streamRef.current) {
      setError("Camera not ready");
      return false;
    }
    if (recorderRef.current && recorderRef.current.state === "recording") {
      return false;
    }

    chunksRef.current = [];
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(streamRef.current, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 1_500_000, // ~1.5 Mbps — H.265 server-side will halve it
    });

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mimeType || "video/webm",
      });
      chunksRef.current = [];
      setIsRecording(false);
      const resolve = stopResolver.current;
      stopResolver.current = null;
      resolve?.(blob);
    };

    rec.onerror = (e) => setError(e?.error?.message || "MediaRecorder error");

    recorderRef.current = rec;
    rec.start(1000); // emit a chunk every second — robust for long videos
    setIsRecording(true);
    return true;
  }, []);

  /** Stops the current recording and resolves with the resulting Blob. */
  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state !== "recording") {
        resolve(null);
        return;
      }
      stopResolver.current = resolve;
      rec.stop();
    });
  }, []);

  return {
    stream: streamRef.current,
    streamRef,
    ready,
    error,
    isRecording,
    start,
    stop,
  };
}
