// Module-level singleton — survives re-renders, shared across DebateRoom and DebriefRoom

let audioCtx: AudioContext | null = null

const panners: Record<string, StereoPannerNode> = {}
const analysers: Record<string, AnalyserNode> = {}
const nextStartTime: Record<string, number> = {}

const PAN_VALUES: Record<string, number> = {
  medications: -0.7,
  recovery: 0.0,
  emergency: 0.7,
}

/** Call this inside a user-gesture handler (button click) before any playback. */
export function initAudio(): void {
  if (audioCtx) return
  audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()

  for (const [agentId, pan] of Object.entries(PAN_VALUES)) {
    const panner = audioCtx.createStereoPanner()
    panner.pan.value = pan
    panner.connect(audioCtx.destination)
    panners[agentId] = panner

    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    analyser.connect(panner)
    analysers[agentId] = analyser

    nextStartTime[agentId] = 0
  }
}

/** Decode and schedule a base64-encoded PCM chunk for gapless playback. */
export function playChunk(agentId: string, base64: string): void {
  if (!audioCtx) return

  const binaryStr = atob(base64)
  const pcmBytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    pcmBytes[i] = binaryStr.charCodeAt(i)
  }

  const pcmData = new Int16Array(pcmBytes.buffer)
  const float32 = new Float32Array(pcmData.length)
  for (let i = 0; i < pcmData.length; i++) {
    float32[i] = pcmData[i] / 32768.0
  }

  const buffer = audioCtx.createBuffer(1, float32.length, 24000)
  buffer.copyToChannel(float32, 0)

  const source = audioCtx.createBufferSource()
  source.buffer = buffer

  const analyser = analysers[agentId]
  if (analyser) {
    source.connect(analyser)
  } else {
    source.connect(audioCtx.destination)
  }

  const now = audioCtx.currentTime
  const start = Math.max(now, nextStartTime[agentId] ?? 0)
  source.start(start)
  nextStartTime[agentId] = start + buffer.duration
}

/** Get the AnalyserNode for a given agent (for waveform rendering). */
export function getAnalyser(agentId: string): AnalyserNode | null {
  return analysers[agentId] ?? null
}
