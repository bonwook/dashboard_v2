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
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)

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
      const container = containerRef.current
      if (!overlay || !container) return null
      
      // 실제로 변형된 캔버스의 화면상 위치
      const overlayRect = overlay.getBoundingClientRect()
      
      // 캔버스 내부의 상대 좌표
      const relX = clientX - overlayRect.left
      const relY = clientY - overlayRect.top
      
      // 캔버스의 실제 픽셀 크기 대비 화면 크기 비율로 원본 좌표 계산
      const scaleX = dims.width / overlayRect.width
      const scaleY = dims.height / overlayRect.height
      
      const x = Math.floor(relX * scaleX)
      const y = Math.floor(relY * scaleY)
      
      if (x < 0 || x >= dims.width || y < 0 || y >= dims.height) return null
      return { x, y }
    },
    [dims.width, dims.height]
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
      
      const value = tool === "brush" ? 255 : 0
      
      // 브러시 크기가 이미지 픽셀 단위로 정확히 적용됨
      // brushSize=1 → 1x1 픽셀, brushSize=5 → 5x5 픽셀
      const halfSize = Math.floor(brushSize / 2)
      
      // 사각형 브러시: 정확히 brushSize x brushSize 픽셀 영역을 칠함
      for (let dy = -halfSize; dy < brushSize - halfSize; dy++) {
        for (let dx = -halfSize; dx < brushSize - halfSize; dx++) {
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
      const p = canvasToSlice(e.clientX, e.clientY)
      setMousePos(p)
      
      if (isPanning && panStartRef.current) {
        setPan({
          x: panStartRef.current.panX + e.clientX - panStartRef.current.x,
          y: panStartRef.current.panY + e.clientY - panStartRef.current.y,
        })
        return
      }
      if (!isDrawing) return
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
    [isPanning, isDrawing, lastPoint, canvasToSlice, applyBrush, scale, scaleMultiplier, brushSize]
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
  
  const handlePointerLeave = useCallback(() => {
    setMousePos(null)
    handlePointerUp()
  }, [handlePointerUp])

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!interactive) return
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        setScale((s) => Math.max(0.25, Math.min(10, s + (e.deltaY > 0 ? -0.1 : 0.1))))
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
            onPointerLeave={handlePointerLeave}
            onContextMenu={(e) => e.preventDefault()}
            aria-hidden
          />
        </div>
        
        {/* 브러시 미리보기 (transform 외부에 표시) */}
        {mousePos && interactive && !isPanning && overlayRef.current && (
          (() => {
            const overlayRect = overlayRef.current.getBoundingClientRect()
            const containerRect = containerRef.current?.getBoundingClientRect()
            if (!containerRect) return null
            
            const pixelToScreenRatio = overlayRect.width / dims.width
            const brushScreenSize = brushSize * pixelToScreenRatio
            
            // 픽셀 좌표를 화면 좌표로 변환
            const screenX = mousePos.x * pixelToScreenRatio + overlayRect.left - containerRect.left
            const screenY = mousePos.y * pixelToScreenRatio + overlayRect.top - containerRect.top
            
            return (
              <div
                style={{
                  position: "absolute",
                  left: screenX - brushScreenSize / 2,
                  top: screenY - brushScreenSize / 2,
                  width: brushScreenSize,
                  height: brushScreenSize,
                  border: `2px solid ${tool === "brush" ? "rgba(255, 0, 0, 0.9)" : "rgba(0, 150, 255, 0.9)"}`,
                  backgroundColor: tool === "brush" ? "rgba(255, 0, 0, 0.15)" : "rgba(0, 150, 255, 0.15)",
                  pointerEvents: "none",
                  zIndex: 15,
                  boxSizing: "border-box",
                }}
              />
            )
          })()
        )}
        
        {/* 격자 레이블 (transform 외부에서 고정 위치로 표시) */}
        {axisLabels && (
          <>
            {/* 상단 */}
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 text-white font-bold text-sm bg-black/60 px-2 py-0.5 rounded pointer-events-none"
              style={{ zIndex: 20 }}
            >
              {axisLabels.top}
            </div>
            {/* 하단 */}
            <div
              className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white font-bold text-sm bg-black/60 px-2 py-0.5 rounded pointer-events-none"
              style={{ zIndex: 20 }}
            >
              {axisLabels.bottom}
            </div>
            {/* 좌측 */}
            <div
              className="absolute left-2 top-1/2 -translate-y-1/2 text-white font-bold text-sm bg-black/60 px-2 py-0.5 rounded pointer-events-none"
              style={{ zIndex: 20 }}
            >
              {axisLabels.left}
            </div>
            {/* 우측 */}
            <div
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white font-bold text-sm bg-black/60 px-2 py-0.5 rounded pointer-events-none"
              style={{ zIndex: 20 }}
            >
              {axisLabels.right}
            </div>
          </>
        )}
      </div>
      {sliceLabel != null && (
        <div className="text-xs text-muted-foreground px-2 py-1 text-center bg-muted/20">{sliceLabel}</div>
      )}
    </div>
  )
}
