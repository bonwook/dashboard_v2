"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export interface S3BucketInfoCardProps {
  /** s3_updates 행 기반 (id 있으면 presigned 다운로드 버튼 표시) */
  s3Update: {
    id: number
    file_name: string
    bucket_name?: string | null
    file_size?: number | null
    upload_time?: string | null
    created_at: string
    s3_key: string
  }
  /** 컴팩트 레이아웃 (다이얼로그/블록용) */
  compact?: boolean
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return "-"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function S3BucketInfoCard({ s3Update, compact = false }: S3BucketInfoCardProps) {
  const [isGettingUrl, setIsGettingUrl] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [downloadExpiresAt, setDownloadExpiresAt] = useState<number | null>(null)
  const { toast } = useToast()

  const displayDate = s3Update.upload_time || s3Update.created_at || ""
  const isDownloadExpired = downloadExpiresAt != null && Date.now() > downloadExpiresAt

  const handleDownload = async () => {
    if (downloadUrl && !isDownloadExpired) {
      window.open(downloadUrl, "_blank", "noopener,noreferrer")
      return
    }
    setIsGettingUrl(true)
    try {
      const res = await fetch(`/api/s3-updates/${s3Update.id}/presigned-url`, {
        credentials: "include",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || "다운로드 URL 생성 실패")
      }
      const data = (await res.json()) as { url: string; expiresIn: number; fileName?: string }
      setDownloadUrl(data.url)
      setDownloadExpiresAt(Date.now() + data.expiresIn * 1000)
      window.open(data.url, "_blank", "noopener,noreferrer")
      toast({
        title: "다운로드 링크 생성됨",
        description: "24시간 유효한 링크가 새 탭에서 열립니다.",
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "다운로드 URL을 가져오지 못했습니다."
      toast({
        title: "다운로드 실패",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsGettingUrl(false)
    }
  }

  const dateStr = displayDate
    ? new Date(displayDate).toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        ...(compact ? {} : { year: "numeric" }),
      })
    : "-"

  if (compact) {
    return (
      <Card className="mb-3">
        <CardHeader className="py-2 px-4 space-y-0">
          <div className="flex flex-row items-center gap-2 flex-wrap">
            <CardTitle className="text-base">버킷 정보</CardTitle>
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={isGettingUrl}>
              {isGettingUrl ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Download className="mr-2 h-3 w-3" />}
              {isDownloadExpired ? "새 링크 발급" : "다운로드"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {isDownloadExpired ? "만료됨" : "24시간 유효"}
            </span>
          </div>
          <div className="flex flex-row flex-wrap items-baseline gap-x-4 gap-y-1 text-xs mt-1.5">
            <span className="font-medium break-all">{s3Update.file_name}</span>
            {s3Update.bucket_name && (
              <span className="break-all text-muted-foreground">{s3Update.bucket_name}</span>
            )}
            <span className="break-all text-muted-foreground truncate max-w-[180px]" title={s3Update.s3_key}>
              {s3Update.s3_key}
            </span>
            <span>{formatBytes(s3Update.file_size)}</span>
            <span>{dateStr}</span>
          </div>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="mb-4">
      <CardHeader className="py-2 px-4 space-y-0">
        <div className="flex flex-row items-center gap-3 flex-wrap">
          <CardTitle className="text-xl">버킷 정보</CardTitle>
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={isGettingUrl}>
            {isGettingUrl ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {isDownloadExpired ? "새 링크 발급" : "다운로드 (24시간 유효 링크)"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {isDownloadExpired ? "만료됨 — 다시 클릭하여 새 링크를 발급받으세요." : "※ 링크는 24시간 후 만료됩니다."}
          </span>
        </div>
        <div className="flex flex-row flex-wrap items-baseline gap-x-6 gap-y-1 text-sm mt-1.5">
          <span>
            <span className="text-xs font-medium text-muted-foreground">파일명</span>{" "}
            <span className="font-medium break-all">{s3Update.file_name}</span>
          </span>
          {s3Update.bucket_name && (
            <span>
              <span className="text-xs font-medium text-muted-foreground">버킷/경로</span>{" "}
              <span className="break-all text-muted-foreground">{s3Update.bucket_name}</span>
            </span>
          )}
          <span className="min-w-0">
            <span className="text-xs font-medium text-muted-foreground">S3 객체 키</span>{" "}
            <span
              className="break-all text-muted-foreground truncate max-w-[200px] sm:max-w-none inline-block align-bottom"
              title={s3Update.s3_key}
            >
              {s3Update.s3_key}
            </span>
          </span>
          <span>
            <span className="text-xs font-medium text-muted-foreground">파일 크기</span>{" "}
            <span>{formatBytes(s3Update.file_size)}</span>
          </span>
          <span>
            <span className="text-xs font-medium text-muted-foreground">업로드일</span> <span>{dateStr}</span>
          </span>
        </div>
      </CardHeader>
    </Card>
  )
}
