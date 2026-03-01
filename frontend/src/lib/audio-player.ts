/**
 * PCM Audio Player — gapless Web Audio API playback for ElevenLabs streaming.
 *
 * Decodes base64 PCM chunks (16-bit signed, 24kHz) into Float32
 * and schedules them back-to-back on the Web Audio timeline.
 *
 * Pattern ported from test_client.html playPCMChunk().
 */

const SAMPLE_RATE = 24_000;

let audioContext: AudioContext | null = null;
let nextPlayTime = 0;
let stopped = false;

export function initAudio(): AudioContext {
  stopped = false;
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  }
  // Resume if suspended (browser autoplay policy)
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  // Reset scheduling timeline
  nextPlayTime = 0;
  return audioContext;
}

/**
 * Decode a base64 PCM chunk and schedule gapless playback.
 * ElevenLabs WebSocket returns base64-encoded PCM 16-bit signed integer audio.
 */
export function playChunk(base64Audio: string): void {
  if (stopped) return;
  if (!audioContext) initAudio();
  if (!audioContext) return;

  // Decode base64 → raw bytes
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Convert PCM Int16 → Float32
  const pcm16 = new Int16Array(bytes.buffer);
  const float32Data = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32Data[i] = pcm16[i] / 32768.0;
  }

  // Create audio buffer and schedule playback
  const buffer = audioContext.createBuffer(1, float32Data.length, audioContext.sampleRate);
  buffer.copyToChannel(float32Data, 0);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);

  const currentTime = audioContext.currentTime;
  const playTime = Math.max(currentTime, nextPlayTime);

  source.start(playTime);
  nextPlayTime = playTime + buffer.duration;
}

/**
 * Stop all audio playback and reset the timeline.
 * Used when the user interrupts a conversation.
 */
export function stopAll(): void {
  stopped = true;
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  nextPlayTime = 0;
}
