"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { S3UpdateRow } from "@/lib/types"

const PII_KEYS = new Set(["PatientName", "Patient Name", "PatientID", "PatientBirthDate", "Patient Birth Date"])

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return "-"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

function parseMetadata(raw: Record<string, unknown> | string | null | undefined) {
  if (raw == null) return null
  const obj = typeof raw === "string"
    ? (() => { try { return JSON.parse(raw) } catch { return null } })()
    : raw
  if (!obj || typeof obj !== "object") return null
  return obj as Record<string, unknown>
}

interface Props {
  row: S3UpdateRow
  toast: ReturnType<typeof useToast>["toast"]
}

export function S3InlineDetail({ row, toast }: Props) {
  const [downloading, setDownloading] = useState(false)

  const meta = parseMetadata(row.metadata)
  const summary = meta && typeof meta.summary === "string" && meta.summary.trim() ? meta.summary.trim() : null
  const metaEntries: [string, string][] = meta
    ? Object.entries(meta)
        .filter(([k]) => k !== "summary" && !PII_KEYS.has(k))
        .filter(([, v]) => v != null && String(v).trim() !== "")
        .map(([k, v]) => [k, Array.isArray(v) ? (v as number[]).join("×") : String(v)])
    : []

  const dateStr = (row.upload_time || row.created_at)
    ? new Date(row.upload_time || row.created_at).toLocaleString("ko-KR", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      })
    : "-"

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setDownloading(true)
    try {
      const res = await fetch(`/api/s3-updates/${row.id}/presigned-url`, { credentials: "include" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error || "다운로드 URL 생성 실패")
      }
      const { url } = await res.json() as { url: string }
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (e: unknown) {
      toast({ title: "다운로드 실패", description: e instanceof Error ? e.message : "오류가 발생했습니다.", variant: "destructive" })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      className="px-4 py-3 text-xs border-t border-dashed border-amber-500/20"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap gap-x-8 gap-y-1.5 items-start">
        {/* 기본 정보 */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 min-w-[200px]">
          {row.bucket_name && (
            <>
              <dt className="text-muted-foreground font-medium whitespace-nowrap">버킷/경로</dt>
              <dd className="break-all">{row.bucket_name}</dd>
            </>
          )}
          <dt className="text-muted-foreground font-medium whitespace-nowrap">S3 키</dt>
          <dd className="font-mono break-all text-[10px]">{row.s3_key}</dd>
          <dt className="text-muted-foreground font-medium whitespace-nowrap">크기</dt>
          <dd>{formatBytes(row.file_size)}</dd>
          <dt className="text-muted-foreground font-medium whitespace-nowrap">업로드 일시</dt>
          <dd>{dateStr}</dd>
        </dl>

        {/* 메타데이터 */}
        {(summary || metaEntries.length > 0) && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 min-w-[200px] flex-1">
            {summary && (
              <>
                <dt className="text-muted-foreground font-medium col-span-2">{summary}</dt>
              </>
            )}
            {metaEntries.map(([k, v]) => (
              <>
                <dt key={`k-${k}`} className="text-muted-foreground font-medium whitespace-nowrap">{k}</dt>
                <dd key={`v-${k}`} className="break-all">{v}</dd>
              </>
            ))}
          </dl>
        )}

        {/* 다운로드 */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          disabled={downloading}
          className="ml-auto self-start h-7 text-xs"
        >
          {downloading
            ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            : <Download className="mr-1.5 h-3 w-3" />}
          다운로드
        </Button>
      </div>
    </div>
  )
}
