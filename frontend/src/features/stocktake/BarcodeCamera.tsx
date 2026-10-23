"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

type Detected = { rawValue: string };
type DetectorLike = { detect: (source: HTMLVideoElement) => Promise<Detected[]> };
type DetectorCtor = new (options?: { formats?: string[] }) => DetectorLike;

const SCAN_EVERY_MS = 350;
const REPEAT_MS = 2000;
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

type Props = {
  onCode: (code: string) => void;
  /** Permission refused, no camera, or no barcode detection in this browser. */
  onUnavailable: () => void;
};

/**
 * Live barcode reader (Raff Mobile › 2 · جرد بالكاميرا): the rear camera behind a
 * scan frame. Needs the browser's BarcodeDetector; otherwise it reports unavailable.
 */
export function BarcodeCamera({ onCode, onUnavailable }: Props) {
  const t = useTranslations("phone.count");
  const video = useRef<HTMLVideoElement>(null);
  const handlers = useRef({ onCode, onUnavailable });

  useEffect(() => {
    handlers.current = { onCode, onUnavailable };
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let live = true;
    let last = { code: "", at: 0 };

    const start = async () => {
      const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (!navigator.mediaDevices?.getUserMedia || !Detector)
        return handlers.current.onUnavailable();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        if (live) handlers.current.onUnavailable();
        return;
      }
      const el = video.current;
      if (!live || !el) return stream.getTracks().forEach((track) => track.stop());
      el.srcObject = stream;
      await el.play().catch(() => undefined);
      const detector = new Detector({ formats: FORMATS });
      timer = setInterval(async () => {
        try {
          const [hit] = await detector.detect(el);
          const now = Date.now();
          if (hit && (hit.rawValue !== last.code || now - last.at > REPEAT_MS)) {
            last = { code: hit.rawValue, at: now };
            handlers.current.onCode(hit.rawValue);
          }
        } catch {
          // A frame that cannot be read is skipped.
        }
      }, SCAN_EVERY_MS);
    };
    void start();

    return () => {
      live = false;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="relative h-[180px] overflow-hidden rounded-[14px] bg-camera">
      <video
        ref={video}
        muted
        playsInline
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-x-[40px] inset-y-[24px] rounded-[10px] border-2 border-camera-ink/90" />
      <div className="absolute inset-x-[40px] h-[2px] animate-[raff-scan_2.4s_ease-in-out_infinite] bg-camera-ink shadow-scan" />
      <div className="absolute inset-x-0 bottom-[10px] text-center text-[12px] text-camera-ink">
        {t("aim")}
      </div>
    </div>
  );
}
