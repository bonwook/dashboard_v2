"use client"

import { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Inbox, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { AdminCalendar } from "@/components/admin-calendar"
import type { S3UpdateRow } from "@/lib/types"

/** 오늘(KST) YYYY-MM-DD */
function getTodayKST(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

/** 날짜 문자열(ISO 등)을 KST 기준 날짜(YYYY-MM-DD)로 변환 */
function toKSTDateString(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

/** 해당 날짜가 오늘(KST)인지 */
function isToday(dateStr: string | null | undefined): boolean {
  const datePart = toKSTDateString(dateStr)
  return datePart !== null && datePart === getTodayKST()
}

export default function AdminOverviewPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [s3Updates, setS3Updates] = useState<S3UpdateRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadUser = async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" })
      if (res.ok) {
        const userData = await res.json()
        setUser(userData)
      }
    } catch (error) {
      console.error("사용자 로드 오류:", error)
    }
  }

  const loadS3Updates = async () => {
    try {
      const res = await fetch("/api/s3-updates", {
        credentials: "include",
        cache: "no-store",
      })
      if (res.ok) {
        const data = await res.json()
        setS3Updates(data.s3Updates || [])
        setLastUpdated(new Date())
      } else {
        setS3Updates([])
      }
    } catch (error) {
      console.error("S3 업데이트 목록 로드 오류:", error)
      setS3Updates([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUser()
    loadS3Updates()
  }, [])

  const todayS3Updates = useMemo(() => {
    const list = s3Updates.filter(
      (row) =>
        isToday(row.upload_time ?? null) || isToday(row.created_at ?? null)
    )
    return [...list].sort((a, b) => {
      const bucketA = (a.bucket_name ?? "").trim()
      const bucketB = (b.bucket_name ?? "").trim()
      if (bucketA !== bucketB) return bucketA.localeCompare(bucketB)
      return (a.file_name ?? "").localeCompare(b.file_name ?? "")
    })
  }, [s3Updates])

  /** 버킷별 그룹: [{ bucket, rows }], bucket 이름 순 */
  const todayByBucket = useMemo(() => {
    const map = new Map<string, S3UpdateRow[]>()
    for (const row of todayS3Updates) {
      const bucket = (row.bucket_name ?? "").trim() || "(버킷 없음)"
      if (!map.has(bucket)) map.set(bucket, [])
      map.get(bucket)!.push(row)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, rows]) => ({ bucket, rows }))
  }, [todayS3Updates])

  if (isLoading) {
    return (
      <div className="relative mx-auto max-w-7xl p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="relative mx-auto max-w-7xl p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">시스템 개요</h1>
          <p className="text-muted-foreground">
            {lastUpdated && (
              <span className="ml-0 text-xs">
                (최근 업데이트: {lastUpdated.toLocaleTimeString("ko-KR")})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === "staff" && (
            <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 px-3 py-1">
              Staff
            </Badge>
          )}
        </div>
      </div>

      {/* 새로 들어온 업무 (S3 업데이트 기준) */}
      <Card className="mb-8 min-h-[400px] flex flex-col">
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Inbox className="h-5 w-5 text-muted-foreground" />
            새로 들어온 업무
            <span className="text-sm font-normal text-muted-foreground">
              ({todayS3Updates.length}건)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 flex flex-col">
          {todayS3Updates.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              새로 들어온 S3 업무가 없습니다.
            </p>
          ) : (
            <div className="space-y-6">
              {todayByBucket.map(({ bucket, rows }) => (
                <div key={bucket} className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-primary/80" aria-hidden />
                    {bucket}
                    <span className="font-normal">({rows.length}건)</span>
                  </h3>
                  <ul className="flex flex-wrap gap-2 content-start">
                    {rows.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() =>
                            row.task_id
                              ? router.push(`/admin/cases/${row.task_id}`)
                              : router.push(`/admin/cases/s3-update/${row.id}`)
                          }
                          className="inline-flex w-fit max-w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50"
                        >
                          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500/80" aria-hidden />
                          <span className="truncate font-medium">
                            {row.file_name || "(파일명 없음)"}
                          </span>
                          {row.task_id ? (
                            <Badge variant="secondary" className="shrink-0 text-xs">
                              업무 연결됨
                            </Badge>
                          ) : null}
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AdminCalendar />
    </div>
  )
}
