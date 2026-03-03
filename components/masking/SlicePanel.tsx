"use client"

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from "react"
import type { MutableRefObject } from "react"
import { cn } from "@/lib/utils"
import { extractSlice, getSliceLayout, getSliceFrom3DMask } from "./niftiLoader"
import type { NiftiHeaderLike, SliceAxis } from "./types"

type Tool = "brush" | "eraser"

export interface SlicePanelHandle {
  redrawMask: () => void
}

export interface SlicePanelProps {
  header: NiftiHeaderLike
  imageBuffer: ArrayBuffer
  mask3DRef: MutableRefObject<Uint8Array | null>
  axis: SliceAxis
  sliceIndex: number
  sliceRange: { min: number; max: number }
  minMax: { min: number; max: number }
  brightness: number
  contrast: number
  tool: Tool
  brushSize: number
  interactive: boolean
  focused: boolean
  onFocus: () => void
  onSliceIndexChange: (delta: number) => void
  onMaskChange: (axis: SliceAxis, sliceIndex: number, mask: Uint8Array) => void
  scaleMultiplier?: number
  axisLabels?: { top: string; bottom: string; left: string; right: string }
  crosshair?: { x: number; y: number }
  sliceLabel?: string
  phaseIndex?: number
  className?: string
}

export const SlicePanel = forwardRef<SlicePanelHandle, SlicePanelProps>(function SlicePanel(
  {
    header,
    imageBuffer,
    mask3DRef,
    axis,
    sliceIndex,
    sliceRange: _sliceRange,
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
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const brushPreviewRef = useRef<HTMLDivElement>(null)
  const localMaskRef = useRef<Uint8Array | null>(null)

  // drawing state을 ref로 관리 → 드로잉 중 React 리렌더 없음
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  const [isPanning, setIsPanning] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)

  const layout = getSliceLayout(header)
  const dims =
    axis === "axial"
      ? { width: layout.nx, height: layout.ny }
      : axis === "coronal"
        ? { width: layout.nx, height: layout.nz }
        : { width: layout.ny, height: layout.nz }

  // 이미지 레이어만 그리기 (무거운 extractSlice 포함 - 슬라이스/밝기/대비 변경 시만 실행)
  const drawImage = useCallback(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay) return
    canvas.width = dims.width
    canvas.height = dims.height
    overlay.width = dims.width
    overlay.height = dims.height
    const { data } = extractSlice(header, imageBuffer, axis, sliceIndex, {
      min: minMax.min,
      max: minMax.max,
      phaseIndex,
    })
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
  }, [header, imageBuffer, axis, sliceIndex, dims.width, dims.height, minMax, brightness, contrast, phaseIndex])

  // 마스크+십자선 오버레이만 그리기 (가벼운 연산 - 브러시질 중 이것만 호출)
  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const oCtx = overlay.getContext("2d")!
    oCtx.clearRect(0, 0, dims.width, dims.height)
    const sliceMask = mask3DRef.current
      ? getSliceFrom3DMask(mask3DRef.current, header, axis, sliceIndex)
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
    if (
      crosshair &&
      crosshair.x >= 0 &&
      crosshair.x <= dims.width &&
      crosshair.y >= 0 &&
      crosshair.y <= dims.height
    ) {
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
  }, [header, axis, sliceIndex, dims.width, dims.height, crosshair])
  // mask3DRef는 안정적인 ref 객체이므로 deps 불필요

  useEffect(() => { drawImage() }, [drawImage])
  useEffect(() => { drawOverlay() }, [drawOverlay])

  // 부모(MaskingCanvas)에서 마스크 갱신 후 직접 호출
  useImperativeHandle(ref, () => ({ redrawMask: drawOverlay }), [drawOverlay])

  const canvasToSlice = useCallback(
    (clientX: number, clientY: number) => {
      const overlay = overlayRef.current
      if (!overlay) return null
      const overlayRect = overlay.getBoundingClientRect()
      const relX = clientX - overlayRect.left
      const relY = clientY - overlayRect.top
      const scaleX = dims.width / overlayRect.width
      const scaleY = dims.height / overlayRect.height
      const x = Math.floor(relX * scaleX)
      const y = Math.floor(relY * scaleY)
      if (x < 0 || x >= dims.width || y < 0 || y >= dims.height) return null
      return { x, y }
    },
    [dims.width, dims.height]
  )

  // 현재 2D 슬라이스 마스크 복사본 반환 (mousemove당 1번만 호출)
  const getSliceMaskCopy = useCallback(() => {
    const w = dims.width
    const h = dims.height
    const src = mask3DRef.current
      ? getSliceFrom3DMask(mask3DRef.current, header, axis, sliceIndex)
      : localMaskRef.current
    if (!src || src.length !== w * h) return new Uint8Array(w * h)
    return new Uint8Array(src)
  }, [header, axis, sliceIndex, dims.width, dims.height])

  // 2D 마스크 버퍼에 브러시 픽셀 적용 (onMaskChange 호출 없음)
  const applyBrushToMask = useCallback(
    (sliceMask: Uint8Array, px: number, py: number) => {
      const w = dims.width
      const h = dims.height
      const value = tool === "brush" ? 255 : 0
      const halfSize = Math.floor(brushSize / 2)
      for (let dy = -halfSize; dy < brushSize - halfSize; dy++) {
        for (let dx = -halfSize; dx < brushSize - halfSize; dx++) {
          const nx = px + dx
          const ny = py + dy
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            sliceMask[ny * w + nx] = value
          }
        }
      }
    },
    [dims.width, dims.height, tool, brushSize]
  )

  // 브러시 커서 미리보기: React state 대신 DOM 직접 조작 → 리렌더 없음
  const updateBrushPreview = useCallback(
    (p: { x: number; y: number } | null) => {
      const preview = brushPreviewRef.current
      const overlay = overlayRef.current
      const container = containerRef.current
      if (!preview || !overlay || !container || !interactive) {
        if (preview) preview.style.display = "none"
        return
      }
      if (!p) {
        preview.style.display = "none"
        return
      }
      const overlayRect = overlay.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const pixelToScreenRatio = overlayRect.width / dims.width
      const brushScreenSize = brushSize * pixelToScreenRatio
      const screenX = p.x * pixelToScreenRatio + overlayRect.left - containerRect.left
      const screenY = p.y * pixelToScreenRatio + overlayRect.top - containerRect.top
      preview.style.display = "block"
      preview.style.left = `${screenX - brushScreenSize / 2}px`
      preview.style.top = `${screenY - brushScreenSize / 2}px`
      preview.style.width = `${brushScreenSize}px`
      preview.style.height = `${brushScreenSize}px`
      preview.style.borderColor =
        tool === "brush" ? "rgba(255, 0, 0, 0.9)" : "rgba(0, 150, 255, 0.9)"
      preview.style.backgroundColor =
        tool === "brush" ? "rgba(255, 0, 0, 0.15)" : "rgba(0, 150, 255, 0.15)"
    },
    [dims.width, brushSize, tool, interactive]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return
      if (e.button === 2 || e.button === 1) {
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
        isDrawingRef.current = true
        lastPointRef.current = p
        const sliceMask = getSliceMaskCopy()
        applyBrushToMask(sliceMask, p.x, p.y)
        onMaskChange(axis, sliceIndex, sliceMask)
      }
    },
    [interactive, onFocus, pan.x, pan.y, canvasToSlice, getSliceMaskCopy, applyBrushToMask, onMaskChange, axis, sliceIndex]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const p = canvasToSlice(e.clientX, e.clientY)
      updateBrushPreview(p)

      if (isPanning && panStartRef.current) {
        setPan({
          x: panStartRef.current.panX + e.clientX - panStartRef.current.x,
          y: panStartRef.current.panY + e.clientY - panStartRef.current.y,
        })
        return
      }

      if (!isDrawingRef.current || !p || !lastPointRef.current) return

      // 슬라이스 마스크를 한 번만 꺼내서 모든 인터폴레이션 포인트에 적용 후 onMaskChange 1회 호출
      const sliceMask = getSliceMaskCopy()
      const lp = lastPointRef.current
      const dx = Math.abs(p.x - lp.x)
      const dy = Math.abs(p.y - lp.y)
      const steps = Math.max(dx, dy, 1)
      for (let t = 0; t <= steps; t++) {
        const x = Math.round(lp.x + (p.x - lp.x) * (t / steps))
        const y = Math.round(lp.y + (p.y - lp.y) * (t / steps))
        applyBrushToMask(sliceMask, x, y)
      }
      lastPointRef.current = p
      onMaskChange(axis, sliceIndex, sliceMask)
    },
    [canvasToSlice, updateBrushPreview, isPanning, getSliceMaskCopy, applyBrushToMask, onMaskChange, axis, sliceIndex]
  )

  const handlePointerUp = useCallback((e?: React.PointerEvent) => {
    if (e?.currentTarget && e.pointerId != null) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
    isDrawingRef.current = false
    lastPointRef.current = null
    setIsPanning(false)
    panStartRef.current = null
  }, [])

  const handlePointerLeave = useCallback(() => {
    if (brushPreviewRef.current) brushPreviewRef.current.style.display = "none"
    handlePointerUp()
  }, [handlePointerUp])

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!interactive) return
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        setScale((s) => Math.max(0.25, Math.min(10, s + (e.deltaY > 0 ? -0.1 : 0.1))))
      } else {
        onSliceIndexChange(e.deltaY > 0 ? 1 : -1)
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
          "relative flex flex-1 min-h-0 overflow-auto rounded border bg-black items-center justify-center",
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

        {/* 브러시 미리보기: 항상 DOM에 존재, display 속성으로 가시성 제어 (React state 미사용) */}
        <div
          ref={brushPreviewRef}
          style={{
            display: "none",
            position: "absolute",
            border: "2px solid rgba(255, 0, 0, 0.9)",
            backgroundColor: "rgba(255, 0, 0, 0.15)",
            pointerEvents: "none",
            zIndex: 15,
            boxSizing: "border-box",
          }}
        />

        {axisLabels && (
          <>
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 text-white font-bold text-sm bg-black/60 px-2 py-0.5 rounded pointer-events-none"
              style={{ zIndex: 20 }}
            >
              {axisLabels.top}
            </div>
            <div
              className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white font-bold text-sm bg-black/60 px-2 py-0.5 rounded pointer-events-none"
              style={{ zIndex: 20 }}
            >
              {axisLabels.bottom}
            </div>
            <div
              className="absolute left-2 top-1/2 -translate-y-1/2 text-white font-bold text-sm bg-black/60 px-2 py-0.5 rounded pointer-events-none"
              style={{ zIndex: 20 }}
            >
              {axisLabels.left}
            </div>
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
})
