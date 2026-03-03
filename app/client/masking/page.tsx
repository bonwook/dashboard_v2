"use client"

import { useState, useCallback, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import { NiiFileList, MaskingCanvas } from "@/components/masking"
import type { MaskingCanvasHandle } from "@/components/masking/MaskingCanvas"
import {
  parseNifti,
  getSliceLayout,
  setSliceIn3DMask,
  buildMaskNiftiBlob,
} from "@/components/masking/niftiLoader"
import type { NiiFileItem, NiftiHeaderLike } from "@/components/masking/types"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

function generateId() {
  return `nii-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** 파일 id별 마스크 캐시 (같은 파일 다시 선택 시 복원) */
const maskCache = new Map<string, Uint8Array>()

export default function ClientMaskingPage() {
  const [files, setFiles] = useState<NiiFileItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [header, setHeader] = useState<NiftiHeaderLike | null>(null)
  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null)
  const [rawData, setRawData] = useState<ArrayBuffer | null>(null)
  const [wasGzipped, setWasGzipped] = useState(false)
  const [downloadAsGzip, setDownloadAsGzip] = useState(true)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  // mask3D를 ref로 관리: 변경해도 React 리렌더 없음 → 브러시질 중 리렌더 0회
  const mask3DRef = useRef<Uint8Array | null>(null)
  // MaskingCanvas의 redrawMasks()를 직접 호출하기 위한 ref
  const maskingCanvasRef = useRef<MaskingCanvasHandle | null>(null)

  const loadFile = useCallback(
    async (file: File | string, options?: { existingId?: string }) => {
      setLoading(true)
      try {
        let data: ArrayBuffer
        let name: string
        if (file instanceof File) {
          data = await file.arrayBuffer()
          name = file.name
        } else {
          const res = await fetch(`/api/storage/download?path=${encodeURIComponent(file)}`, {
            credentials: "include",
          })
          if (!res.ok) throw new Error("다운로드 실패")
          data = await res.arrayBuffer()
          name = file.split("/").pop() ?? "file.nii"
        }

        const { header: h, imageBuffer: img, data: raw, wasGzipped: gz } = await parseNifti(data)
        const layout = getSliceLayout(h)
        const totalVoxels = layout.totalVoxels

        const existingId = options?.existingId
        let mask: Uint8Array
        if (existingId != null) {
          const cached = maskCache.get(existingId)
          if (cached && cached.length === totalVoxels) {
            mask = new Uint8Array(cached)
          } else {
            mask = new Uint8Array(totalVoxels)
          }
        } else {
          mask = new Uint8Array(totalVoxels)
        }

        // 상태 업데이트 전에 ref에 먼저 할당 → SlicePanel 리렌더 시 이미 새 마스크 참조
        mask3DRef.current = mask
        setHeader(h)
        setImageBuffer(img)
        setRawData(raw)
        setWasGzipped(gz)
        setDownloadAsGzip(gz)
        if (existingId != null) {
          setSelectedId(existingId)
          toast({ title: "선택됨", description: `${name}을(를) 표시합니다.` })
        } else {
          const id = generateId()
          setFiles((prev) => [
            ...prev,
            {
              id,
              name,
              source: file,
              completed: false,
              header: h,
            },
          ])
          setSelectedId(id)
          toast({ title: "로드 완료", description: `${name}을(를) 불러왔습니다.` })
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "파일 로드 실패"
        toast({ title: "로드 실패", description: msg, variant: "destructive" })
      } finally {
        setLoading(false)
      }
    },
    [toast]
  )

  const handleSelect = useCallback(
    (id: string) => {
      const item = files.find((f) => f.id === id)
      if (!item) return
      if (selectedId === id) return
      loadFile(item.source, { existingId: id })
    },
    [files, selectedId, loadFile]
  )

  const handleDelete = useCallback(
    (id: string) => {
      setFiles((prev) => prev.filter((f) => f.id !== id))
      if (selectedId === id) {
        setSelectedId(null)
        setHeader(null)
        setImageBuffer(null)
        setRawData(null)
        mask3DRef.current = null
      }
    },
    [selectedId]
  )

  const selectedFile = files.find((f) => f.id === selectedId)

  const handleMaskChange = useCallback(
    (axis: "axial" | "coronal" | "sagittal", sliceIndex: number, sliceMask: Uint8Array) => {
      if (!header || !mask3DRef.current) return
      // new Uint8Array 복사 없이 3D 마스크에 직접 뮤테이션
      setSliceIn3DMask(mask3DRef.current, header, axis, sliceIndex, sliceMask)
      if (selectedId) maskCache.set(selectedId, mask3DRef.current)
      // React 리렌더 없이 4개 패널 오버레이만 직접 갱신
      maskingCanvasRef.current?.redrawMasks()
    },
    [header, selectedId]
  )

  const handleCompleteRequest = useCallback(() => {
    if (!selectedId) return
    if (mask3DRef.current) maskCache.set(selectedId, mask3DRef.current)
    setFiles((prev) =>
      prev.map((f) => (f.id === selectedId ? { ...f, completed: true } : f))
    )
    toast({ title: "완료", description: "파일 블록이 완료 처리되었습니다." })
  }, [selectedId, toast])

  const handleDownloadRequest = useCallback(
    (phaseIndex?: number) => {
      if (!rawData || !header || !mask3DRef.current) {
        toast({ title: "다운로드 불가", description: "파일을 먼저 로드해 주세요.", variant: "destructive" })
        return
      }

      const mask3D = mask3DRef.current
      const totalVoxels = mask3D.length
      const maskedVoxels = mask3D.filter(v => v > 0).length
      const maskedPercentage = ((maskedVoxels / totalVoxels) * 100).toFixed(2)

      console.log(`마스크 다운로드 - 총 복셀: ${totalVoxels}, 마스킹된 복셀: ${maskedVoxels} (${maskedPercentage}%)`)

      const blob = buildMaskNiftiBlob(rawData, header, mask3D, {
        compressOutput: downloadAsGzip,
        phaseIndex: phaseIndex ?? 0,
      })
      const name = selectedFile?.name ?? "mask.nii"
      const base = name.replace(/\.nii(\.gz)?$/i, "_mask")
      const ext = downloadAsGzip ? ".nii.gz" : ".nii"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = base + ext
      a.click()
      URL.revokeObjectURL(url)
      toast({
        title: "마스크 다운로드",
        description: `마스크 파일 저장 완료 (${maskedVoxels}개 복셀, ${maskedPercentage}%)`,
      })
    },
    [rawData, header, downloadAsGzip, selectedFile?.name, toast]
  )

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* 좌측: .nii / .nii.gz 파일 리스트 */}
        <aside className="flex w-56 shrink-0 flex-col border-r bg-card">
          <div className="flex items-center justify-between border-b p-3">
            <span className="text-sm font-medium">.nii / .nii.gz</span>
            <input
              id="masking-nii-upload"
              type="file"
              accept=".nii,.nii.gz,.nifti,application/gzip"
              className="hidden"
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) loadFile(f)
                e.target.value = ""
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => document.getElementById("masking-nii-upload")?.click()}
              disabled={loading}
            >
              <Upload className="mr-1 h-4 w-4" />
              로드
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-2">
            <NiiFileList
              files={files}
              selectedId={selectedId}
              onSelect={handleSelect}
              onDelete={handleDelete}
            />
          </div>
        </aside>
        {/* 우측: 마스킹 캔버스 */}
        <main className="flex flex-1 flex-col overflow-hidden bg-background p-1">
          <div className="mb-1 flex items-center gap-2.5 px-1">
            <Checkbox
              id="download-as-gzip"
              checked={downloadAsGzip}
              onCheckedChange={(v) => setDownloadAsGzip(v === true)}
              className="h-5 w-5"
            />
            <Label htmlFor="download-as-gzip" className="text-sm font-normal cursor-pointer">
              다운로드 시 .nii.gz로 압축 (해제 시 .nii)
            </Label>
          </div>
          <MaskingCanvas
            ref={maskingCanvasRef}
            header={header}
            imageBuffer={imageBuffer}
            mask3DRef={mask3DRef}
            onMaskChange={handleMaskChange}
            onCompleteRequest={handleCompleteRequest}
            onDownloadRequest={handleDownloadRequest}
          />
        </main>
      </div>
    </div>
  )
}
