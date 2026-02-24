"use client"

import { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Inbox, ChevronRight } from "lucide-react"
import Link from "next/link"
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
    return s3Updates.filter(
      (row) =>
        isToday(row.upload_time ?? null) || isToday(row.created_at ?? null)
    )
  }, [s3Updates])

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
          {(user?.role === "admin" || user?.role === "staff") && (
            <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20 px-3 py-1">
              {user?.role === "admin" ? "관리자" : "Staff"}
            </Badge>
          )}
        </div>
      </div>

      {/* 새로 들어온 업무 (S3 업데이트 기준) */}
      <Card className="mb-8">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Inbox className="h-5 w-5 text-muted-foreground" />
            새로 들어온 업무
            <span className="text-sm font-normal text-muted-foreground">
              ({todayS3Updates.length}건)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayS3Updates.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              새로 들어온 S3 업무가 없습니다.
            </p>
          ) : (
            <ul className="space-y-2">
              {todayS3Updates.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() =>
                      row.task_id
                        ? router.push(`/admin/cases/${row.task_id}`)
                        : router.push(`/admin/cases/s3-update/${row.id}`)
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="inline-flex min-w-0 flex-1 items-center gap-2">
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500/80" aria-hidden />
                      <span className="truncate font-medium">
                        {row.file_name || "(파일명 없음)"}
                      </span>
                      {row.task_id ? (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          업무 연결됨
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0 text-xs">
                          미할당
                        </Badge>
                      )}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {todayS3Updates.length > 0 && (
            <Link
              href="/admin/cases?tab=worklist"
              className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              전체 업무 목록 보기
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </CardContent>
      </Card>

      <AdminCalendar />
    </div>
  )
}
