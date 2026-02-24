"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import { Upload, FileImage, Layers, Play, Download, Trash2, Loader2 } from "lucide-react"
import { uploadWithProgress } from "@/lib/utils/upload-with-progress"

export default function ClientSegmentationPage() {
  const [user, setUser] = useState<any>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; path: string; uploadedAt: string }>>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
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
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // NIFTI 파일 검증
    const fileName = file.name.toLowerCase()
    const isValidNifti = fileName.endsWith('.nii') || fileName.endsWith('.nii.gz') || fileName.endsWith('.nifti')
    
    if (!isValidNifti) {
      toast({
        title: "파일 형식 오류",
        description: "NIFTI 파일(.nii, .nii.gz, .nifti)만 업로드 가능합니다.",
        variant: "destructive",
      })
      return
    }

    // 파일 크기 제한 (500MB)
    const maxSize = 500 * 1024 * 1024
    if (file.size > maxSize) {
      toast({
        title: "파일 크기 초과",
        description: "파일 크기는 최대 500MB까지 업로드 가능합니다.",
        variant: "destructive",
      })
      return
    }

    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setIsUploading(true)
    setUploadProgress(0)
    try {
      const formData = new FormData()
      formData.append("file", selectedFile)
      formData.append("fileType", "nifti")
      const data = await uploadWithProgress<{ path: string }>({
        url: "/api/storage/upload",
        formData,
        withCredentials: true,
        onProgress: (p) => setUploadProgress(p.percent),
      })
      
      setUploadedFiles(prev => [...prev, {
        name: selectedFile.name,
        path: data.path,
        uploadedAt: new Date().toISOString(),
      }])

      toast({
        title: "업로드 성공",
        description: `${selectedFile.name} 파일이 업로드되었습니다.`,
      })

      setSelectedFile(null)
      // 파일 입력 초기화
      const fileInput = document.getElementById("nifti-file-input") as HTMLInputElement
      if (fileInput) {
        fileInput.value = ""
      }
    } catch (error: any) {
      toast({
        title: "업로드 실패",
        description: error.message || "파일 업로드에 실패했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const handleProcess = async (filePath: string) => {
    setIsProcessing(true)
    setProcessingProgress(0)

    // 진행률 시뮬레이션 (실제로는 API 호출)
    const interval = setInterval(() => {
      setProcessingProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }
        return prev + 10
      })
    }, 500)

    try {
      // TODO: 실제 segmentation API 호출
      await new Promise(resolve => setTimeout(resolve, 5000))

      toast({
        title: "처리 완료",
        description: "Segmentation 처리가 완료되었습니다.",
      })
    } catch (error: any) {
      toast({
        title: "처리 실패",
        description: error.message || "Segmentation 처리에 실패했습니다.",
        variant: "destructive",
      })
    } finally {
      clearInterval(interval)
      setIsProcessing(false)
      setProcessingProgress(0)
    }
  }

  const handleDelete = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
    toast({
      title: "파일 삭제",
      description: "파일이 목록에서 제거되었습니다.",
    })
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Segmentation</h1>
          <p className="text-muted-foreground mt-2">
            NIFTI 파일을 업로드하여 Segmentation을 진행하세요
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 파일 업로드 섹션 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              파일 업로드
            </CardTitle>
            <CardDescription>
              NIFTI 형식의 파일을 업로드하세요 (.nii, .nii.gz, .nifti)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nifti-file-input">NIFTI 파일 선택</Label>
              <Input
                id="nifti-file-input"
                type="file"
                accept=".nii,.nii.gz,.nifti"
                onChange={handleFileSelect}
                disabled={isUploading}
              />
              {selectedFile && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                  <FileImage className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm flex-1 truncate">{selectedFile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              )}
            </div>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  업로드 중...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  업로드
                </>
              )}
            </Button>
            {isUploading && (
              <div>
                <Progress value={uploadProgress} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 업로드된 파일 목록 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              업로드된 파일
            </CardTitle>
            <CardDescription>
              업로드된 NIFTI 파일 목록
            </CardDescription>
          </CardHeader>
          <CardContent>
            {uploadedFiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileImage className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>업로드된 파일이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-2">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileImage className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(file.uploadedAt).toLocaleString('ko-KR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleProcess(file.path)}
                        disabled={isProcessing}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        처리
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 처리 진행 상태 */}
      {isProcessing && (
        <Card>
          <CardHeader>
            <CardTitle>Segmentation 처리 중...</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>진행률</span>
                <span>{processingProgress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${processingProgress}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                NIFTI 파일을 분석하고 Segmentation을 수행하고 있습니다...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 결과 표시 영역 (향후 구현) */}
      {!isProcessing && uploadedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Segmentation 결과</CardTitle>
            <CardDescription>
              처리된 결과를 확인하고 다운로드할 수 있습니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Segmentation 결과가 여기에 표시됩니다</p>
              <p className="text-xs mt-1">파일을 선택하고 처리 버튼을 클릭하세요</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
