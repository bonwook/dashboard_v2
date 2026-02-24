"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { FileText, FileSpreadsheet, Loader2, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface ReportTask {
  id: string
  patient_name: string
  priority?: string
  created_at: string
  completed_at: string | null
  assigned_by_name?: string
  assigned_to_name?: string
}

export default function ReportsPage() {
  const [tasks, setTasks] = useState<ReportTask[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch("/api/reports", { credentials: "include", cache: "no-store" })
      if (!res.ok || cancelled) return
      const data = await res.json()
      if (!cancelled && Array.isArray(data.reports)) {
        setTasks(
          data.reports.map((r: any) => ({
            id: r.id,
            patient_name: r.patient_name ?? r.title ?? "제목 없음",
            priority: r.priority,
            created_at: r.created_at,
            completed_at: r.completed_at,
            assigned_by_name: r.assigned_by_name,
            assigned_to_name: r.assigned_to_name,
          }))
        )
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            의료 리포트
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            완료된 업무를 선택해 리포트 폼을 작성·저장하고, 엑셀 탭에서 확인할 수 있습니다.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/reports/aggregation">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            통계
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>완료된 업무 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              불러오는 중…
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              완료된 업무가 없습니다.
            </p>
          ) : (
            <ul className="space-y-3">
              {tasks.map((t) => (
                <li key={t.id} className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
                  <Link
                    href={`/admin/reports/${t.id}`}
                    className="flex items-center justify-between py-3 px-3 hover:bg-muted/60 transition-colors block"
                  >
                    <div>
                      <p className="font-medium">{t.patient_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.completed_at
                          ? `완료: ${new Date(t.completed_at).toLocaleDateString("ko-KR")}`
                          : `생성: ${new Date(t.created_at).toLocaleDateString("ko-KR")}`}
                        {t.assigned_to_name && ` · ${t.assigned_to_name}`}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
