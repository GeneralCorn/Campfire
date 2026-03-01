"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScanLine, ImagePlus, X, Loader2, Pill, HeartPulse, ShieldAlert, User, CheckCircle2 } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";

export function ScanRoom() {
  // Persisted in store so state survives tab switches
  const preview = useAppStore((s) => s.scanPreview);
  const setScanPreview = useAppStore((s) => s.setScanPreview);
  const result = useAppStore((s) => s.scanResult);
  const setScanResult = useAppStore((s) => s.setScanResult);
  const merged = useAppStore((s) => s.scanMerged);
  const setScanMerged = useAppStore((s) => s.setScanMerged);
  const mergeVLMScan = useAppStore((s) => s.mergeVLMScan);
  const setActiveRoom = useAppStore((s) => s.setActiveRoom);

  // Transient local state (OK to reset on remount)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Elapsed timer while scanning
  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setScanPreview(reader.result as string);
    reader.readAsDataURL(file);
    setScanResult(null);
    setError(null);
  }, [setScanPreview, setScanResult]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  const runScan = useCallback(async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      // Strip data:image/...;base64, prefix to get raw base64
      const base64 = preview.replace(/^data:image\/[^;]+;base64,/, "");
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: [base64] }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? `Request failed (${res.status})`);
      }
      const data = await res.json();
      setScanResult(data);
      // Merge into patient discharge state so it shows in Medications / Restrictions / Warning Signs tabs
      mergeVLMScan(data);
      setScanMerged(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, [preview, mergeVLMScan, setScanResult, setScanMerged]);

  const clear = useCallback(() => {
    setScanPreview(null);
    setScanResult(null);
    setError(null);
    setScanMerged(false);
  }, [setScanPreview, setScanResult, setScanMerged]);

  return (
    <div className="flex flex-col h-full bg-[#F0F4F8]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-[52px] border-b border-[#E2E8F0] bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-[#0891B2]/10 flex items-center justify-center shrink-0">
            <ScanLine size={13} className="text-[#0891B2]" />
          </div>
          <div>
            <h2 className="text-[13px] font-semibold text-[#1E293B] tracking-[-0.01em]">
              Prescription Scanner
            </h2>
            <p className="text-[10px] text-[#94A3B8]">
              Upload a prescription or discharge document for AI extraction
            </p>
          </div>
        </div>
        {preview && (
          <button
            onClick={clear}
            className="flex items-center gap-1 text-[11px] text-[#DC2626] hover:bg-[#DC2626]/5 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex gap-5 p-5 overflow-hidden">
        {/* Left: Upload / Preview */}
        <div className="flex-1 flex flex-col min-w-0">
          {!preview ? (
            <button
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex-1 flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed transition-colors cursor-pointer bg-white ${
                dragOver
                  ? "border-[#0891B2] bg-[#F0FDFA]"
                  : "border-[#E2E8F0] hover:border-[#0891B2]/40"
              }`}
            >
              <ImagePlus size={40} className="text-[#CBD5E1]" />
              <div className="text-center">
                <p className="text-sm text-[#64748B]">
                  Drop a prescription image here or click to upload
                </p>
                <p className="text-[11px] text-[#94A3B8] mt-1">
                  Supports discharge papers, prescriptions, lab results
                </p>
              </div>
            </button>
          ) : (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              <div className="flex-1 flex items-center justify-center bg-white rounded-xl border border-[#E2E8F0] p-4 overflow-hidden min-h-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Uploaded document"
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              </div>
              <button
                onClick={runScan}
                disabled={loading}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors shrink-0 cursor-pointer ${
                  loading
                    ? "bg-[#0891B2]/60 text-white cursor-not-allowed"
                    : "bg-[#0891B2] text-white hover:bg-[#0E7490]"
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {elapsed < 8
                      ? "Waking up GPU..."
                      : elapsed < 20
                        ? "Processing image with Qwen2-VL..."
                        : "Extracting structured data..."}
                    <span className="text-white/60 font-mono text-xs ml-1">{elapsed}s</span>
                  </>
                ) : (
                  <>
                    <ScanLine size={16} />
                    Scan Document
                  </>
                )}
              </button>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={onSelect}
            className="hidden"
          />
        </div>

        {/* Right: Results */}
        <div className="w-[320px] shrink-0 overflow-y-auto space-y-3">
          {error && (
            <div className="rounded-lg border border-[#DC2626]/30 bg-[#FEF2F2] px-4 py-3">
              <p className="text-sm text-[#DC2626]">{error}</p>
            </div>
          )}

          {!result && !error && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <ScanLine size={36} className="text-[#E2E8F0] mb-3" />
              <p className="text-sm text-[#94A3B8]">
                Upload and scan a document to see extracted information
              </p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <div className="w-10 h-10 border-2 border-[#0891B2] border-t-transparent rounded-full animate-spin" />
              <div>
                <p className="text-sm font-medium text-[#1E293B]">
                  {elapsed < 8
                    ? "Waking up Modal GPU..."
                    : elapsed < 20
                      ? "Running Qwen2-VL inference..."
                      : "Extracting structured data..."}
                </p>
                <p className="text-xs text-[#94A3B8] mt-1">
                  {elapsed}s elapsed
                  {elapsed < 8 && " — cold start may take ~10s"}
                </p>
              </div>
              <div className="w-full max-w-[200px] h-1 bg-[#E2E8F0] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0891B2] rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(95, elapsed * 2.5)}%` }}
                />
              </div>
            </div>
          )}

          {result && (
            <>
              {/* Merge confirmation */}
              {merged && (
                <div className="rounded-lg border border-[#059669]/30 bg-[#F0FDF4] px-4 py-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <CheckCircle2 size={14} className="text-[#059669]" />
                    <span className="text-[12px] font-semibold text-[#059669]">
                      Added to Care Plan
                    </span>
                  </div>
                  <p className="text-[11px] text-[#64748B] mb-2">
                    {result.medications.length} medication{result.medications.length !== 1 ? "s" : ""}
                    {result.restrictions.length > 0 &&
                      `, ${result.restrictions.length} restriction${result.restrictions.length !== 1 ? "s" : ""}`}
                    {result.warning_signs.length > 0 &&
                      `, ${result.warning_signs.length} warning sign${result.warning_signs.length !== 1 ? "s" : ""}`}
                    {" "}merged into your patient record.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveRoom("medications")}
                      className="text-[11px] font-medium text-[#0891B2] hover:underline cursor-pointer"
                    >
                      View Medications
                    </button>
                    <button
                      onClick={() => setActiveRoom("overview")}
                      className="text-[11px] font-medium text-[#64748B] hover:underline cursor-pointer"
                    >
                      View Overview
                    </button>
                  </div>
                </div>
              )}

              {/* Patient Info */}
              {result.patient_info &&
                (result.patient_info.name || result.patient_info.procedure) && (
                  <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
                    <div className="flex items-center gap-1.5 mb-3">
                      <User size={13} className="text-[#0891B2]" />
                      <span className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-[0.08em]">
                        Patient Info
                      </span>
                    </div>
                    <div className="space-y-1.5 text-[12px]">
                      {result.patient_info.name && (
                        <div className="flex justify-between">
                          <span className="text-[#64748B]">Name</span>
                          <span className="text-[#1E293B] font-medium">
                            {result.patient_info.name}
                          </span>
                        </div>
                      )}
                      {result.patient_info.procedure && (
                        <div className="flex justify-between">
                          <span className="text-[#64748B]">Procedure</span>
                          <span className="text-[#1E293B] font-medium">
                            {result.patient_info.procedure}
                          </span>
                        </div>
                      )}
                      {result.patient_info.discharge_date && (
                        <div className="flex justify-between">
                          <span className="text-[#64748B]">Discharged</span>
                          <span className="text-[#1E293B] font-medium">
                            {result.patient_info.discharge_date}
                          </span>
                        </div>
                      )}
                      {result.patient_info.doctor && (
                        <div className="flex justify-between">
                          <span className="text-[#64748B]">Doctor</span>
                          <span className="text-[#1E293B] font-medium">
                            {result.patient_info.doctor}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              {/* Medications */}
              {result.medications.length > 0 && (
                <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Pill size={13} className="text-[#0891B2]" />
                    <span className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-[0.08em]">
                      Medications ({result.medications.length})
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {result.medications.map((m, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-[#E2E8F0] px-3 py-2"
                        style={{ borderLeft: "3px solid #0891B2" }}
                      >
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[12px] font-semibold text-[#1E293B]">
                            {m.name}
                          </span>
                          {m.dosage && (
                            <span className="text-[11px] text-[#64748B]">
                              {m.dosage}
                            </span>
                          )}
                        </div>
                        {m.frequency && (
                          <p className="text-[11px] text-[#64748B] mt-0.5">
                            {m.frequency}
                          </p>
                        )}
                        {m.instructions && (
                          <p className="text-[10px] text-[#94A3B8] mt-0.5">
                            {m.instructions}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Restrictions */}
              {result.restrictions.length > 0 && (
                <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <HeartPulse size={13} className="text-[#059669]" />
                    <span className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-[0.08em]">
                      Restrictions ({result.restrictions.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {result.restrictions.map((r, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-[#E2E8F0] px-3 py-2"
                        style={{ borderLeft: "3px solid #059669" }}
                      >
                        <span className="text-[12px] font-semibold text-[#1E293B]">
                          {r.activity}
                        </span>
                        {r.duration && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[#F0FDFA] text-[#059669] border border-[#059669]/25 font-medium">
                            {r.duration}
                          </span>
                        )}
                        {r.details && (
                          <p className="text-[11px] text-[#64748B] mt-1">
                            {r.details}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warning Signs */}
              {result.warning_signs.length > 0 && (
                <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <ShieldAlert size={13} className="text-[#D97706]" />
                    <span className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-[0.08em]">
                      Warning Signs ({result.warning_signs.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {result.warning_signs.map((w, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-[#E2E8F0] px-3 py-2"
                        style={{
                          borderLeft: `3px solid ${w.severity === "emergency" ? "#DC2626" : "#D97706"}`,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              w.severity === "emergency"
                                ? "bg-[#DC2626]"
                                : "bg-[#D97706]"
                            }`}
                          />
                          <span className="text-[12px] font-semibold text-[#1E293B]">
                            {w.symptom}
                          </span>
                        </div>
                        {w.action && (
                          <p className="text-[11px] text-[#64748B] mt-1 ml-3.5">
                            {w.action}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
