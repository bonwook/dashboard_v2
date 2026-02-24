"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react"
import { parseFile } from "../utils/parseFile"
import type { ImportedData } from "../types"
import { useToast } from "@/hooks/use-toast"

interface ImportPreviewSectionProps {
  /** 선택된 필드 레이블 (순서 유지) - 병합 시 맨 앞 컬럼으로 사용 */
  selectedLabels: string[]
  importedData: ImportedData | null
  onImportedDataChange: (data: ImportedData | null) => void
}

export function ImportPreviewSection({
  selectedLabels,
  importedData,
  onImportedDataChange,
}: ImportPreviewSectionProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsLoading(true)
    try {
      const data = await parseFile(file)
      onImportedDataChange(data)
      toast({
        title: "파일 불러옴",
        description: `${data.fileName}: ${data.headers.length}열, ${data.rows.length}행`,
      })
    } catch (err) {
      toast({
        title: "불러오기 실패",
        description: err instanceof Error ? err.message : "파일을 처리할 수 없습니다.",
        variant: "destructive",
      })
      onImportedDataChange(null)
    } finally {
      setIsLoading(false)
      e.target.value = ""
    }
  }

  const clearImport = () => {
    onImportedDataChange(null)
  }

  const mergedHeaders = [...selectedLabels, ...(importedData?.headers ?? [])]
  const mergedRows = (importedData?.rows ?? []).map((row) => {
    const pad = Array(selectedLabels.length).fill("")
    return [...pad, ...row]
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          가져오기 및 미리보기
        </CardTitle>
        <CardDescription>
          CSV 또는 Excel 파일을 불러오면, 선택한 리포트 필드 헤더가 맨 앞에 붙고 기존 파일 데이터가 그 뒤에 유지됩니다. 열이 많아 세로 스크롤로 확인하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={handleFileChange}
              disabled={isLoading}
            />
            <Button type="button" variant="outline" asChild>
              <span>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {isLoading ? "불러오는 중..." : "CSV / Excel 파일 선택"}
              </span>
            </Button>
          </label>
          {importedData && (
            <Button type="button" variant="ghost" size="sm" onClick={clearImport}>
              불러오기 초기화
            </Button>
          )}
        </div>

        {importedData && (
          <div className="rounded-md border overflow-auto max-h-[480px]">
            <div className="min-w-max">
              <Table>
                <TableHeader>
                  <TableRow>
                    {mergedHeaders.map((h, i) => (
                      <TableHead key={i} className="whitespace-nowrap bg-muted/50">
                        {h || `(빈 컬럼 ${i + 1})`}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mergedRows.slice(0, 500).map((row, rowIdx) => (
                    <TableRow key={rowIdx}>
                      {row.map((cell, colIdx) => (
                        <TableCell key={colIdx} className="whitespace-nowrap">
                          {cell}
                        </TableCell>
                      ))}
                      {row.length < mergedHeaders.length &&
                        Array(mergedHeaders.length - row.length)
                          .fill(0)
                          .map((_, i) => (
                            <TableCell key={`pad-${i}`} className="whitespace-nowrap text-muted-foreground">
                              —
                            </TableCell>
                          ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {mergedRows.length > 500 && (
                <p className="text-muted-foreground text-sm p-2">
                  … 상위 500행만 미리보기 (전체 {mergedRows.length}행은 내보내기에 포함됩니다)
                </p>
              )}
            </div>
          </div>
        )}

        {!importedData && !isLoading && (
          <p className="text-muted-foreground text-sm">
            파일을 선택하면 선택한 필드 컬럼 + 기존 데이터가 합쳐진 미리보기가 표시됩니다.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
