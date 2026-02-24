import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { S3File, ExcelPreview, DicomPreview, ExcelSheet } from "../types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getFileType } from "../utils/fileUtils"

interface NiftiPreview {
  type: "nifti"
  metadata: Record<string, any>
}

interface FilePreviewSectionProps {
  selectedFile: S3File | null
  fileUrl: string | null
  isLoadingPreview: boolean
  previewData: ExcelPreview | DicomPreview | NiftiPreview | null
}

export function FilePreviewSection({
  selectedFile,
  fileUrl,
  isLoadingPreview,
  previewData,
}: FilePreviewSectionProps) {
  return (
    <Card className="flex-1 min-w-0 max-w-full">
      <CardHeader>
        <CardTitle>파일 미리보기</CardTitle>
      </CardHeader>
      <CardContent>
        {selectedFile ? (
          <div className="space-y-4 min-w-0 max-w-full">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">파일명:</span>
                <span className="text-sm">{selectedFile.fileName || "알 수 없음"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">크기:</span>
                <span className="text-sm">{(selectedFile.size / 1024).toFixed(2)} KB</span>
              </div>
            </div>
            <div className="border rounded-md overflow-hidden min-w-0 max-w-full">
              {isLoadingPreview ? (
                <div className="flex items-center justify-center h-[400px]">
                  <p className="text-sm text-muted-foreground">로딩 중...</p>
                </div>
              ) : getFileType(selectedFile) === "excel" && previewData && previewData.type === "excel" ? (
                <div className="p-4 overflow-x-auto" style={{ maxHeight: "400px" }}>
                  {previewData.sheets && Array.isArray(previewData.sheets) && previewData.sheets.length > 0 ? (
                    <div className="space-y-4">
                      {previewData.sheets.map((sheet) => (
                        <div key={sheet.name} className="space-y-2">
                          <h3 className="text-sm font-semibold">{sheet.name}</h3>
                          <div className="border rounded-md overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {sheet.headers.map((header, index) => (
                                    <TableHead key={index}>{header}</TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sheet.rows.slice(0, 100).map((row, rowIndex) => (
                                  <TableRow key={rowIndex}>
                                    {row.map((cell, cellIndex) => (
                                      <TableCell key={cellIndex}>{String(cell)}</TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">데이터를 불러올 수 없습니다</p>
                    </div>
                  )}
                </div>
              ) : getFileType(selectedFile) === "pdf" ? (
                fileUrl ? (
                  <iframe src={fileUrl} className="w-full" style={{ height: "600px" }} title="PDF Preview" />
                ) : (
                  <div className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">PDF를 불러오는 중...</p>
                  </div>
                )
              ) : getFileType(selectedFile) === "image" ? (
                fileUrl ? (
                  <div className="flex items-center justify-center h-[400px] bg-muted/30">
                    <img src={fileUrl} alt={selectedFile.fileName || "Preview"} className="max-w-full max-h-full object-contain" />
                  </div>
                ) : (
                  <div className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">이미지를 불러오는 중...</p>
                  </div>
                )
              ) : getFileType(selectedFile) === "video" ? (
                fileUrl ? (
                  <div className="flex items-center justify-center h-[400px] bg-muted/30">
                    <video src={fileUrl} controls className="max-w-full max-h-full" />
                  </div>
                ) : (
                  <div className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">동영상을 불러오는 중...</p>
                  </div>
                )
              ) : getFileType(selectedFile) === "ppt" ? (
                fileUrl ? (
                  <div className="flex flex-col items-center justify-center h-[400px] bg-muted/30 p-4">
                    <iframe 
                      src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`}
                      className="w-full h-full border-0"
                      style={{ minHeight: "400px" }}
                      title="PPT Preview"
                    />
                  </div>
                ) : (
                  <div className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">PPT 파일을 불러오는 중...</p>
                  </div>
                )
              ) : previewData && previewData.type === "dicom" ? (
                <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: "400px" }}>
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold mb-2">DICOM 메타데이터</h3>
                    <div className="space-y-2 text-sm">
                      {previewData.metadata && Object.keys(previewData.metadata).length > 0 ? (
                        Object.entries(previewData.metadata).map(([key, value]) => (
                          <div key={key} className="flex items-start gap-2 border-b pb-2">
                            <span className="font-medium text-muted-foreground min-w-[200px]">{key}:</span>
                            <span className="flex-1 wrap-break-word">{String(value)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground">메타데이터를 불러올 수 없습니다</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : previewData && previewData.type === "nifti" ? (
                <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: "400px" }}>
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold mb-2">NIFTI 헤더 정보</h3>
                    <div className="space-y-2 text-sm">
                      {previewData.metadata && Object.keys(previewData.metadata).length > 0 ? (
                        Object.entries(previewData.metadata).map(([key, value]) => {
                          let displayValue = value
                          if (Array.isArray(value)) {
                            displayValue = `[${value.join(', ')}]`
                          } else if (typeof value === 'object' && value !== null) {
                            displayValue = JSON.stringify(value, null, 2)
                          }
                          return (
                            <div key={key} className="flex items-start gap-2 border-b pb-2">
                              <span className="font-medium text-muted-foreground min-w-[200px]">{key}:</span>
                              <span className="flex-1 wrap-break-word font-mono text-xs">{String(displayValue)}</span>
                            </div>
                          )
                        })
                      ) : (
                        <p className="text-muted-foreground">헤더 정보를 불러올 수 없습니다</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">미리보기를 지원하지 않는 파일 형식입니다</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">파일을 선택하면 미리보기가 표시됩니다</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
