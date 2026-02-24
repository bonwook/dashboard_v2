"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react"
import { downloadCSV } from "../utils/exportFile"
import type { FormValues } from "../types"
import type { ImportedData } from "../types"
import { useToast } from "@/hooks/use-toast"

interface ExportSectionProps {
  /** 선택된 필드 id (순서 유지) */
  selectedIds: string[]
  /** 선택된 필드 레이블 (순서 유지, selectedIds와 1:1) */
  selectedLabels: string[]
  formValues: FormValues
  importedData: ImportedData | null
}

export function ExportSection({
  selectedIds,
  selectedLabels,
  formValues,
  importedData,
}: ExportSectionProps) {
  const [exporting, setExporting] = useState<"csv" | "excel" | null>(null)
  const { toast } = useToast()

  const canExport = selectedIds.length > 0

  const handleExportCSV = () => {
    if (!canExport) return
    setExporting("csv")
    try {
      const headers = importedData
        ? [...selectedLabels, ...importedData.headers]
        : selectedLabels
      const rows = importedData
        ? importedData.rows.map((row) => {
            const pad = Array(selectedIds.length).fill("")
            return [...pad, ...row]
          })
        : [selectedIds.map((id) => String(formValues[id] ?? ""))]
      downloadCSV(headers, rows, `report_${new Date().toISOString().slice(0, 10)}.csv`)
      toast({ title: "다운로드 완료", description: "CSV 파일이 저장되었습니다." })
    } catch (e) {
      toast({
        title: "내보내기 실패",
        description: e instanceof Error ? e.message : "CSV 내보내기에 실패했습니다.",
        variant: "destructive",
      })
    } finally {
      setExporting(null)
    }
  }

  const handleExportExcel = async () => {
    if (!canExport) return
    setExporting("excel")
    try {
      const headers = importedData
        ? [...selectedLabels, ...importedData.headers]
        : selectedLabels
      const rows = importedData
        ? importedData.rows.map((row) => {
            const pad = Array(selectedIds.length).fill("")
            return [...pad, ...row]
          })
        : [selectedIds.map((id) => String(formValues[id] ?? ""))]
      const res = await fetch("/api/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers, rows }),
        credentials: "include",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || "Export failed")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `report_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: "다운로드 완료", description: "Excel 파일이 저장되었습니다." })
    } catch (e) {
      toast({
        title: "내보내기 실패",
        description: e instanceof Error ? e.message : "Excel 내보내기에 실패했습니다.",
        variant: "destructive",
      })
    } finally {
      setExporting(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileDown className="h-5 w-5" />
          내보내기
        </CardTitle>
        <CardDescription>
          선택한 필드만 헤더로 사용합니다. 파일을 불러온 경우, 선택 필드 컬럼 + 기존 데이터가 함께 내보내집니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={!canExport || exporting !== null}
          onClick={handleExportCSV}
        >
          {exporting === "csv" ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <FileSpreadsheet className="h-4 w-4 mr-2" />
          )}
          CSV로 내보내기
        </Button>
        <Button
          variant="outline"
          disabled={!canExport || exporting !== null}
          onClick={handleExportExcel}
        >
          {exporting === "excel" ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <FileDown className="h-4 w-4 mr-2" />
          )}
          Excel로 내보내기
        </Button>
        {!canExport && (
          <p className="text-muted-foreground text-sm self-center">
            리포트 폼에서 내보낼 항목을 체크해 주세요.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
