"use client";

import { useCallback, useRef, useState } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { ImagePlus, X } from "lucide-react";

export function ImageUploadPanel() {
  const pendingImage = useAppStore((s) => s.pendingImage);
  const setPendingImage = useAppStore((s) => s.setPendingImage);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        setPendingImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    },
    [setPendingImage]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset so same file can be re-selected
      e.target.value = "";
    },
    [handleFile]
  );

  if (pendingImage) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 h-12 border-b border-white/[0.06] shrink-0">
          <span className="text-xs font-mono text-text-dim uppercase tracking-[0.08em]">
            Queued Image
          </span>
          <button
            onClick={() => setPendingImage(null)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-danger hover:bg-danger/10 transition-colors cursor-pointer"
          >
            <X size={12} />
            Clear
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pendingImage}
            alt="Queued for analysis"
            className="max-w-full max-h-full rounded-lg border border-white/[0.08] object-contain"
          />
        </div>
        <p className="text-[10px] text-text-dim text-center px-4 pb-3">
          This image will be sent with your next query in rounds
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] shrink-0">
        <ImagePlus size={14} className="text-text-dim" />
        <span className="text-xs font-mono text-text-dim uppercase tracking-[0.08em]">
          Image Upload
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <button
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`w-full h-full max-h-[300px] flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
            dragOver
              ? "border-broadcast/50 bg-broadcast/5"
              : "border-white/[0.08] hover:border-white/[0.15] bg-white/[0.02]"
          }`}
        >
          <ImagePlus size={32} className="text-text-dim/40" />
          <div className="text-center">
            <p className="text-xs text-text-secondary">
              Drop an image here or click to upload
            </p>
            <p className="text-[10px] text-text-dim mt-1">
              For VLM analysis — prescriptions, lab results, etc.
            </p>
          </div>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onSelect}
          className="hidden"
        />
      </div>
    </div>
  );
}
