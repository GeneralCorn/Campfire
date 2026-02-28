"use client"

import { useEffect, useRef } from "react"

interface WaveformProps {
  analyser: AnalyserNode | null
  color: string
  active: boolean
}

export function Waveform({ analyser, color, active }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!analyser || !active) {
      cancelAnimationFrame(rafRef.current)
      // Draw flat idle bars when not active
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      const W = canvas.width
      const H = canvas.height
      const BAR_COUNT = 24
      const barW = W / BAR_COUNT
      ctx.clearRect(0, 0, W, H)
      for (let i = 0; i < BAR_COUNT; i++) {
        const x = i * barW + barW * 0.15
        ctx.fillStyle = color
        ctx.globalAlpha = 0.15
        ctx.fillRect(x, H / 2 - 1, barW * 0.7, 2)
      }
      ctx.globalAlpha = 1
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    const BAR_COUNT = 24

    function draw() {
      rafRef.current = requestAnimationFrame(draw)
      analyser!.getByteFrequencyData(dataArray)

      const W = canvas!.width
      const H = canvas!.height
      ctx!.clearRect(0, 0, W, H)

      const barW = W / BAR_COUNT
      const step = Math.floor(bufferLength / BAR_COUNT)

      for (let i = 0; i < BAR_COUNT; i++) {
        const value = dataArray[i * step] / 255
        const barH = Math.max(2, value * H * 0.9)
        const x = i * barW + barW * 0.15
        const y = (H - barH) / 2

        ctx!.fillStyle = color
        ctx!.globalAlpha = 0.3 + value * 0.7
        ctx!.fillRect(x, y, barW * 0.7, barH)
      }
      ctx!.globalAlpha = 1
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [analyser, active, color])

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={36}
      className="w-full h-9"
    />
  )
}
