import { useState, useRef, useCallback } from "react";

/**
 * useMicrophone — Custom hook for recording audio via the native MediaRecorder API.
 *
 * Returns:
 *   isRecording  — whether the mic is currently recording
 *   startRecording() — begins capture
 *   stopRecording()  — stops and resolves with an audio/webm Blob
 */
export function useMicrophone() {
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const resolverRef = useRef<((blob: Blob) => void) | null>(null);

    const startRecording = useCallback(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
            // Stop all tracks so the browser mic indicator turns off
            stream.getTracks().forEach((t) => t.stop());

            const blob = new Blob(chunksRef.current, { type: "audio/webm" });
            resolverRef.current?.(blob);
            resolverRef.current = null;
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true);
    }, []);

    const stopRecording = useCallback((): Promise<Blob> => {
        return new Promise((resolve) => {
            resolverRef.current = resolve;
            if (mediaRecorderRef.current?.state === "recording") {
                mediaRecorderRef.current.stop();
            }
            setIsRecording(false);
        });
    }, []);

    return { isRecording, startRecording, stopRecording } as const;
}
