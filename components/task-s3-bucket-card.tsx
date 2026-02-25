"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { S3UpdateForTask } from "@/lib/types"

const PII_KEYS = ["Patient Name", "PatientID", "PatientName", "Patient Birth Date"]

function formatMetadata(metadata: Record<string, unknown> | string | null | undefined): { summary?: string; entries: [string, string][] } {
  if (metadata == null) return { entries: [] }
  const obj = typeof metadata === "string" ? (() => { try { return JSON.parse(metadata) } catch { return null } })() : metadata
  if (!obj || typeof obj !== "object") return { entries: [] }
  const rec = obj as Record<string, unknown>
  const summary = typeof rec.summary === "string" && rec.summary.trim() ? rec.summary.trim() : undefined
  const entries: [string, string][] = Object.entries(rec)
    .filter(([k]) => k !== "summary" && !PII_KEYS.includes(k) && rec[k] != null && String(rec[k]).trim() !== "")
    .map(([k, v]) => [k, Array.isArray(v) ? (v as number[]).join("×") : String(v)])
  return { summary, entries }
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return "-"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

interface TaskS3BucketCardProps {
  taskTitle: string
  s3Updates: S3UpdateForTask[]
}

export function TaskS3BucketCard({ s3Updates }: TaskS3BucketCardProps) {
  const { toast } = useToast()
  const [loadingId, setLoadingId] = useState<number | null>(null)
  const [urlCache, setUrlCache] = useState<Record<number, { url: string; expiresAt: number }>>({})

  if (s3Updates.length === 0) return null

  // 메타데이터는 첫 번째 항목에서 한 번만 추출
  const { summary, entries } = formatMetadata(s3Updates[0].metadata)
  const hasMetadata = !!summary || entries.length > 0

  const handleDownload = async (s3Id: number) => {
    const cached = urlCache[s3Id]
    if (cached && Date.now() < cached.expiresAt) {
      window.open(cached.url, "_blank", "noopener,noreferrer")
      return
    }
    setLoadingId(s3Id)
    try {
      const res = await fetch(`/api/s3-updates/${s3Id}/presigned-url`, { credentials: "include" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || "다운로드 URL 생성 실패")
      }
      const data = (await res.json()) as { url: string; expiresIn: number }
      setUrlCache((prev) => ({
        ...prev,
        [s3Id]: { url: data.url, expiresAt: Date.now() + data.expiresIn * 1000 },
      }))
      window.open(data.url, "_blank", "noopener,noreferrer")
      toast({ title: "다운로드 링크 생성됨", description: "새 탭에서 열립니다." })
    } catch (e: unknown) {
      toast({
        title: "다운로드 실패",
        description: e instanceof Error ? e.message : "URL을 가져오지 못했습니다.",
        variant: "destructive",
      })
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-xl">버킷 정보</CardTitle>
        {hasMetadata && (
          <div className="text-sm text-muted-foreground mt-2 space-y-1">
            {summary && <p>{summary}</p>}
            {entries.length > 0 && (
              <dl className="flex flex-wrap gap-x-5 gap-y-0.5">
                {entries.map(([key, val], i) => (
                  <span key={i} className="flex gap-1 items-baseline">
                    <dt className="font-medium text-foreground/60 shrink-0">{key}:</dt>
                    <dd className="truncate max-w-[220px]" title={val}>{val}</dd>
                  </span>
                ))}
              </dl>
            )}
          </div>
        )}
      </CardHeader>
      <div className="px-6 pb-6 pt-0 space-y-1.5">
        {s3Updates.map((u) => {
          const displayDate = u.upload_time || u.created_at
          const dateStr = displayDate
            ? new Date(displayDate).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })
            : ""
          const sizeStr = formatBytes(u.file_size)
          return (
            <div key={u.id} className="flex items-center gap-3 text-base">
              <button
                onClick={() => handleDownload(u.id)}
                disabled={loadingId === u.id}
                className="flex items-center gap-1.5 text-blue-600 hover:underline disabled:opacity-50 cursor-pointer min-w-0 shrink"
              >
                {loadingId === u.id && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
                <span className="truncate" title={u.file_name}>{u.file_name}</span>
              </button>
              {(sizeStr !== "-" || dateStr) && (
                <span className="text-sm text-muted-foreground whitespace-nowrap shrink-0">
                  {[sizeStr !== "-" ? sizeStr : null, dateStr].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
