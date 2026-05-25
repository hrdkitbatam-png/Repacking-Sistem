import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wrapper over MediaRecorder with optional canvas-composited recording.
 *
 * - Always acquires a webcam for live preview (shown in videoEl).
 * - If `recordStream` is provided (e.g. canvas.captureStream), MediaRecorder
 *   records from that stream instead of the webcam. Preview stays on webcam.
 * - Picks best codec. start() → boolean. stop() → Promise<Blob>.
 */
export function useVideoRecorder({
  videoConstraints,
  audio = true,
  recordStream = null,
} = {}) {
  const previewStreamRef = useRef(null); // webcam stream for live preview
  const recorderRef  = useRef(null);
  const chunksRef    = useRef([]);
  const stopResolver = useRef(null);

  const [ready, setReady]     = useState(false);
  const [error, setError]     = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [activeLabel, setActiveLabel] = useState(null);

  const cancelledRef = useRef(false);
  const constraintsRef = useRef(videoConstraints);
  constraintsRef.current = videoConstraints;

  // ----- acquire webcam for preview (always) --------------------------------
  useEffect(() => {
    cancelledRef.current = false;

    (async () => {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        recorderRef.current.stop();
      }
      const old = previewStreamRef.current;
      if (old) { old.getTracks().forEach((t) => t.stop()); previewStreamRef.current = null; }
      setReady(false);
      setError(null);
      setIsRecording(false);

      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia tidak tersedia.");
        }
        if (typeof MediaRecorder === "undefined") {
          throw new Error("MediaRecorder tidak didukung.");
        }
        const constraints = constraintsRef.current ?? {
          width:  { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 10, max: 15 },
          facingMode: "environment",
        };
        const stream = await navigator.mediaDevices.getUserMedia({
          video: constraints,
          audio,
        });

        if (cancelledRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

        const track = stream.getVideoTracks()[0];
        if (track) setActiveLabel(track.label || 'Camera');

        previewStreamRef.current = stream;
        setReady(true);
      } catch (e) {
        console.error("[useVideoRecorder] failed:", e);
        if (!cancelledRef.current) setError(e?.message || String(e));
      }
    })();

    return () => {
      cancelledRef.current = true;
      const stream = previewStreamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(videoConstraints)]);

  const pickMimeType = () => {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    for (const m of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
    }
    return "";
  };

  const start = useCallback(() => {
    // Use recordStream if provided (canvas compositing), otherwise use webcam preview
    const source = recordStream || previewStreamRef.current;
    if (!source) {
      setError("No video source available");
      return false;
    }
    if (recorderRef.current && recorderRef.current.state === "recording") {
      return false;
    }
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(source, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 200_000, // 200 kbps — 360p optimized
    });
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
      chunksRef.current = [];
      setIsRecording(false);
      const resolve = stopResolver.current;
      stopResolver.current = null;
      resolve?.(blob);
    };
    rec.onerror = (e) => setError(e?.error?.message || "MediaRecorder error");
    recorderRef.current = rec;
    rec.start(1000);
    setIsRecording(true);
    return true;
  }, [recordStream]);

  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state !== "recording") { resolve(null); return; }
      stopResolver.current = resolve;
      rec.stop();
    });
  }, []);

  return {
    stream: previewStreamRef.current,  // webcam preview stream
    streamRef: previewStreamRef,        // for PackerInterface's videoEl.srcObject
    ready, error, isRecording, activeLabel, start, stop,
  };
}
