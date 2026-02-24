"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { Upload, HardDrive } from "lucide-react"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
import { Progress } from "@/components/ui/progress"
import { uploadWithProgress } from "@/lib/utils/upload-with-progress"

export default function AdminFileUploadPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [allFolderFiles, setAllFolderFiles] = useState<File[]>([]) // 폴더의 모든 파일 (필터링 전)
  const [folderPath, setFolderPath] = useState<string>("")
  const [folderName, setFolderName] = useState<string>("")
  const [isFolderUpload, setIsFolderUpload] = useState(false)
  const [fileType, setFileType] = useState<"excel" | "pdf" | "dicom" | "nifti" | "other">("other")
  const [user, setUser] = useState<any>(null)
  const [storageStats, setStorageStats] = useState({
    excel: 0,
    pdf: 0,
    zip: 0,
    dicom: 0,
    nifti: 0,
    other: 0,
  })
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (!res.ok) return
        const me = await res.json()
        setUser(me)
      } catch {
        // ignore
      }
    }
    loadUser()

    // Load storage stats
    const loadStorageStats = async () => {
      try {
        const storageStatsRes = await fetch("/api/storage/stats", {
          credentials: "include",
        })
        if (storageStatsRes.ok) {
          const storageStatsData = await storageStatsRes.json()
          setStorageStats(storageStatsData.stats || { excel: 0, pdf: 0, zip: 0, dicom: 0, nifti: 0, other: 0 })
        }
      } catch (error) {
        // Silent error handling
      }
    }
    loadStorageStats()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    if (isFolderUpload) {
      // 폴더 업로드 처리
      const fileArray = Array.from(files)
      
      // 폴더 크기 제한 체크 (5GB = 5 * 1024 * 1024 * 1024 bytes)
      const MAX_FOLDER_SIZE = 5 * 1024 * 1024 * 1024 // 5GB
      const totalSize = fileArray.reduce((sum, file) => sum + file.size, 0)
      
      if (totalSize > MAX_FOLDER_SIZE) {
        toast({
          title: "폴더 크기 초과",
          description: `폴더 크기가 5GB를 초과합니다. (현재: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB)`,
          variant: "destructive",
        })
        return
      }
      
      // 모든 파일을 먼저 저장 (표시용)
      setAllFolderFiles(fileArray)
      
      // 폴더 경로 추출 (첫 번째 파일의 webkitRelativePath에서)
      const firstFile = fileArray[0] as any
      if (firstFile.webkitRelativePath) {
        const pathParts = typeof firstFile.webkitRelativePath === 'string' ? 
          firstFile.webkitRelativePath.split('/') : 
          []
        if (pathParts.length > 1) {
          // 전체 경로 표시 (예: "폴더명" 또는 "상위폴더/하위폴더")
          const fullPath = pathParts.slice(0, -1).join('/') // 마지막 파일명 제외한 경로
          setFolderPath(fullPath)
          // 폴더 이름은 사용자가 선택적으로 입력할 수 있도록 빈 문자열로 초기화
          setFolderName("")
        }
      }

      // 모든 파일 허용 (파일 타입 자동 감지)
      // 파일 확장자로 파일 타입 확인하는 헬퍼 함수
      const detectFileType = (fileName: string): string => {
        const fileNameLower = fileName.toLowerCase()
        const extension = fileNameLower.split('.').pop()
        
        if (!extension) return 'other'
        
        // .nii.gz 같은 경우 먼저 체크
        if (fileNameLower.endsWith('.nii.gz')) {
          return 'nifti'
        }
        
        // 기존 파일 타입 확장자 확인
        if (['xlsx', 'xls', 'csv'].includes(extension)) {
          return 'excel'
        } else if (extension === 'pdf') {
          return 'pdf'
        } else if (['dcm', 'dicom'].includes(extension)) {
          return 'dicom'
        } else if (['nii', 'nifti'].includes(extension)) {
          return 'nifti'
        } else if (extension === 'zip' || extension === '7z') {
          return 'zip'
        }
        
        return 'other'
      }

      // 모든 파일 허용
      setUploadedFiles(fileArray)
      setUploadedFile(null)
      
      toast({
        title: "폴더 선택됨",
        description: `${fileArray.length}개의 파일이 업로드됩니다`,
      })
    } else {
      // 개별 파일 업로드 처리
      const file = files[0]
      
      // 파일 크기 제한 검증 (모든 파일 타입에 대해 500MB 제한)
      const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB
      
      if (file.size > MAX_FILE_SIZE) {
        const maxSizeMB = (MAX_FILE_SIZE / 1024 / 1024).toFixed(0)
        const currentSizeMB = (file.size / 1024 / 1024).toFixed(2)
        
        toast({
          title: "파일 크기 초과",
          description: `파일 크기가 최대 ${maxSizeMB}MB를 초과합니다. (현재: ${currentSizeMB}MB)`,
          variant: "destructive",
        })
        // 파일 입력 초기화
        const fileInput = document.getElementById("fileInput") as HTMLInputElement
        if (fileInput) {
          fileInput.value = ""
        }
        return
      }
      
      setUploadedFile(file)
      setUploadedFiles([])
    }
  }

  const handleClear = () => {
    setUploadedFile(null)
    setUploadedFiles([])
    setAllFolderFiles([])
    setFolderPath("")
    setFolderName("")
    setIsFolderUpload(false)
    // Reset file input
    const fileInput = document.getElementById("fileInput") as HTMLInputElement
    if (fileInput) {
      fileInput.value = ""
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!uploadedFile && uploadedFiles.length === 0) {
      toast({
        title: "Error",
        description: "파일을 선택해주세요",
        variant: "destructive",
      })
      return
    }

    // 폴더 업로드 시 크기 제한 재확인
    if (isFolderUpload && uploadedFiles.length > 0) {
      const MAX_FOLDER_SIZE = 5 * 1024 * 1024 * 1024 // 5GB
      const totalSize = uploadedFiles.reduce((sum, file) => sum + file.size, 0)
      
      if (totalSize > MAX_FOLDER_SIZE) {
        toast({
          title: "폴더 크기 초과",
          description: `업로드할 파일의 총 크기가 ${(MAX_FOLDER_SIZE / 1024 / 1024 / 1024).toFixed(0)}GB를 초과합니다. (현재: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB)`,
          variant: "destructive",
        })
        return
      }
      
      // 폴더 내 개별 파일 크기 제한 확인 (모든 파일 500MB 제한)
      const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB
      const oversizedFiles = uploadedFiles.filter(file => file.size > MAX_FILE_SIZE)
      
      if (oversizedFiles.length > 0) {
        const maxSizeMB = (MAX_FILE_SIZE / 1024 / 1024).toFixed(0)
        const oversizedFileNames = oversizedFiles.slice(0, 3).map(f => f.name).join(", ")
        const moreCount = oversizedFiles.length > 3 ? ` 외 ${oversizedFiles.length - 3}개` : ""
        
        toast({
          title: "파일 크기 초과",
          description: `폴더 내에 ${maxSizeMB}MB를 초과하는 파일이 ${oversizedFiles.length}개 있습니다: ${oversizedFileNames}${moreCount}`,
          variant: "destructive",
        })
        return
      }
    }
    
    // 개별 파일 업로드 시 크기 제한 재확인
    if (!isFolderUpload && uploadedFile) {
      const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB
      
      if (uploadedFile.size > MAX_FILE_SIZE) {
        const maxSizeMB = (MAX_FILE_SIZE / 1024 / 1024).toFixed(0)
        const currentSizeMB = (uploadedFile.size / 1024 / 1024).toFixed(2)
        
        toast({
          title: "파일 크기 초과",
          description: `파일 크기가 최대 ${maxSizeMB}MB를 초과합니다. (현재: ${currentSizeMB}MB)`,
          variant: "destructive",
        })
        return
      }
    }

    // 사용자 정보가 없으면 로드 시도
    let currentUser = user
    if (!currentUser) {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (res.ok) {
          const me = await res.json()
          currentUser = me
          setUser(me)
        }
      } catch (error) {
        console.error("[Upload] Failed to load user:", error)
      }
    }

    setIsLoading(true)
    setUploadProgress(0)

    try {
      // 파일 확장자로 파일 타입 자동 감지
      const detectFileType = (fileName: string): string => {
        const fileNameLower = fileName.toLowerCase()
        const extension = fileNameLower.split('.').pop()
        
        if (!extension) return 'other'
        
        // .nii.gz 같은 경우 먼저 체크
        if (fileNameLower.endsWith('.nii.gz')) {
          return 'nifti'
        }
        
        // 기존 파일 타입 확장자 확인
        if (['xlsx', 'xls', 'csv'].includes(extension)) {
          return 'excel'
        } else if (extension === 'pdf') {
          return 'pdf'
        } else if (['dcm', 'dicom'].includes(extension)) {
          return 'dicom'
        } else if (['nii', 'nifti'].includes(extension)) {
          return 'nifti'
        } else if (extension === 'zip' || extension === '7z') {
          return 'zip'
        }
        
        return 'other'
      }

      // FormData 생성
      const formData = new FormData()
      if (isFolderUpload && uploadedFiles.length > 0) {
        // 폴더 업로드
        uploadedFiles.forEach(file => {
          formData.append("files", file)
        })
        // 폴더 이름이 비어있으면 원본 폴더 이름 사용, 있으면 사용자가 입력한 이름 사용
        // folderName이 비어있으면 folderPath에서 마지막 폴더 이름만 추출하여 원본 폴더 이름으로 사용
        const folderNameToSend = folderName.trim() || (folderPath ? folderPath.split(/[/\\]/).pop() || folderPath : "")
        formData.append("folderName", folderNameToSend)
      } else if (uploadedFile) {
        // 개별 파일 업로드
        formData.append("file", uploadedFile)
        // 파일 확장자로 자동 감지
        const detectedType = detectFileType(uploadedFile.name)
        formData.append("fileType", detectedType)
      }

      // S3에 업로드 (진행률 표시)
      const data = await uploadWithProgress<any>({
        url: "/api/storage/upload",
        formData,
        withCredentials: true,
        onProgress: (p) => setUploadProgress(p.percent),
      })

      const fileCount = data.count || (data.fileId ? 1 : 0)
      toast({
        title: "Success",
        description: `${fileCount}개의 파일이 성공적으로 업로드되었습니다.`,
      })

      // 폼 초기화
      handleClear()
      
      // Storage stats 다시 로드
      const storageStatsRes = await fetch("/api/storage/stats", {
        credentials: "include",
      })
      if (storageStatsRes.ok) {
        const storageStatsData = await storageStatsRes.json()
        setStorageStats(storageStatsData.stats || { excel: 0, pdf: 0, zip: 0, dicom: 0, nifti: 0, other: 0 })
      }
    } catch (error: unknown) {
      console.error("[Upload] Upload error:", error)
      if (error instanceof Error) {
        console.error("[Upload] Error message:", error.message)
        console.error("[Upload] Error stack:", error.stack)
      }
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "파일 업로드에 실패했습니다",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      setUploadProgress(0)
    }
  }

  // 바이트를 읽기 쉬운 형식으로 변환하는 함수
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }

  // 원형 차트 데이터 준비
  const chartData = [
    { name: 'Excel', value: storageStats.excel, color: '#3b82f6', formatted: formatBytes(storageStats.excel) },
    { name: 'PDF', value: storageStats.pdf, color: '#ef4444', formatted: formatBytes(storageStats.pdf) },
    { name: 'ZIP', value: storageStats.zip, color: '#10b981', formatted: formatBytes(storageStats.zip) },
    { name: 'DICOM', value: storageStats.dicom, color: '#8b5cf6', formatted: formatBytes(storageStats.dicom) },
    { name: 'NIFTI', value: storageStats.nifti, color: '#f59e0b', formatted: formatBytes(storageStats.nifti) },
    { name: 'Other', value: storageStats.other, color: '#6b7280', formatted: formatBytes(storageStats.other) },
  ].filter(item => item.value > 0)

  const totalSize = storageStats.excel + storageStats.pdf + storageStats.zip + storageStats.dicom + storageStats.nifti + storageStats.other

  return (
    <div className="mx-auto max-w-7xl p-6 select-none">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">파일 업로드</h1>
      </div>

      <div className="grid gap-6 mb-8 md:grid-cols-2">
        {/* 업로드 폼 */}
        <Card className="max-w-2xl w-full">
          <CardHeader className="relative">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Upload</CardTitle>
                <CardDescription>서버로 파일을 업로드 합니다</CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={handleClear} className="ml-4">
                새로고침
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <Label htmlFor="fileInput">{isFolderUpload ? "폴더 선택 *" : "파일 선택 *"}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="folderUpload"
                      checked={isFolderUpload}
                      onChange={(e) => {
                        setIsFolderUpload(e.target.checked)
                        setUploadedFile(null)
                        setUploadedFiles([])
                        setAllFolderFiles([])
                        setFolderPath("")
                        setFolderName("")
                        const fileInput = document.getElementById("fileInput") as HTMLInputElement
                        if (fileInput) {
                          fileInput.value = ""
                        }
                      }}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="folderUpload" className="text-sm font-normal cursor-pointer">
                      폴더 업로드
                    </Label>
                  </div>
                </div>
                {isFolderUpload && (
                  <p className="text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/20 p-2 rounded border border-amber-200 dark:border-amber-800">
                    ⚠️ 웹 보안정책상 폴더 선택 시 내부 파일들이 파일 선택 대화상자에 표시되지 않습니다. 폴더를 선택한 후 아래에 표시되는 파일 목록을 확인하세요.
                  </p>
                )}
                <div className="flex items-center gap-4">
                  {isFolderUpload ? (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        type="text"
                        value={folderPath || ""}
                        readOnly
                        className="cursor-default bg-muted"
                        placeholder="폴더를 선택하세요"
                      />
                      <input
                        id="fileInput"
                        type="file"
                        {...({ webkitdirectory: "", directory: "", multiple: true } as any)}
                        onChange={handleFileChange}
                        className="hidden"
                        required
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const fileInput = document.getElementById("fileInput") as HTMLInputElement
                          if (fileInput) {
                            fileInput.click()
                          }
                        }}
                      >
                        {folderPath ? "폴더 변경" : "폴더 선택"}
                      </Button>
                    </div>
                  ) : (
                    <Input
                      id="fileInput"
                      type="file"
                      onChange={handleFileChange}
                      className="cursor-pointer"
                      required
                    />
                  )}
                </div>
                
                {/* 파일 정보 표시 영역 */}
                {uploadedFile && (
                  <div className="space-y-2 p-3 border rounded-md bg-muted/50">
                    <div className="flex items-center gap-2 text-sm">
                      <Upload className="h-4 w-4 shrink-0" />
                      <span className="truncate font-medium">{uploadedFile.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground pl-6">
                      용량: {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                )}

                {isFolderUpload && allFolderFiles.length > 0 && (
                  <div className="space-y-2 p-3 border rounded-md bg-muted/50">
                    <div className="flex items-center gap-2 text-sm">
                      <Upload className="h-4 w-4 shrink-0" />
                      <span className="font-medium">
                        {allFolderFiles.length}개 파일 (업로드: {uploadedFiles.length}개)
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground pl-6">
                      총 용량: {(allFolderFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024 / 1024).toFixed(2)} GB
                      {uploadedFiles.length > 0 && (
                        <span className="ml-2">
                          (업로드 용량: {(uploadedFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024 / 1024).toFixed(2)} GB)
                        </span>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto mt-2 space-y-1 border-t pt-2">
                      <div className="text-xs font-medium mb-2 pl-6 sticky top-0 bg-muted/50 py-1 -mt-2 -pt-2 z-10 select-none">폴더 내 파일 목록 ({allFolderFiles.length}개):</div>
                      <div className="space-y-1">
                        {allFolderFiles.map((file, index) => {
                          return (
                            <div 
                              key={index} 
                              className="text-xs pl-6 py-1.5 flex items-center justify-between hover:bg-muted/30 rounded select-none text-foreground font-medium"
                            >
                              <span className="truncate flex-1 min-w-0">
                                {file.name}
                              </span>
                              <span className="ml-2 shrink-0 whitespace-nowrap">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  {isFolderUpload 
                    ? (
                      <>
                        폴더를 선택하면 모든 파일 형식이 업로드됩니다.
                        <br />
                        최대 폴더 크기: 5GB, 개별 파일: 500MB
                      </>
                    )
                    : (
                      <>
                        <br />
                        최대 크기: 500MB
                      </>
                    )}
                </p>
              </div>

              {isFolderUpload && uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="folderName" className="text-sm">폴더 이름 (선택사항)</Label>
                  <Input
                    id="folderName"
                    type="text"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    placeholder={folderPath || "폴더 이름을 입력하세요"}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    비워두면 원본 폴더 이름({folderPath ? folderPath.split(/[/\\]/).pop() || folderPath : ""})이 사용됩니다
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={isLoading || (!uploadedFile && uploadedFiles.length === 0)}>
                  {isLoading ? "업로드 중..." : "업로드"}
                </Button>
              </div>
              {isLoading && (
                <div className="mt-3">
                  <Progress value={uploadProgress} />
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Storage 차트 */}
        <Card className="h-full flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
            <div>
              <CardTitle className="text-sm font-medium">Storage</CardTitle>
            </div>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center min-h-0">
            {totalSize > 0 && chartData.length > 0 ? (
              <div className="flex items-center justify-center h-[260px]">
                <ChartContainer
                  config={{
                    excel: { label: "Excel", color: "#3b82f6" },
                    pdf: { label: "PDF", color: "#ef4444" },
                    zip: { label: "ZIP", color: "#10b981" },
                    dicom: { label: "DICOM", color: "#8b5cf6" },
                    nifti: { label: "NIFTI", color: "#f59e0b" },
                    other: { label: "Other", color: "#6b7280" },
                  }}
                  className="h-[260px] w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}\n${(percent * 100).toFixed(1)}%`}
                        outerRadius={90}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <ChartTooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as typeof chartData[0]
                            return (
                              <div className="rounded-lg border bg-background p-2 shadow-sm">
                                <div className="grid gap-2">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-sm font-medium">{data.name}</span>
                                    <span className="text-sm font-bold">{data.formatted}</span>
                                  </div>
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground">
                <p className="text-sm mb-2">업로드된 파일이 없습니다</p>
                <p className="text-xs">S3에 파일을 업로드하면 여기에 표시됩니다</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
