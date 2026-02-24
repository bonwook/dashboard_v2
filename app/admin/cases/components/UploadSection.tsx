"use client"

import type React from "react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { Upload, FileUp, FolderUp } from "lucide-react"
import { uploadWithProgress } from "@/lib/utils/upload-with-progress"

const FILE_INPUT_ID = "datalistFileUpload"
const FOLDER_INPUT_ID = "datalistFolderUpload"

function detectFileType(fileName: string): string {
  const fileNameLower = fileName.toLowerCase()
  const extension = fileNameLower.split(".").pop()
  if (!extension) return "other"
  if (fileNameLower.endsWith(".nii.gz")) return "nifti"
  if (["xlsx", "xls", "csv"].includes(extension)) return "excel"
  if (extension === "pdf") return "pdf"
  if (["dcm", "dicom"].includes(extension)) return "dicom"
  if (["nii", "nifti"].includes(extension)) return "nifti"
  if (extension === "zip" || extension === "7z") return "zip"
  return "other"
}

const MAX_FILE_SIZE = 500 * 1024 * 1024
const MAX_FOLDER_SIZE = 5 * 1024 * 1024 * 1024

export interface UploadSectionProps {
  onSuccess?: () => void
  onUploadStart?: () => void
  onProgress?: (percent: number) => void
  onUploadEnd?: () => void
}

export function UploadSection({
  onSuccess,
  onUploadStart,
  onProgress,
  onUploadEnd,
}: UploadSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [errorOpen, setErrorOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const { toast } = useToast()

  const doFileUpload = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "파일 크기 초과",
        description: `최대 500MB (현재: ${(file.size / 1024 / 1024).toFixed(2)}MB)`,
        variant: "destructive",
      })
      return
    }
    setDropdownOpen(false)
    setLoading(true)
    onUploadStart?.()
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("fileType", detectFileType(file.name))
      const data = await uploadWithProgress<{ count?: number; fileId?: string }>({
        url: "/api/storage/upload",
        formData,
        withCredentials: true,
        onProgress: (p) => onProgress?.(p.percent),
      })
      const count = data.count ?? (data.fileId ? 1 : 0)
      toast({ title: "업로드 완료", description: `${count}개 파일이 S3에 업로드되었습니다.` })
      onSuccess?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "업로드에 실패했습니다."
      setErrorMessage(msg)
      setErrorOpen(true)
    } finally {
      setLoading(false)
      onUploadEnd?.()
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const doMultipleUpload = async (files: File[]) => {
    const totalSize = files.reduce((s, f) => s + f.size, 0)
    if (totalSize > MAX_FOLDER_SIZE) {
      toast({
        title: "용량 초과",
        description: `최대 5GB (현재: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)}GB)`,
        variant: "destructive",
      })
      return
    }
    const oversized = files.filter((f) => f.size > MAX_FILE_SIZE)
    if (oversized.length > 0) {
      toast({
        title: "파일 크기 초과",
        description: `500MB 초과 파일 ${oversized.length}개`,
        variant: "destructive",
      })
      return
    }
    const firstFile = files[0] as File & { webkitRelativePath?: string }
    const folderName = firstFile?.webkitRelativePath
      ? firstFile.webkitRelativePath.split("/").slice(0, -1).join("/").split(/[/\\]/).pop() || "upload"
      : "upload"

    setDropdownOpen(false)
    setLoading(true)
    onUploadStart?.()
    try {
      const formData = new FormData()
      files.forEach((file) => formData.append("files", file))
      formData.append("folderName", folderName)
      const data = await uploadWithProgress<{ count?: number }>({
        url: "/api/storage/upload",
        formData,
        withCredentials: true,
        onProgress: (p) => onProgress?.(p.percent),
      })
      const count = data.count ?? files.length
      toast({ title: "업로드 완료", description: `${count}개 파일이 S3에 업로드되었습니다.` })
      onSuccess?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "업로드에 실패했습니다."
      setErrorMessage(msg)
      setErrorOpen(true)
    } finally {
      setLoading(false)
      onUploadEnd?.()
      if (fileInputRef.current) fileInputRef.current.value = ""
      if (folderInputRef.current) folderInputRef.current.value = ""
    }
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    if (files.length === 1) {
      doFileUpload(files[0])
    } else {
      doMultipleUpload(files)
    }
  }

  const onFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    doMultipleUpload(Array.from(fileList))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          id={FILE_INPUT_ID}
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onFileChange}
          disabled={loading}
        />
        <input
          id={FOLDER_INPUT_ID}
          ref={folderInputRef}
          type="file"
          {...({ webkitdirectory: "", directory: "", multiple: true } as React.InputHTMLAttributes<HTMLInputElement>)}
          className="hidden"
          onChange={onFolderChange}
          disabled={loading}
        />
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={loading}>
              <Upload className="mr-1.5 h-4 w-4" />
              S3 업로드
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              disabled={loading}
              onSelect={(e) => {
                e.preventDefault()
                fileInputRef.current?.click()
              }}
            >
              <FileUp className="mr-2 h-4 w-4" />
              파일 선택
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={loading}
              onSelect={(e) => {
                e.preventDefault()
                folderInputRef.current?.click()
              }}
            >
              <FolderUp className="mr-2 h-4 w-4" />
              폴더 선택
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={errorOpen} onOpenChange={setErrorOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업로드 실패</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap text-destructive/90">
              {errorMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorOpen(false)}>확인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
