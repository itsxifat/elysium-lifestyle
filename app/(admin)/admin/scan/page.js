"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import toast from "react-hot-toast";
import { ScanLine, Camera, CameraOff, Search, X, Package, ExternalLink, RefreshCw, Smartphone, Download } from "lucide-react";
import { PageHeader, Card, Button, SectionTitle, Pill } from "@/components/admin/ui";
import { formatPrice, shouldUnoptimizeImage } from "@/lib/utils";

export default function ScanPage() {
  const [scanning, setScanning] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [looking, setLooking] = useState(false);
  const [manual, setManual] = useState("");
  const [appInfo, setAppInfo] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const intervalRef = useRef(null);
  const busyRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  const lookup = useCallback(async (code) => {
    if (!code) return;
    setLooking(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/scan?code=${encodeURIComponent(code)}`);
      const d = await res.json();
      setResult(d);
      if (d.found) navigator.vibrate?.(60);
    } catch {
      toast.error("Lookup failed");
    } finally {
      setLooking(false);
    }
  }, []);

  const onDetected = useCallback((value) => {
    busyRef.current = true;
    stopCamera();
    setManual(value);
    lookup(value);
  }, [stopCamera, lookup]);

  const startCamera = useCallback(async () => {
    setError("");
    setResult(null);
    busyRef.current = false;
    if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
      setSupported(false);
      setError("Live camera scanning isn't supported on this browser. Use Chrome on Android, or type the SKU below.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const all = await window.BarcodeDetector.getSupportedFormats();
      const want = ["qr_code", "code_39", "code_128", "ean_13", "ean_8", "upc_a", "code_93", "codabar"].filter((f) => all.includes(f));
      detectorRef.current = new window.BarcodeDetector(want.length ? { formats: want } : undefined);
      setScanning(true);

      intervalRef.current = setInterval(async () => {
        if (busyRef.current || !videoRef.current || !detectorRef.current) return;
        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          const value = codes?.[0]?.rawValue?.trim();
          if (value) onDetected(value);
        } catch { /* frame not ready */ }
      }, 250);
    } catch (e) {
      setError(e?.name === "NotAllowedError" ? "Camera permission denied — allow camera access and retry." : "Could not start the camera.");
    }
  }, [onDetected]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Is the installable Android scanner app published? (built by CI into /public/app)
  useEffect(() => {
    fetch("/app/version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAppInfo(d))
      .catch(() => {});
  }, []);

  const submitManual = (e) => {
    e.preventDefault();
    if (manual.trim()) lookup(manual.trim());
  };

  return (
    <div>
      <PageHeader
        title="Scan Product"
        subtitle="Scan a QR / barcode (SKU) to see exactly what's being shipped"
        icon={ScanLine}
        actions={
          scanning ? (
            <Button variant="outline" onClick={stopCamera}><CameraOff size={14} /> Stop</Button>
          ) : (
            <Button onClick={startCamera}><Camera size={14} /> Start camera</Button>
          )
        }
      />

      {/* Native Android app — scans with the phone camera directly (bypasses the
          browser camera) and shows the full packing list for the shipment. */}
      <Card className="mb-5 bg-brand-cream/40 border border-brand-tan/15">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-brand-terracotta/10 flex items-center justify-center flex-shrink-0">
              <Smartphone size={20} className="text-brand-terracotta" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-brand-brown flex items-center gap-2">
                Android scanner app
                {appInfo?.version && <Pill tone="terracotta">v{appInfo.version}</Pill>}
              </p>
              <p className="text-[12.5px] text-brand-tan leading-relaxed mt-0.5">
                Camera blocked in the browser? Install the native app — it scans labels with the phone
                camera directly and shows the full packing list. Sign in with your own admin account.
                {appInfo?.available && <span className="block mt-0.5">First time: tap <b>Install</b>, then allow “install unknown apps” when Android asks.</span>}
              </p>
            </div>
          </div>
          <div className="flex-shrink-0">
            {appInfo?.available ? (
              <Button as="a" href={appInfo.apk} download>
                <Download size={14} /> Install app
              </Button>
            ) : (
              <Pill tone="gray">App build not published yet</Pill>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Scanner */}
        <Card className="space-y-3">
          <SectionTitle>Scanner</SectionTitle>
          <div className="relative aspect-[4/3] bg-black rounded-xl overflow-hidden flex items-center justify-center">
            <video ref={videoRef} playsInline muted className={`w-full h-full object-cover ${scanning ? "" : "hidden"}`} />
            {scanning && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-3/4 max-w-[260px] aspect-square border-2 border-white/80 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                <div className="absolute left-1/2 -translate-x-1/2 w-3/4 max-w-[260px] h-0.5 bg-brand-terracotta animate-pulse" />
              </div>
            )}
            {!scanning && (
              <div className="text-center px-6">
                <ScanLine size={34} className="mx-auto text-white/40 mb-3" />
                <p className="text-white/70 text-sm">Point the camera at a product QR or barcode.</p>
                <Button onClick={startCamera} className="mt-4"><Camera size={14} /> Start camera</Button>
              </div>
            )}
          </div>
          {error && <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</p>}

          {/* Manual entry */}
          <form onSubmit={submitManual} className="pt-1">
            <p className="text-[11px] text-brand-tan mb-1.5">Or enter a SKU manually</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-tan/60" />
                <input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="SKU code"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-brand-tan/30 text-sm text-brand-brown focus:outline-none focus:border-brand-brown"
                />
              </div>
              <Button type="submit" disabled={looking || !manual.trim()}>{looking ? "…" : "Look up"}</Button>
            </div>
          </form>
        </Card>

        {/* Result */}
        <Card>
          <div className="flex items-center justify-between">
            <SectionTitle className="mb-0">Result</SectionTitle>
            {result && <button onClick={() => { setResult(null); setManual(""); startCamera(); }} className="text-[12px] text-brand-terracotta inline-flex items-center gap-1 hover:underline"><RefreshCw size={12} /> Scan again</button>}
          </div>

          {looking ? (
            <div className="py-12 text-center text-brand-tan text-sm">Looking up…</div>
          ) : !result ? (
            <div className="py-12 text-center">
              <Package size={30} className="mx-auto text-brand-tan/40 mb-2" />
              <p className="text-sm text-brand-tan">Scan or enter a code to see the product.</p>
            </div>
          ) : !result.found ? (
            <div className="py-10 text-center">
              <X size={28} className="mx-auto text-red-400 mb-2" />
              <p className="text-brand-brown font-medium">No product found</p>
              <p className="text-[12px] text-brand-tan mt-1">Code: <span className="font-mono">{result.code}</span></p>
            </div>
          ) : (
            <div className="mt-3">
              <div className="flex gap-4">
                <div className="relative w-24 h-28 flex-shrink-0 rounded-lg overflow-hidden bg-brand-cream-dark">
                  <Image src={result.product.image || "/placeholder.jpg"} alt={result.product.name} fill sizes="96px" unoptimized={shouldUnoptimizeImage(result.product.image)} className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  {result.product.category && <p className="text-[10px] uppercase tracking-[2px] text-brand-tan">{result.product.category.name}</p>}
                  <p className="font-semibold text-brand-brown leading-snug">{result.product.name}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Pill tone={result.product.isPublished ? "green" : "gray"}>{result.product.isPublished ? "Published" : "Draft"}</Pill>
                    {result.matchedVariant && <Pill tone="terracotta">Size {result.matchedVariant.size}</Pill>}
                  </div>
                  <Link href={`/admin/products/${result.product._id}/edit`} className="inline-flex items-center gap-1 text-[12px] text-brand-terracotta hover:underline mt-2">
                    Edit product <ExternalLink size={11} />
                  </Link>
                </div>
              </div>

              {result.matchedVariant && (
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-brand-cream/60 py-2.5"><p className="text-[10px] uppercase text-brand-tan">Price</p><p className="font-bold text-brand-brown">{formatPrice(result.matchedVariant.price)}</p></div>
                  <div className="rounded-lg bg-brand-cream/60 py-2.5"><p className="text-[10px] uppercase text-brand-tan">Stock</p><p className={`font-bold ${result.matchedVariant.stock > 0 ? "text-emerald-600" : "text-red-600"}`}>{result.matchedVariant.stock}</p></div>
                  <div className="rounded-lg bg-brand-cream/60 py-2.5"><p className="text-[10px] uppercase text-brand-tan">SKU</p><p className="font-mono text-[12px] text-brand-brown truncate">{result.matchedVariant.sku}</p></div>
                </div>
              )}

              {/* All variants */}
              <div className="mt-4">
                <p className="text-[11px] uppercase tracking-wide text-brand-tan mb-2">All sizes</p>
                <div className="border border-brand-tan/15 rounded-lg overflow-hidden divide-y divide-brand-tan/10">
                  {result.variants.map((v) => (
                    <div key={v.size + v.sku} className={`flex items-center justify-between px-3 py-2 text-[13px] ${result.matchedVariant?.sku === v.sku ? "bg-brand-terracotta/5" : ""}`}>
                      <span className="font-medium text-brand-brown w-12">{v.size}</span>
                      <span className="font-mono text-[11px] text-brand-tan flex-1 truncate px-2">{v.sku || "—"}</span>
                      <span className="text-brand-brown">{formatPrice(v.price)}</span>
                      <span className={`w-14 text-right ${v.stock > 0 ? "text-emerald-600" : "text-red-500"}`}>{v.stock} left</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
