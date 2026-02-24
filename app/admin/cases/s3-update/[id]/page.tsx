"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { TaskRegistrationForm } from "@/app/admin/analytics/components/TaskRegistrationForm"
import { S3BucketInfoCard } from "@/components/s3-bucket-info-card"
import { useFileManagement } from "@/app/admin/analytics/hooks/useFileManagement"
import {
  getFileType,
  formatFileSize,
  updateDisplayedFiles,
  getDisplayPath,
} from "@/app/admin/analytics/utils/fileUtils"
import type { S3File } from "@/app/admin/analytics/types"
import { FilePreviewSection } from "@/app/admin/analytics/components/FilePreviewSection"

interface S3Update {
  id: number
  file_name: string
  bucket_name?: string | null
  file_size?: number | null
  metadata?: Record<string, unknown> | string | null
  upload_time?: string | null
  created_at: string
  task_id: string | null
  status?: string
  s3_key: string
}

export default function S3UpdateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [s3Update, setS3Update] = useState<S3Update | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [id, setId] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [isRefreshingFileList, setIsRefreshingFileList] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  // 현재 세션 S3 파일 목록 — 업무 요청(analytics)과 동일한 API·훅 사용
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [allFiles, setAllFiles] = useState<S3File[]>([])
  const [files, setFiles] = useState<S3File[]>([])
  const [currentPath, setCurrentPath] = useState<string>("")
  const [selectedFile, setSelectedFile] = useState<S3File | null>(null)
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)

  const s3Key = s3Update?.s3_key ?? ""

  const {
    isLoading: isLoadingSessionFiles,
    isDeleting,
    loadFiles,
    deleteSelectedItems,
    handleViewFile,
    previewData,
    fileUrl,
    isLoadingPreview,
  } = useFileManagement({
    user,
    toast,
    allFiles,
    setAllFiles,
    currentPath,
    selectedFile,
    setSelectedFile,
    setFiles,
    selectedFiles,
    setSelectedFiles,
  })

  /** 업무 요청 페이지와 동일: 선택된 파일/폴더 목록 (세션 스토리지 항목만, presigned s3_key 제외) */
  const getSelectedFilesForAssignment = useCallback((): S3File[] => {
    const uniqueItems = new Map<string, S3File>()
    ;[...allFiles, ...files].forEach((item) => {
      if (!uniqueItems.has(item.key)) uniqueItems.set(item.key, item)
    })
    return Array.from(uniqueItems.values()).filter((f) => selectedFiles.has(f.key))
  }, [allFiles, files, selectedFiles])

  const refreshFileList = async () => {
    if (!id) return
    setIsRefreshingFileList(true)
    try {
      const res = await fetch(`/api/s3-updates/${id}`, { credentials: "include" })
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json()
      const loaded = data.s3Update as S3Update
      setS3Update(loaded)
      setSelectedFiles((prev) => {
        const next = new Set(prev)
        if (loaded?.s3_key) next.add(loaded.s3_key)
        return next
      })
      toast({ title: "파일 목록을 새로고침했습니다." })
    } catch {
      toast({ title: "새로고침에 실패했습니다.", variant: "destructive" })
    } finally {
      setIsRefreshingFileList(false)
    }
  }

  useEffect(() => {
    params.then((p) => setId(p.id))
  }, [params])

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/s3-updates/${id}`, { credentials: "include" })
        if (!res.ok) {
          if (res.status === 404) {
            router.push("/admin/cases")
            return
          }
          throw new Error("Failed to load")
        }
        const data = await res.json()
        const loaded = data.s3Update as S3Update
        setS3Update(loaded)
        if (loaded?.s3_key) setSelectedFiles(new Set([loaded.s3_key]))
      } catch {
        router.push("/admin/cases")
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, router])

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (res.ok) {
          const me = await res.json()
          setUser(me)
        }
      } catch {
        // ignore
      }
    }
    loadUser()
  }, [])

  useEffect(() => {
    if (user) loadFiles(true, currentPath)
  }, [user, loadFiles])

  useEffect(() => {
    if (allFiles.length > 0) {
      updateDisplayedFiles(allFiles, currentPath, setFiles)
    }
  }, [currentPath, allFiles])

  const handleFolderClick = (folderPath: string) => {
    setCurrentPath(folderPath)
    updateDisplayedFiles(allFiles, folderPath, setFiles)
  }

  const handleGoUp = () => {
    if (!currentPath) return
    const pathParts = currentPath.split("/")
    pathParts.pop()
    const newPath = pathParts.join("/")
    setCurrentPath(newPath)
    updateDisplayedFiles(allFiles, newPath, setFiles)
  }

  const handleToggleFile = (fileKey: string, checked: boolean) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      if (checked) next.add(fileKey)
      else next.delete(fileKey)
      if (s3Key && !next.has(s3Key)) next.add(s3Key)
      return next
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allKeys = files.filter((f) => f.fileType !== "folder").map((f) => f.key)
      setSelectedFiles((prev) => {
        const next = new Set(prev)
        allKeys.forEach((k) => next.add(k))
        if (s3Key) next.add(s3Key)
        return next
      })
    } else {
      setSelectedFiles(s3Key ? new Set([s3Key]) : new Set())
    }
  }

  if (isLoading || !s3Update) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => router.push("/admin/cases")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          뒤로가기
        </Button>
      </div>

      {/* 1. 버킷(S3) — 다른 AWS 쪽 1건, 다운로드는 여기서만 */}
      <S3BucketInfoCard s3Update={{ ...s3Update, s3_key: s3Key }} />

      {/* 2. 연결된 업무 있음 → 보기로 이동 / 없음 → 업무 할당 폼 */}
      {s3Update.task_id ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">연결된 업무</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              이 S3 건에는 이미 업무가 연결되어 있습니다. 업무 상세에서 확인·수정할 수 있습니다.
            </p>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push(`/admin/cases/${s3Update.task_id}`)}
              className="w-full sm:w-auto"
            >
              연결된 업무 보기
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">업무 할당</CardTitle>
          </CardHeader>
          <CardContent>
            <TaskRegistrationForm
              s3UpdateId={id ?? undefined}
              initialTitle={s3Update.file_name}
              onSuccess={(taskId) => {
                toast({ title: "업무가 등록되었습니다." })
                router.replace(`/admin/cases/${taskId}`)
              }}
              selectedFiles={selectedFiles}
              setSelectedFiles={setSelectedFiles}
              previewContent={
                <FilePreviewSection
                  selectedFile={selectedFile}
                  fileUrl={fileUrl}
                  isLoadingPreview={isLoadingPreview}
                  previewData={previewData && previewData.type !== "text" ? previewData : null}
                />
              }
            >
              <div className="flex flex-col flex-1 overflow-hidden gap-2">
                <div className="flex items-center justify-end gap-2 shrink-0 flex-wrap">
                  {selectedFiles.size > 0 && getSelectedFilesForAssignment().length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="shrink-0"
                      disabled={isDeleting}
                      onClick={() => setIsBulkDeleteDialogOpen(true)}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                      )}
                      <span className="hidden sm:inline ml-2">선택 삭제</span>
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={async () => {
                      await refreshFileList()
                      loadFiles(true, currentPath)
                    }}
                    disabled={isRefreshingFileList || isLoadingSessionFiles}
                  >
                    <RefreshCw
                      className={`h-3 w-3 sm:h-4 sm:w-4 ${isRefreshingFileList || isLoadingSessionFiles ? "animate-spin" : ""}`}
                    />
                    <span className="hidden sm:inline ml-2">새로고침</span>
                  </Button>
                </div>
                <div className="overflow-x-auto overflow-y-visible border rounded-md flex-1 min-h-0">
                  {isLoadingSessionFiles ? (
                    <p className="text-center text-muted-foreground py-8">로딩 중...</p>
                  ) : files.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">현재 세션 버킷에 파일이 없습니다.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 bg-background">
                            {files.length > 0 && (
                              <Checkbox
                                checked={
                                  files.filter((f) => f.fileType !== "folder").length > 0 &&
                                  files.every((f) => f.fileType === "folder" || selectedFiles.has(f.key))
                                }
                                onCheckedChange={(c) => handleSelectAll(!!c)}
                              />
                            )}
                          </TableHead>
                          <TableHead className="w-[40%] bg-background">파일명</TableHead>
                          <TableHead className="w-[15%] bg-background">타입</TableHead>
                          <TableHead className="w-[15%] bg-background">크기</TableHead>
                          <TableHead className="w-[15%] bg-background">업로드일</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentPath && (
                          <TableRow className="cursor-pointer hover:bg-muted/50 bg-muted/30" onClick={handleGoUp}>
                            <TableCell colSpan={5} className="font-medium">
                              <span className="flex items-center gap-2">
                                <ArrowLeft className="h-4 w-4" />
                                뒤로가기
                                <span className="text-xs text-muted-foreground truncate" title={getDisplayPath(currentPath)}>
                                  ({currentPath.split("/").pop() || currentPath})
                                </span>
                              </span>
                            </TableCell>
                          </TableRow>
                        )}
                        {files.map((file, index) => {
                          if (file.fileType === "folder") {
                            return (
                              <TableRow
                                key={index}
                                className="cursor-pointer hover:bg-muted/50 bg-blue-50/50 dark:bg-blue-950/20"
                                onClick={() => handleFolderClick(file.key)}
                              >
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox disabled />
                                </TableCell>
                                <TableCell className="font-medium">
                                  <span className="flex items-center gap-2">
                                    <span className="text-lg">📁</span>
                                    {file.fileName || file.key.split("/").pop() || file.key}
                                  </span>
                                </TableCell>
                                <TableCell className="text-xs">폴더</TableCell>
                                <TableCell>-</TableCell>
                                <TableCell>-</TableCell>
                              </TableRow>
                            )
                          }
                          return (
                            <TableRow
                              key={index}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                handleToggleFile(file.key, !selectedFiles.has(file.key))
                                handleViewFile(file)
                              }}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedFiles.has(file.key)}
                                  onCheckedChange={(c) => handleToggleFile(file.key, !!c)}
                                />
                              </TableCell>
                              <TableCell className="font-medium break-all">
                                {file.fileName || file.key.split("/").pop() || file.key}
                              </TableCell>
                              <TableCell>
                                <span className="text-xs">
                                  {getFileType(file) === "excel"
                                    ? "Excel"
                                    : getFileType(file) === "pdf"
                                      ? "PDF"
                                      : getFileType(file) === "dicom"
                                        ? "DICOM"
                                        : "기타"}
                                </span>
                              </TableCell>
                              <TableCell>{formatFileSize(file.size)}</TableCell>
                              <TableCell>
                                {new Date(file.lastModified).toLocaleDateString("ko-KR", {
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
                {(() => {
                  const selectedExceptS3 = Array.from(selectedFiles).filter((key) => key !== s3Key)
                  if (selectedExceptS3.length === 0) return null
                  return (
                    <div className="space-y-1.5 shrink-0 mt-2">
                      <p className="text-xs font-medium text-muted-foreground">선택한 항목 ({selectedExceptS3.length}개)</p>
                      <div className="text-xs text-muted-foreground border rounded-md p-2 max-h-[120px] overflow-y-auto space-y-1">
                        {selectedExceptS3.slice(0, 50).map((key) => {
                          const displayName =
                            allFiles.find((f) => f.key === key)?.fileName ?? key.split("/").pop() ?? key
                          return (
                            <div key={key} className="truncate" title={key}>
                              {displayName}
                            </div>
                          )
                        })}
                        {selectedExceptS3.length > 50 && (
                          <div className="text-muted-foreground/80">... 외 {selectedExceptS3.length - 50}개</div>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </TaskRegistrationForm>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택 항목 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {getSelectedFilesForAssignment().length}개 파일/폴더를 삭제하시겠습니까? 폴더는 그 안의 모든 파일이 함께 삭제되며, 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const items = getSelectedFilesForAssignment()
                deleteSelectedItems(items)
                setIsBulkDeleteDialogOpen(false)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
