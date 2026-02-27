"use client"

import { useState, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import { NiiFileList, MaskingCanvas } from "@/components/masking"
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
  const [mask3D, setMask3D] = useState<Uint8Array | null>(null)
  /** 원본이 .nii.gz였는지 (다운로드 기본값에 사용) */
  const [wasGzipped, setWasGzipped] = useState(false)
  /** 다운로드 시 .nii.gz로 압축할지 (기본: 원본이 gz면 true) */
  const [downloadAsGzip, setDownloadAsGzip] = useState(true)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

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
        setHeader(h)
        setImageBuffer(img)
        setRawData(raw)
        setMask3D(mask)
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
    [toast, header, imageBuffer, selectedId]
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
        setMask3D(null)
      }
    },
    [selectedId]
  )

  const selectedFile = files.find((f) => f.id === selectedId)

  const handleMaskChange = useCallback(
    (axis: "axial" | "coronal" | "sagittal", sliceIndex: number, mask: Uint8Array) => {
      if (!header) return
      const layout = getSliceLayout(header)
      const totalVoxels = layout.totalVoxels
      const nextMask =
        mask3D && mask3D.length === totalVoxels
          ? new Uint8Array(mask3D)
          : new Uint8Array(totalVoxels)
      setSliceIn3DMask(nextMask, header, axis, sliceIndex, mask)
      setMask3D(nextMask)
      if (selectedId) maskCache.set(selectedId, nextMask)
    },
    [header, mask3D, selectedId]
  )

  const handleCompleteRequest = useCallback(() => {
    if (!selectedId) return
    if (mask3D) maskCache.set(selectedId, mask3D)
    setFiles((prev) =>
      prev.map((f) => (f.id === selectedId ? { ...f, completed: true } : f))
    )
    toast({ title: "완료", description: "파일 블록이 완료 처리되었습니다." })
  }, [selectedId, mask3D, toast])

  const handleDownloadRequest = useCallback(
    (phaseIndex?: number) => {
      if (!rawData || !header || !mask3D) {
        toast({ title: "다운로드 불가", description: "파일을 먼저 로드해 주세요.", variant: "destructive" })
        return
      }
      
      // 마스크 통계 계산
      const totalVoxels = mask3D.length
      const maskedVoxels = mask3D.filter(v => v > 0).length
      const maskedPercentage = ((maskedVoxels / totalVoxels) * 100).toFixed(2)
      
      console.log(`마스크 다운로드 - 총 복셀: ${totalVoxels}, 마스킹된 복셀: ${maskedVoxels} (${maskedPercentage}%)`)
      
      // 마스크 전용 파일 생성 (0과 255만 포함)
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
        description: `마스크 파일 저장 완료 (${maskedVoxels}개 복셀, ${maskedPercentage}%)` 
      })
    },
    [rawData, header, mask3D, downloadAsGzip, selectedFile?.name, toast]
  )

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* 좌측: .nii / .nii.gz 파일 리스트 (File Explorer 형태) */}
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
            header={header}
            imageBuffer={imageBuffer}
            mask3D={mask3D}
            onMaskChange={handleMaskChange}
            onCompleteRequest={handleCompleteRequest}
            onDownloadRequest={handleDownloadRequest}
          />
        </main>
      </div>
    </div>
  )
}
