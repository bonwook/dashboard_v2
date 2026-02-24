"use client"

import { useEffect, useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Paintbrush, Eraser, ZoomIn, ZoomOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { getSliceLayout, getSliceRange, getVolumeMinMax } from "./niftiLoader"
import type { NiftiHeaderLike, SliceAxis } from "./types"
import { SlicePanel } from "./SlicePanel"

type Tool = "brush" | "eraser"

interface MaskingCanvasProps {
  header: NiftiHeaderLike | null
  imageBuffer: ArrayBuffer | null
  mask3D: Uint8Array | null
  onMaskChange: (axis: SliceAxis, sliceIndex: number, mask: Uint8Array) => void
  onCompleteRequest: () => void
  onDownloadRequest: (phaseIndex?: number) => void
  className?: string
}

type PanelIndex = 0 | 1 | 2 | 3
const AXES: SliceAxis[] = ["axial", "sagittal", "coronal"]

const AXIS_LABELS: Record<SliceAxis, { top: string; bottom: string; left: string; right: string }> = {
  axial: { top: "S", bottom: "I", left: "R", right: "L" },
  sagittal: { top: "S", bottom: "I", left: "A", right: "P" },
  coronal: { top: "A", bottom: "P", left: "R", right: "L" },
}

export function MaskingCanvas({
  header,
  imageBuffer,
  mask3D,
  onMaskChange,
  onCompleteRequest,
  onDownloadRequest,
  className,
}: MaskingCanvasProps) {
  const [axialIndex, setAxialIndex] = useState(0)
  const [sagittalIndex, setSagittalIndex] = useState(0)
  const [coronalIndex, setCoronalIndex] = useState(0)
  const [activeAxis, setActiveAxis] = useState<SliceAxis>("axial")
  const [focusedPanel, setFocusedPanel] = useState<PanelIndex>(0)

  const [tool, setTool] = useState<Tool>("brush")
  const [brushSize, setBrushSize] = useState(8)
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(0)
  const [globalZoom, setGlobalZoom] = useState(1)
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [minMax, setMinMax] = useState<{ min: number; max: number }>({ min: 0, max: 255 })

  const layout = header ? getSliceLayout(header) : null
  const nPhase = layout?.nPhase ?? 1

  useEffect(() => {
    if (!header || !imageBuffer) return
    const { min, max } = getVolumeMinMax(header, imageBuffer, phaseIndex)
    setMinMax({ min, max })
  }, [header, imageBuffer, phaseIndex])

  const sliceRange = (axis: SliceAxis) => (header ? getSliceRange(header, axis) : { min: 0, max: 0 })

  const getSliceIndex = useCallback(
    (axis: SliceAxis): number => {
      if (axis === "axial") return axialIndex
      if (axis === "sagittal") return sagittalIndex
      return coronalIndex
    },
    [axialIndex, sagittalIndex, coronalIndex]
  )

  useEffect(() => {
    if (!header) return
    const rAx = getSliceRange(header, "axial")
    const rSag = getSliceRange(header, "sagittal")
    const rCor = getSliceRange(header, "coronal")
    setAxialIndex((i) => Math.max(rAx.min, Math.min(rAx.max, i)))
    setSagittalIndex((i) => Math.max(rSag.min, Math.min(rSag.max, i)))
    setCoronalIndex((i) => Math.max(rCor.min, Math.min(rCor.max, i)))
  }, [header])

  useEffect(() => {
    if (phaseIndex >= nPhase) setPhaseIndex(Math.max(0, nPhase - 1))
  }, [nPhase, phaseIndex])

  const handleFocusPanel = useCallback(
    (panel: PanelIndex) => {
      setFocusedPanel(panel)
      if (panel <= 2) setActiveAxis(AXES[panel])
    },
    []
  )

  const handleSliceDelta = useCallback(
    (panel: PanelIndex, delta: number) => {
      if (!header) return
      if (panel === 0) {
        const r = getSliceRange(header, "axial")
        setAxialIndex((i) => Math.max(r.min, Math.min(r.max, i + delta)))
      } else if (panel === 1) {
        const r = getSliceRange(header, "sagittal")
        setSagittalIndex((i) => Math.max(r.min, Math.min(r.max, i + delta)))
      } else if (panel === 2) {
        const r = getSliceRange(header, "coronal")
        setCoronalIndex((i) => Math.max(r.min, Math.min(r.max, i + delta)))
      } else {
        const r = getSliceRange(header, activeAxis)
        const setter =
          activeAxis === "axial"
            ? setAxialIndex
            : activeAxis === "sagittal"
              ? setSagittalIndex
              : setCoronalIndex
        setter((i) => Math.max(r.min, Math.min(r.max, i + delta)))
      }
    },
    [header, activeAxis]
  )

  if (!header || !imageBuffer) {
    return (
      <div
        className={cn(
          "flex flex-1 items-center justify-center rounded-lg border border-dashed bg-muted/30 text-muted-foreground",
          className
        )}
      >
        <p>.nii / .nii.gz 파일을 선택하면 여기에 슬라이스가 표시됩니다</p>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-1 flex-col gap-3", className)}>
      {/* 툴바: 기존과 동일 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-1">
          <Button
            type="button"
            variant={tool === "brush" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTool("brush")}
          >
            <Paintbrush className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={tool === "eraser" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTool("eraser")}
          >
            <Eraser className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">브러시: {brushSize}px</Label>
          <Slider
            value={[brushSize]}
            onValueChange={([v]) => setBrushSize(v)}
            min={1}
            max={40}
            step={1}
            className="w-24"
          />
        </div>
        <div className="flex items-center gap-1">
          <ZoomOut
            className="h-4 w-4 cursor-pointer shrink-0"
            onClick={() => setGlobalZoom((z) => Math.max(0.25, Math.min(4, z - 0.25)))}
          />
          <ZoomIn
            className="h-4 w-4 cursor-pointer shrink-0"
            onClick={() => setGlobalZoom((z) => Math.max(0.25, Math.min(4, z + 0.25)))}
          />
          <span className="text-xs text-muted-foreground w-10">{Math.round(globalZoom * 100)}%</span>
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="sm" onClick={onCompleteRequest}>
            완료
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onDownloadRequest(phaseIndex)}>
            다운로드
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs">밝기</Label>
        <Slider
          value={[brightness]}
          onValueChange={([v]) => setBrightness(v)}
          min={-100}
          max={100}
          className="w-32"
        />
        <Label className="text-xs">대비</Label>
        <Slider
          value={[contrast]}
          onValueChange={([v]) => setContrast(v)}
          min={-100}
          max={100}
          className="w-32"
        />
        {nPhase > 1 && (
          <>
            <span className="text-xs text-muted-foreground">Phase</span>
            <span className="text-xs w-16">
              {phaseIndex + 1} / {nPhase}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPhaseIndex((p) => Math.max(0, p - 1))}
            >
              −
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPhaseIndex((p) => Math.min(nPhase - 1, p + 1))}
            >
              +
            </Button>
          </>
        )}
      </div>

      {/* ITK-SNAP 스타일 4분할 뷰 (2x2), AP/FH/RL 방향 레이블 + 십자선 */}
      <div className="grid grid-cols-2 grid-rows-2 gap-2 flex-1 min-h-0">
        <div className="flex flex-col min-h-0">
          <span className="text-xs text-muted-foreground px-1 py-0.5">Axial</span>
          <SlicePanel
            header={header}
            imageBuffer={imageBuffer}
            mask3D={mask3D}
            axis="axial"
            sliceIndex={axialIndex}
            sliceRange={sliceRange("axial")}
            minMax={minMax}
            brightness={brightness}
            contrast={contrast}
            tool={tool}
            brushSize={brushSize}
            interactive
            focused={focusedPanel === 0}
            onFocus={() => handleFocusPanel(0)}
            onSliceIndexChange={(d) => handleSliceDelta(0, d)}
            onMaskChange={onMaskChange}
            scaleMultiplier={globalZoom}
            axisLabels={AXIS_LABELS.axial}
            crosshair={{ x: sagittalIndex, y: coronalIndex }}
            sliceLabel={`${axialIndex + 1} of ${sliceRange("axial").max + 1}`}
            phaseIndex={phaseIndex}
            className="flex-1"
          />
        </div>
        <div className="flex flex-col min-h-0">
          <span className="text-xs text-muted-foreground px-1 py-0.5">Sagittal</span>
          <SlicePanel
            header={header}
            imageBuffer={imageBuffer}
            mask3D={mask3D}
            axis="sagittal"
            sliceIndex={sagittalIndex}
            sliceRange={sliceRange("sagittal")}
            minMax={minMax}
            brightness={brightness}
            contrast={contrast}
            tool={tool}
            brushSize={brushSize}
            interactive
            focused={focusedPanel === 1}
            onFocus={() => handleFocusPanel(1)}
            onSliceIndexChange={(d) => handleSliceDelta(1, d)}
            onMaskChange={onMaskChange}
            scaleMultiplier={globalZoom}
            axisLabels={AXIS_LABELS.sagittal}
            crosshair={{ x: coronalIndex, y: axialIndex }}
            sliceLabel={`${sagittalIndex + 1} of ${sliceRange("sagittal").max + 1}`}
            phaseIndex={phaseIndex}
            className="flex-1"
          />
        </div>
        <div className="flex flex-col min-h-0">
          <span className="text-xs text-muted-foreground px-1 py-0.5">Coronal</span>
          <SlicePanel
            header={header}
            imageBuffer={imageBuffer}
            mask3D={mask3D}
            axis="coronal"
            sliceIndex={coronalIndex}
            sliceRange={sliceRange("coronal")}
            minMax={minMax}
            brightness={brightness}
            contrast={contrast}
            tool={tool}
            brushSize={brushSize}
            interactive
            focused={focusedPanel === 2}
            onFocus={() => handleFocusPanel(2)}
            onSliceIndexChange={(d) => handleSliceDelta(2, d)}
            onMaskChange={onMaskChange}
            scaleMultiplier={globalZoom}
            axisLabels={AXIS_LABELS.coronal}
            crosshair={{ x: sagittalIndex, y: axialIndex }}
            sliceLabel={`${coronalIndex + 1} of ${sliceRange("coronal").max + 1}`}
            phaseIndex={phaseIndex}
            className="flex-1"
          />
        </div>
        <div className="flex flex-col min-h-0">
          <span className="text-xs text-muted-foreground px-1 py-0.5">
            {activeAxis === "axial" ? "Axial" : activeAxis === "sagittal" ? "Sagittal" : "Coronal"} (활성)
          </span>
          <SlicePanel
            header={header}
            imageBuffer={imageBuffer}
            mask3D={mask3D}
            axis={activeAxis}
            sliceIndex={getSliceIndex(activeAxis)}
            sliceRange={sliceRange(activeAxis)}
            minMax={minMax}
            brightness={brightness}
            contrast={contrast}
            tool={tool}
            brushSize={brushSize}
            interactive
            focused={focusedPanel === 3}
            onFocus={() => handleFocusPanel(3)}
            onSliceIndexChange={(d) => handleSliceDelta(3, d)}
            onMaskChange={onMaskChange}
            scaleMultiplier={globalZoom}
            axisLabels={AXIS_LABELS[activeAxis]}
            crosshair={
              activeAxis === "axial"
                ? { x: sagittalIndex, y: coronalIndex }
                : activeAxis === "sagittal"
                  ? { x: coronalIndex, y: axialIndex }
                  : { x: sagittalIndex, y: axialIndex }
            }
            sliceLabel={`${getSliceIndex(activeAxis) + 1} of ${sliceRange(activeAxis).max + 1}`}
            phaseIndex={phaseIndex}
            className="flex-1"
          />
        </div>
      </div>
    </div>
  )
}
