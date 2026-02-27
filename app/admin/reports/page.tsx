"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { FileText, FileSpreadsheet, Loader2, ChevronRight, FileDown, ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getFieldLabelById, getAllFieldIds } from "./reportFormFields"
import { useToast } from "@/hooks/use-toast"
import { downloadCSV } from "./utils/exportFile"

interface ReportTask {
  id: string
  patient_name: string
  priority?: string
  created_at: string
  completed_at: string | null
  assigned_by_name?: string
  assigned_to_name?: string
}

interface ReportRow {
  id: string
  task_id: string
  case_id: string
  task_title?: string
  completed_at: string | null
  form_data: Record<string, string | number | undefined>
}

const SYSTEM_COLUMNS = [
  { id: "task_id", label: "Task ID" },
  { id: "case_id", label: "그룹 ID (case_id)" },
  { id: "task_title", label: "업무 제목" },
  { id: "completed_at", label: "완료일" },
] as const

function getAllColumnIds(): string[] {
  return [...SYSTEM_COLUMNS.map((c) => c.id), ...getAllFieldIds()]
}

function getColumnLabel(colId: string): string {
  const sys = SYSTEM_COLUMNS.find((c) => c.id === colId)
  if (sys) return sys.label
  return getFieldLabelById(colId)
}

export default function ReportsPage() {
  const { toast } = useToast()
  const [showPending, setShowPending] = useState(false)
  
  // 통계 데이터
  const [statsRows, setStatsRows] = useState<ReportRow[]>([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [filterBy, setFilterBy] = useState<Record<string, string>>({})
  
  // 미작성 태스크 데이터
  const [pendingTasks, setPendingTasks] = useState<ReportTask[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)

  // 통계 데이터 및 미작성 태스크 개수 로드
  useEffect(() => {
    let cancelled = false
    async function loadStats() {
      const res = await fetch("/api/reports/info", { credentials: "include" })
      if (!res.ok || cancelled) return
      const data = await res.json()
      if (!cancelled && Array.isArray(data.rows)) {
        setStatsRows(
          data.rows.map((r: any) => ({
            id: r.id,
            task_id: r.task_id,
            case_id: r.case_id ?? r.task_id,
            task_title: r.task_title,
            completed_at: r.completed_at ?? null,
            form_data: r.form_data || {},
          }))
        )
      }
      setStatsLoading(false)
    }
    
    async function loadPendingCount() {
      try {
        const res = await fetch("/api/reports/pending", { credentials: "include", cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data.tasks)) {
          setPendingTasks(
            data.tasks.map((r: any) => ({
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
      } catch {
        // 개수 로드 실패해도 무시
      }
    }
    
    loadStats()
    loadPendingCount()
    return () => { cancelled = true }
  }, [])

  // 미작성 태스크 로드 (버튼 클릭 시)
  const loadPendingTasks = async () => {
    setPendingLoading(true)
    try {
      const res = await fetch("/api/reports/pending", { credentials: "include", cache: "no-store" })
      if (!res.ok) throw new Error("Failed to load pending tasks")
      const data = await res.json()
      if (Array.isArray(data.tasks)) {
        setPendingTasks(
          data.tasks.map((r: any) => ({
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
    } catch (e) {
      toast({
        title: "로드 실패",
        description: "미작성 태스크를 불러오지 못했습니다.",
        variant: "destructive",
      })
    } finally {
      setPendingLoading(false)
    }
  }

  // 리포트 작성 화면으로 전환 시 데이터 새로고침 (이미 로드된 경우 스킵)
  useEffect(() => {
    if (showPending && pendingTasks.length === 0 && !pendingLoading) {
      loadPendingTasks()
    }
  }, [showPending])

  const columnIds = useMemo(() => getAllColumnIds(), [])

  const filteredRows = useMemo(() => {
    let list = statsRows
    for (const [colId, q] of Object.entries(filterBy)) {
      if (!q?.trim()) continue
      const lower = q.toLowerCase().trim()
      list = list.filter((row) => {
        let val: string
        if (colId === "task_id") val = row.task_id ?? ""
        else if (colId === "case_id") val = row.case_id ?? ""
        else if (colId === "task_title") val = (row.task_title ?? "") as string
        else if (colId === "completed_at")
          val = row.completed_at ? new Date(row.completed_at).toLocaleDateString("ko-KR") : ""
        else val = String(row.form_data?.[colId] ?? "")
        return val.toLowerCase().includes(lower)
      })
    }
    return list
  }, [statsRows, filterBy])

  const setFilter = (colId: string, value: string) => {
    setFilterBy((prev) => {
      const next = { ...prev }
      if (value.trim()) next[colId] = value
      else delete next[colId]
      return next
    })
  }

  const handleExportCSV = () => {
    const headers = columnIds.map(getColumnLabel)
    const dataRows = filteredRows.map((row) => {
      return columnIds.map((colId) => {
        if (colId === "task_id") return row.task_id ?? ""
        if (colId === "case_id") return row.case_id ?? ""
        if (colId === "task_title") return String(row.task_title ?? "")
        if (colId === "completed_at")
          return row.completed_at ? new Date(row.completed_at).toLocaleDateString("ko-KR") : ""
        return String(row.form_data?.[colId] ?? "")
      })
    })
    downloadCSV(headers, dataRows, `report_aggregation_${new Date().toISOString().slice(0, 10)}.csv`)
    toast({ title: "다운로드 완료", description: "CSV 파일이 저장되었습니다." })
  }

  return (
    <div className="mx-auto max-w-full p-6 flex flex-col min-h-[calc(100vh-5rem)]">
      <div className="shrink-0 mb-6 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            의료 리포트
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
          </p>
        </div>
        {!showPending && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPending(true)}
            >
              <ClipboardList className="mr-2 h-4 w-4" />
              리포트 작성
              {pendingTasks.length > 0 && (
                <span className="ml-2 bg-amber-500 text-white rounded-full px-2 py-0.5 text-xs font-medium">
                  {pendingTasks.length}
                </span>
              )}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportCSV} 
              disabled={statsLoading}
              className="border-green-600 text-green-600 hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-950"
            >
              <FileDown className="h-4 w-4 mr-2" />
              CSV 내보내기
            </Button>
          </div>
        )}
        {showPending && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPending(false)}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            돌아가기
          </Button>
        )}
      </div>

      {!showPending ? (
        <>
          <p className="shrink-0 text-muted-foreground text-sm mb-3">
            리포트 폼을 작성한 태스크들의 누적 데이터입니다. 컬럼별 필터로 원하는 행만 조회할 수 있습니다.
          </p>

          {statsLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              불러오는 중…
            </div>
          ) : (
            <>
              <div className="border rounded-md overflow-hidden bg-card flex-1 min-h-0 flex flex-col">
                <div className="overflow-auto flex-1 min-h-0">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                      <tr>
                        <th className="text-left p-2 border-b font-medium whitespace-nowrap w-8">#</th>
                        {columnIds.map((colId) => (
                          <th key={colId} className="text-left p-1 border-b font-medium whitespace-nowrap min-w-[120px]">
                            <div className="font-medium truncate max-w-[180px]" title={getColumnLabel(colId)}>
                              {getColumnLabel(colId)}
                            </div>
                            <Input
                              placeholder="필터..."
                              className="mt-1 h-7 text-xs"
                              value={filterBy[colId] ?? ""}
                              onChange={(e) => setFilter(colId, e.target.value)}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={columnIds.length + 1} className="p-8 text-center text-muted-foreground">
                            {statsRows.length === 0 ? "저장된 리포트가 없습니다." : "필터 조건에 맞는 행이 없습니다."}
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row, idx) => (
                          <tr key={row.id} className="border-b hover:bg-muted/50">
                            <td className="p-2 whitespace-nowrap text-muted-foreground">{idx + 1}</td>
                            {columnIds.map((colId) => {
                              let val: string
                              if (colId === "task_id") val = row.task_id ?? ""
                              else if (colId === "case_id") val = row.case_id ?? ""
                              else if (colId === "task_title") val = String(row.task_title ?? "")
                              else if (colId === "completed_at")
                                val = row.completed_at ? new Date(row.completed_at).toLocaleDateString("ko-KR") : ""
                              else val = String(row.form_data?.[colId] ?? "")
                              return (
                                <td key={colId} className="p-2 whitespace-nowrap max-w-[200px] truncate" title={val}>
                                  {val}
                                </td>
                              )
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="shrink-0 text-xs text-muted-foreground mt-2">
                총 {filteredRows.length}행 {filteredRows.length !== statsRows.length ? `(전체 ${statsRows.length}행 중)` : ""}
              </p>
            </>
          )}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardDescription>의료 리포트를 작성하지 않은 업무 목록입니다</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                불러오는 중…
              </div>
            ) : pendingTasks.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                모든 완료 태스크의 리포트가 작성되었습니다.
              </p>
            ) : (
              <ul className="space-y-3">
                {pendingTasks.map((t) => (
                  <li key={t.id} className="border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <Link
                      href={`/admin/reports/${t.id}`}
                      className="flex items-center justify-between py-4 px-4 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors block"
                    >
                      <div>
                        <p className="font-semibold text-base">{t.patient_name}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {t.completed_at
                            ? `완료: ${new Date(t.completed_at).toLocaleDateString("ko-KR")}`
                            : `생성: ${new Date(t.created_at).toLocaleDateString("ko-KR")}`}
                          {t.assigned_to_name && ` · ${t.assigned_to_name}`}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
