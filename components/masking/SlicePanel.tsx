"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import { extractSlice, getSliceLayout, getSliceFrom3DMask } from "./niftiLoader"
import type { NiftiHeaderLike, SliceAxis } from "./types"

type Tool = "brush" | "eraser"

export interface SlicePanelProps {
  header: NiftiHeaderLike
  imageBuffer: ArrayBuffer
  mask3D: Uint8Array | null
  axis: SliceAxis
  sliceIndex: number
  sliceRange: { min: number; max: number }
  minMax: { min: number; max: number }
  brightness: number
  contrast: number
  tool: Tool
  brushSize: number
  /** 이 패널에서 그리기/슬라이스 변경 가능 여부 */
  interactive: boolean
  /** 포커스 시 테두리 */
  focused: boolean
  onFocus: () => void
  onSliceIndexChange: (delta: number) => void
  onMaskChange: (axis: SliceAxis, sliceIndex: number, mask: Uint8Array) => void
  /** 툴바 확대/축소 배율 (1 = 100%) */
  scaleMultiplier?: number
  /** AP/FH/RL 해부 방향 레이블 (상/하/좌/우) */
  axisLabels?: { top: string; bottom: string; left: string; right: string }
  /** 십자선 위치 (픽셀, 없으면 미표시) */
  crosshair?: { x: number; y: number }
  /** 슬라이스 표시 문구 (예: "13 of 24") */
  sliceLabel?: string
  /** 4D 볼륨 시 phase 인덱스 */
  phaseIndex?: number
  className?: string
}

export function SlicePanel({
  header,
  imageBuffer,
  mask3D,
  axis,
  sliceIndex,
  sliceRange,
  minMax,
  brightness,
  contrast,
  tool,
  brushSize,
  interactive,
  focused,
  onFocus,
  onSliceIndexChange,
  onMaskChange,
  scaleMultiplier = 1,
  axisLabels,
  crosshair,
  sliceLabel,
  phaseIndex = 0,
  className,
}: SlicePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const layout = getSliceLayout(header)
  const dims =
    axis === "axial"
      ? { width: layout.nx, height: layout.ny }
      : axis === "coronal"
        ? { width: layout.nx, height: layout.nz }
        : { width: layout.ny, height: layout.nz }

  const [isDrawing, setIsDrawing] = useState(false)
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const localMaskRef = useRef<Uint8Array | null>(null)

  const drawSlice = useCallback(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay) return
    const { data } = extractSlice(header, imageBuffer, axis, sliceIndex, {
      min: minMax.min,
      max: minMax.max,
      phaseIndex,
    })
    canvas.width = dims.width
    canvas.height = dims.height
    overlay.width = dims.width
    overlay.height = dims.height
    const ctx = canvas.getContext("2d")!
    const imgData = ctx.createImageData(dims.width, dims.height)
    const br = 1 + brightness / 100
    const co = 1 + contrast / 100
    const mid = 128
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i]
      let g = data[i + 1]
      let b = data[i + 2]
      r = Math.round(mid + (r - mid) * co * br + brightness)
      g = Math.round(mid + (g - mid) * co * br + brightness)
      b = Math.round(mid + (b - mid) * co * br + brightness)
      imgData.data[i] = Math.max(0, Math.min(255, r))
      imgData.data[i + 1] = Math.max(0, Math.min(255, g))
      imgData.data[i + 2] = Math.max(0, Math.min(255, b))
      imgData.data[i + 3] = 255
    }
    ctx.putImageData(imgData, 0, 0)
    const oCtx = overlay.getContext("2d")!
    oCtx.clearRect(0, 0, dims.width, dims.height)
    const sliceMask = mask3D
      ? getSliceFrom3DMask(mask3D, header, axis, sliceIndex)
      : localMaskRef.current
    if (sliceMask && sliceMask.length === dims.width * dims.height) {
      const oImg = oCtx.createImageData(dims.width, dims.height)
      for (let i = 0; i < sliceMask.length; i++) {
        const v = sliceMask[i]
        oImg.data[i * 4] = 255
        oImg.data[i * 4 + 1] = 0
        oImg.data[i * 4 + 2] = 0
        oImg.data[i * 4 + 3] = v * 0.5
      }
      oCtx.putImageData(oImg, 0, 0)
    }
    if (crosshair && crosshair.x >= 0 && crosshair.x <= dims.width && crosshair.y >= 0 && crosshair.y <= dims.height) {
      oCtx.setLineDash([4, 4])
      oCtx.strokeStyle = "rgba(59, 130, 246, 0.9)"
      oCtx.lineWidth = 1
      oCtx.beginPath()
      oCtx.moveTo(crosshair.x, 0)
      oCtx.lineTo(crosshair.x, dims.height)
      oCtx.moveTo(0, crosshair.y)
      oCtx.lineTo(dims.width, crosshair.y)
      oCtx.stroke()
      oCtx.setLineDash([])
    }
    if (axisLabels) {
      oCtx.font = "12px sans-serif"
      oCtx.fillStyle = "rgba(255,255,255,0.9)"
      oCtx.textAlign = "center"
      oCtx.fillText(axisLabels.top, dims.width / 2, 14)
      oCtx.fillText(axisLabels.bottom, dims.width / 2, dims.height - 4)
      oCtx.textAlign = "left"
      oCtx.fillText(axisLabels.left, 6, dims.height / 2 + 4)
      oCtx.textAlign = "right"
      oCtx.fillText(axisLabels.right, dims.width - 6, dims.height / 2 + 4)
    }
  }, [
    header,
    imageBuffer,
    mask3D,
    axis,
    sliceIndex,
    dims.width,
    dims.height,
    minMax,
    brightness,
    contrast,
    crosshair,
    axisLabels,
    phaseIndex,
  ])

  useEffect(() => {
    drawSlice()
  }, [drawSlice])

  const canvasToSlice = useCallback(
    (clientX: number, clientY: number) => {
      const overlay = overlayRef.current
      const cont = containerRef.current
      if (!overlay || !cont) return null
      const rect = cont.getBoundingClientRect()
      const effectiveScale = scale * scaleMultiplier
      const sx = (clientX - rect.left - pan.x) / effectiveScale
      const sy = (clientY - rect.top - pan.y) / effectiveScale
      const x = Math.floor(sx)
      const y = Math.floor(sy)
      if (x < 0 || x >= dims.width || y < 0 || y >= dims.height) return null
      return { x, y }
    },
    [pan, scale, scaleMultiplier, dims.width, dims.height]
  )

  const applyBrush = useCallback(
    (px: number, py: number) => {
      const w = dims.width
      const h = dims.height
      let sliceMask = mask3D ? getSliceFrom3DMask(mask3D, header, axis, sliceIndex) : localMaskRef.current
      if (!sliceMask || sliceMask.length !== w * h) {
        sliceMask = new Uint8Array(w * h)
        localMaskRef.current = sliceMask
      } else {
        sliceMask = new Uint8Array(sliceMask)
      }
      const r = Math.max(1, Math.floor(brushSize / 2))
      const value = tool === "brush" ? 255 : 0
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue
          const nx = px + dx
          const ny = py + dy
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            sliceMask[ny * w + nx] = value
          }
        }
      }
      onMaskChange(axis, sliceIndex, sliceMask)
      if (!mask3D) drawSlice()
    },
    [
      dims.width,
      dims.height,
      mask3D,
      header,
      axis,
      sliceIndex,
      tool,
      brushSize,
      onMaskChange,
      drawSlice,
    ]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return
      const isRightOrAux = e.button === 2 || e.button === 1
      if (isRightOrAux) {
        setIsPanning(true)
        panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
        e.currentTarget.setPointerCapture(e.pointerId)
        e.preventDefault()
        return
      }
      if (e.button !== 0) return
      onFocus()
      const p = canvasToSlice(e.clientX, e.clientY)
      if (p) {
        setIsDrawing(true)
        setLastPoint(p)
        applyBrush(p.x, p.y)
      }
    },
    [interactive, onFocus, pan.x, pan.y, canvasToSlice, applyBrush]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning && panStartRef.current) {
        setPan({
          x: panStartRef.current.panX + e.clientX - panStartRef.current.x,
          y: panStartRef.current.panY + e.clientY - panStartRef.current.y,
        })
        return
      }
      if (!isDrawing) return
      const p = canvasToSlice(e.clientX, e.clientY)
      if (p && lastPoint) {
        const dx = Math.abs(p.x - lastPoint.x)
        const dy = Math.abs(p.y - lastPoint.y)
        const steps = Math.max(dx, dy, 1)
        for (let t = 0; t <= steps; t++) {
          const x = Math.round(lastPoint.x + (p.x - lastPoint.x) * (t / steps))
          const y = Math.round(lastPoint.y + (p.y - lastPoint.y) * (t / steps))
          applyBrush(x, y)
        }
        setLastPoint(p)
      }
    },
    [isPanning, isDrawing, lastPoint, canvasToSlice, applyBrush]
  )

  const handlePointerUp = useCallback((e?: React.PointerEvent) => {
    if (e?.currentTarget && e.pointerId != null) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
    setIsDrawing(false)
    setLastPoint(null)
    setIsPanning(false)
    panStartRef.current = null
  }, [])

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!interactive) return
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        setScale((s) => Math.max(0.25, Math.min(4, s + (e.deltaY > 0 ? -0.1 : 0.1))))
      } else {
        const delta = e.deltaY > 0 ? 1 : -1
        onSliceIndexChange(delta)
      }
    },
    [interactive, onSliceIndexChange]
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener("wheel", handleWheel, { passive: false })
    return () => el.removeEventListener("wheel", handleWheel)
  }, [handleWheel])

  return (
    <div className={cn("flex flex-1 flex-col min-h-0", className)}>
      <div
        ref={containerRef}
        className={cn(
          "relative flex flex-1 min-h-0 overflow-auto rounded border bg-black flex items-center justify-center",
          focused && "ring-2 ring-primary"
        )}
        style={{ cursor: interactive ? (isPanning ? "grabbing" : "crosshair") : "default" }}
        onClick={interactive ? onFocus : undefined}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale * scaleMultiplier})`,
            transformOrigin: "0 0",
            position: "relative",
            width: dims.width,
            height: dims.height,
          }}
        >
          <canvas
            ref={canvasRef}
            width={dims.width}
            height={dims.height}
            className="block"
            style={{ imageRendering: "pixelated" }}
          />
          <canvas
            ref={overlayRef}
            width={dims.width}
            height={dims.height}
            className="absolute left-0 top-0 block"
            style={{
              imageRendering: "pixelated",
              cursor: interactive ? (isPanning ? "grabbing" : "crosshair") : "default",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => handlePointerUp()}
            onContextMenu={(e) => e.preventDefault()}
            aria-hidden
          />
        </div>
      </div>
      {sliceLabel != null && (
        <div className="text-xs text-muted-foreground px-1 py-0.5 text-center">{sliceLabel}</div>
      )}
    </div>
  )
}
