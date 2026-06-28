'use client';

/* ============================================================
   Presentation · QR scanner (staff station)
   Thin wrapper over @zxing/browser. The library is dynamically imported
   inside the effect so it never lands in the server bundle and the page
   builds/renders even where no camera exists. Decoding loops continuously;
   the parent debounces duplicate reads. Any camera failure (denied /
   unavailable / insecure context) is reported via `onError` so the parent
   can fall back to manual code entry — the feature stays usable without a
   camera.
   ============================================================ */

import { useEffect, useRef } from 'react';

export type QrCameraError = 'permission' | 'unavailable';

interface QrScannerProps {
  onDecode: (text: string) => void;
  onError: (kind: QrCameraError) => void;
}

export function QrScanner({ onDecode, onError }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Keep latest callbacks without re-running the start effect (which would
  // restart the camera on every parent render).
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let cancelled = false;

    async function start() {
      const video = videoRef.current;
      if (!video) return;

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        onErrorRef.current('unavailable');
        return;
      }

      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserQRCodeReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          video,
          (result) => {
            if (result) onDecodeRef.current(result.getText());
          },
        );
        if (cancelled && controls) {
          controls.stop();
          controls = null;
        }
      } catch (err) {
        const name = (err as { name?: string })?.name ?? '';
        if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
          onErrorRef.current('permission');
        } else {
          onErrorRef.current('unavailable');
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (controls) controls.stop();
    };
  }, []);

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      aria-label="QR scanner"
      style={{
        width: '100%',
        aspectRatio: '1 / 1',
        objectFit: 'cover',
        background: '#000',
        border: '3px solid var(--line)',
      }}
    />
  );
}
