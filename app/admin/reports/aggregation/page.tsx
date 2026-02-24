"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FileSpreadsheet, ArrowLeft, Loader2, FileDown } from "lucide-react"
import { getFieldLabelById, getAllFieldIds } from "../reportFormFields"
import { useToast } from "@/hooks/use-toast"
import { downloadCSV } from "../utils/exportFile"

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

export default function AggregationPage() {
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterBy, setFilterBy] = useState<Record<string, string>>({})
  const { toast } = useToast()

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch("/api/reports/info", { credentials: "include" })
      if (!res.ok || cancelled) return
      const data = await res.json()
      if (!cancelled && Array.isArray(data.rows)) {
        setRows(
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
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const columnIds = useMemo(() => getAllColumnIds(), [])

  const filteredRows = useMemo(() => {
    let list = rows
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
  }, [rows, filterBy])

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

  if (loading) {
    return (
      <div className="mx-auto max-w-full p-6 flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-full p-6 flex flex-col min-h-[calc(100vh-5rem)]">
      <div className="shrink-0 mb-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/reports">
              <ArrowLeft className="mr-2 h-4 w-4" />
              목록으로
            </Link>
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <FileDown className="h-4 w-4 mr-2" />
          CSV 내보내기
        </Button>
      </div>
      <p className="shrink-0 text-muted-foreground text-sm mb-3">
        완료된 태스크 리포트가 누적된 데이터입니다. 컬럼별 필터로 원하는 행만 조회할 수 있습니다. 가로·세로 스크롤로 전체 속성을 확인하세요.
      </p>

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
                    {rows.length === 0 ? "저장된 리포트가 없습니다." : "필터 조건에 맞는 행이 없습니다."}
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
        총 {filteredRows.length}행 {filteredRows.length !== rows.length ? `(전체 ${rows.length}행 중)` : ""}
      </p>
    </div>
  )
}
