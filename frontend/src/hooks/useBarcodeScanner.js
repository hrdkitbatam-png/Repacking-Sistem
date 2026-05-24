import { useEffect, useRef } from "react";

/**
 * Global barcode-scanner hook.
 *
 * USB barcode scanners emulate a keyboard: they type the barcode characters
 * very quickly (usually <10ms between keys) and finish with `Enter`. We
 * distinguish them from human typing by:
 *
 *   1. Listening on `window.keydown` (capture phase, so we win over inputs).
 *   2. Buffering only characters that arrive within `interKeyTimeoutMs`
 *      (default 50ms) of the previous one.
 *   3. Committing the buffer on `Enter`, IF the buffer is at least
 *      `minLength` chars long.
 *
 * If the user happens to be focused inside an <input> or <textarea>, we
 * leave that focused element alone (so search boxes still work normally) —
 * unless `alwaysCapture` is true (the Packer screen sets this).
 *
 * @param {(barcode: string) => void} onScan
 * @param {object} [opts]
 * @param {number} [opts.interKeyTimeoutMs=50]
 * @param {number} [opts.minLength=3]
 * @param {boolean} [opts.alwaysCapture=true]   capture even when typing in inputs
 * @param {boolean} [opts.enabled=true]
 */
export function useBarcodeScanner(onScan, opts = {}) {
  const {
    interKeyTimeoutMs = 50,
    minLength = 3,
    alwaysCapture = true,
    enabled = true,
  } = opts;

  // Refs avoid re-binding listeners on every render — important for perf.
  const handlerRef = useRef(onScan);
  handlerRef.current = onScan;

  const bufferRef = useRef("");
  const lastTsRef = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;

    const isEditable = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };

    const onKeyDown = (e) => {
      const target = e.target;
      const targetIsEditable = isEditable(target);
      // Escape hatch for the dev simulator and any future "manual scan" UI.
      if (target?.closest?.("[data-bypass-scanner]")) return;
      if (targetIsEditable && !alwaysCapture) return;

      const now = performance.now();
      const elapsed = now - lastTsRef.current;

      if (e.key === "Enter") {
        const code = bufferRef.current;
        bufferRef.current = "";
        lastTsRef.current = 0;
        if (code.length >= minLength) {
          // Only swallow the Enter if it was clearly the scanner suffix
          // (i.e. we actually had a fast-typed buffer just before it).
          if (elapsed < interKeyTimeoutMs * 6) {
            e.preventDefault();
            e.stopPropagation();
          }
          handlerRef.current?.(code);
        }
        return;
      }

      // Only single-character "printable" keys belong in the barcode buffer.
      if (e.key.length !== 1) return;

      // If too much time has elapsed since the previous key, this is a
      // human typing, not a scanner — reset the buffer.
      if (elapsed > interKeyTimeoutMs) {
        bufferRef.current = "";
      }
      bufferRef.current += e.key;
      lastTsRef.current = now;

      // While the scanner is mid-burst, suppress accidental input into
      // whatever field happens to be focused.
      if (alwaysCapture && targetIsEditable) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, interKeyTimeoutMs, minLength, alwaysCapture]);
}
