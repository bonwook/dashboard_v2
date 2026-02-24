import { useState, useCallback, Dispatch, SetStateAction } from 'react'
import { S3File, FilePreview } from '../types'
import { getFileType, updateDisplayedFiles } from '../utils/fileUtils'

interface UseFileManagementProps {
  user: any
  toast: any
  allFiles: S3File[]
  setAllFiles: (files: S3File[]) => void
  currentPath: string
  selectedFile: S3File | null
  setSelectedFile: (file: S3File | null) => void
  setFiles: (files: S3File[]) => void
  selectedFiles: Set<string>
  setSelectedFiles: Dispatch<SetStateAction<Set<string>>>
}

export function useFileManagement(props: UseFileManagementProps) {
  const {
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
  } = props

  const [isLoading, setIsLoading] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<FilePreview>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<S3File | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState(0)
  const [deleteAbortController, setDeleteAbortController] = useState<AbortController | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractProgress, setExtractProgress] = useState(0)
  const [extractInfo, setExtractInfo] = useState<{
    extractedCount: number
    totalFiles: number
    extractedSize: number
    totalSize: number
    message: string
  } | null>(null)
  const [extractAbortController, setExtractAbortController] = useState<AbortController | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<{ fileName: string; progress: number } | null>(null)
  const [isDownloadingZip, setIsDownloadingZip] = useState(false)

  const loadFiles = useCallback(async (force = false, targetPath?: string) => {
    if (!user && !force) return

    setIsLoading(true)
    
    try {
      const apiUrl = `/api/storage/files`
      
      const response = await fetch(apiUrl, {
        method: "GET",
        credentials: "include",
      })
      
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        const errMsg = (errBody as { error?: string })?.error || `${response.status} ${response.statusText}`
        throw new Error(errMsg)
      }

      const data = await response.json()
      const filesToSet = data.files || []
      
      const pathToUse = targetPath !== undefined ? targetPath : currentPath
      
      setAllFiles(filesToSet)
      updateDisplayedFiles(filesToSet, pathToUse, setFiles)
    } catch (error: any) {
      console.error("[Analytics] 파일 로드 오류:", error)
      const message = error?.message || "파일 목록을 불러오는데 실패했습니다"
      toast({
        title: "파일 목록 로드 실패",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [user, currentPath, toast, setAllFiles, setFiles])

  const handleViewFile = useCallback(async (file: S3File) => {
    setSelectedFile(file)
    setPreviewData(null)
    setFileUrl(null)
    setIsLoadingPreview(true)
    
    try {
      const fileType = getFileType(file)
      const isExcel = fileType === "excel"
      const isPdf = fileType === "pdf"
      const isDicom = fileType === "dicom"
      const isNifti = file.fileName?.toLowerCase().endsWith('.nii') || file.fileName?.toLowerCase().endsWith('.nii.gz') || file.key.toLowerCase().endsWith('.nii') || file.key.toLowerCase().endsWith('.nii.gz')
      const isImage = fileType === "image"
      const isVideo = fileType === "video"
      const isPpt = fileType === "ppt"
      const isCSV = file.fileName?.toLowerCase().endsWith('.csv') || file.key.toLowerCase().endsWith('.csv')

      if (isExcel || isDicom || isNifti || isCSV) {
        const previewFileType = isCSV ? "csv" : isNifti ? "nifti" : fileType
        const previewResponse = await fetch(
          `/api/storage/preview?key=${encodeURIComponent(file.key)}&fileType=${previewFileType}`
        )
        
        if (previewResponse.ok) {
          const previewResult = await previewResponse.json()
          setPreviewData(previewResult)
        } else {
          console.error("Failed to load preview data")
          const errorData = await previewResponse.json().catch(() => ({}))
          toast({
            title: "미리보기 오류",
            description: errorData.error || "파일 미리보기를 불러올 수 없습니다",
            variant: "destructive",
          })
        }
      }

      if (isPdf || isImage || isVideo || isPpt || (!isExcel && !isDicom && !isNifti && !isCSV)) {
        const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(file.key)}`)
        if (response.ok) {
          const data = await response.json()
          setFileUrl(data.signedUrl)
        }
      }
    } catch (error) {
      console.error("Error getting file URL:", error)
      toast({
        title: "Error",
        description: "파일을 불러오는데 실패했습니다",
        variant: "destructive",
      })
    } finally {
      setIsLoadingPreview(false)
    }
  }, [setSelectedFile, toast])

  const handleDeleteFile = useCallback((file: S3File) => {
    setFileToDelete(file)
    setIsDeleteDialogOpen(true)
  }, [])

  const handleExtractZip = useCallback(async (file: S3File, zipPassword?: string) => {
    setIsExtracting(true)
    setExtractProgress(0)
    setExtractInfo(null)
    
    const abortController = new AbortController()
    setExtractAbortController(abortController)
    
    try {
      const response = await fetch("/api/storage/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        signal: abortController.signal,
        body: JSON.stringify({
          zipKey: file.key,
          targetPath: currentPath,
          ...(zipPassword ? { zipPassword } : {}),
        }),
      })

      if (!response.ok) {
        let errorMessage = "압축 해제에 실패했습니다"
        try {
          const text = await response.text()
          const errData = text ? JSON.parse(text) : {}
          if (errData?.error) errorMessage = errData.error
          else if (text) errorMessage = text.slice(0, 200)
        } catch {
          // 파싱 실패 시 기본 메시지 유지
        }
        throw new Error(errorMessage)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error("응답을 읽을 수 없습니다")
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          
          try {
            const data = JSON.parse(line)
            
            if (data.type === 'progress') {
              setExtractProgress(data.progress)
              setExtractInfo({
                extractedCount: data.extractedCount || 0,
                totalFiles: data.totalFiles || 0,
                extractedSize: data.extractedSize || 0,
                totalSize: data.totalSize || 0,
                message: data.message || ''
              })
            } else if (data.type === 'complete') {
              setExtractProgress(100)
              setExtractInfo({
                extractedCount: data.extractedCount || 0,
                totalFiles: data.totalFiles || 0,
                extractedSize: data.extractedSize || 0,
                totalSize: data.totalSize || 0,
                message: data.message || ''
              })
              toast({
                title: "압축 해제 완료",
                description: data.message,
              })
              await new Promise((r) => setTimeout(r, 800))
              await loadFiles(true, currentPath)
            } else if (data.type === 'error') {
              const err = new Error(data.error) as Error & { code?: string }
              if (data.code) err.code = data.code
              throw err
            }
          } catch (parseError) {
            console.error("JSON 파싱 오류:", parseError)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        toast({
          title: "취소됨",
          description: "압축 해제가 취소되었습니다",
        })
      } else if ((error as Error & { code?: string }).code === 'ZIP_MISSING_PASSWORD') {
        throw error
      } else {
        toast({
          title: "오류",
          description: error instanceof Error ? error.message : "압축 해제에 실패했습니다",
          variant: "destructive",
        })
      }
    } finally {
      setIsExtracting(false)
      setExtractProgress(0)
      setExtractInfo(null)
      setExtractAbortController(null)
    }
  }, [toast, loadFiles, currentPath])

  const cancelExtract = useCallback(() => {
    if (extractAbortController) {
      extractAbortController.abort()
      setExtractAbortController(null)
    }
    setIsExtracting(false)
    setExtractProgress(0)
    setExtractInfo(null)
  }, [extractAbortController])

  const confirmDeleteFile = useCallback(async () => {
    if (!fileToDelete) return

    setIsDeleting(true)
    setDeleteProgress(0)
    
    const abortController = new AbortController()
    setDeleteAbortController(abortController)
    
    try {
      const isFolder = fileToDelete.fileType === 'folder'
      const response = await fetch(`/api/storage/delete?key=${encodeURIComponent(fileToDelete.key)}&isFolder=${isFolder}`, {
        method: "DELETE",
        credentials: "include",
        signal: abortController.signal,
      })

      if (!response.ok) {
        throw new Error(isFolder ? "폴더 삭제에 실패했습니다" : "파일 삭제에 실패했습니다")
      }

      if (isFolder) {
        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error("응답을 읽을 수 없습니다")
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue
            
            try {
              const data = JSON.parse(line)
              
              if (data.type === 'progress') {
                setDeleteProgress(data.progress)
              } else if (data.type === 'complete') {
                setDeleteProgress(100)
                toast({
                  title: "성공",
                  description: data.message,
                })
                await loadFiles(true)
                
                if (selectedFile?.key === fileToDelete.key) {
                  setSelectedFile(null)
                  setPreviewData(null)
                  setFileUrl(null)
                }
                
                const deletedKey = fileToDelete.key
                const isFolder = fileToDelete.fileType === 'folder'
                
                setSelectedFiles((prev) => {
                  const newSet = new Set<string>(prev)
                  newSet.delete(deletedKey)
                  
                  if (isFolder) {
                    const folderPrefix = deletedKey.endsWith('/') ? deletedKey : `${deletedKey}/`
                    Array.from(newSet).forEach((key) => {
                      if (key.startsWith(folderPrefix)) {
                        newSet.delete(key)
                      }
                    })
                  }
                  
                  return newSet
                })
                
                setIsDeleteDialogOpen(false)
                setFileToDelete(null)
              } else if (data.type === 'error') {
                throw new Error(data.error)
              }
            } catch (parseError) {
              console.error("JSON 파싱 오류:", parseError)
            }
          }
        }
      } else {
        const data = await response.json()
        
        toast({
          title: "성공",
          description: data.message || "파일이 삭제되었습니다",
        })

        await loadFiles(true)

        if (selectedFile?.key === fileToDelete.key) {
          setSelectedFile(null)
          setPreviewData(null)
          setFileUrl(null)
        }

        if (selectedFiles.has(fileToDelete.key)) {
          setSelectedFiles((prev) => {
            const newSet = new Set<string>(prev)
            newSet.delete(fileToDelete.key)
            return newSet
          })
        }

        setIsDeleteDialogOpen(false)
        setFileToDelete(null)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        toast({
          title: "취소됨",
          description: "삭제가 취소되었습니다",
        })
      } else {
        toast({
          title: "오류",
          description: error instanceof Error ? error.message : "삭제에 실패했습니다",
          variant: "destructive",
        })
      }
    } finally {
      setIsDeleting(false)
      setDeleteProgress(0)
      setDeleteAbortController(null)
    }
  }, [fileToDelete, toast, loadFiles, selectedFile, selectedFiles, setSelectedFile, setSelectedFiles])

  const cancelDelete = useCallback(() => {
    if (deleteAbortController) {
      deleteAbortController.abort()
      setDeleteAbortController(null)
    }
    setIsDeleteDialogOpen(false)
    setFileToDelete(null)
    setIsDeleting(false)
    setDeleteProgress(0)
  }, [deleteAbortController])

  /** 다중 선택 삭제: 선택된 항목들을 순서대로 삭제 */
  const deleteSelectedItems = useCallback(async (items: S3File[]) => {
    if (items.length === 0) return

    setIsDeleting(true)
    setDeleteProgress(0)
    const total = items.length
    const deletedKeys = new Set<string>()

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const isFolder = item.fileType === "folder"
        const response = await fetch(
          `/api/storage/delete?key=${encodeURIComponent(item.key)}&isFolder=${isFolder}`,
          { method: "DELETE", credentials: "include" }
        )
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err?.error ?? (isFolder ? "폴더 삭제 실패" : "파일 삭제 실패"))
        }
        if (isFolder) {
          const reader = response.body?.getReader()
          if (reader) {
            const decoder = new TextDecoder()
            let buffer = ""
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
            }
          }
        } else {
          await response.json()
        }
        deletedKeys.add(item.key)
        if (item.fileType === "folder") {
          const prefix = item.key.endsWith("/") ? item.key : `${item.key}/`
          items.forEach((f) => {
            if (f.key.startsWith(prefix)) deletedKeys.add(f.key)
          })
        }
        setDeleteProgress(Math.round(((i + 1) / total) * 100))
      }

      await loadFiles(true)
      if (selectedFile && deletedKeys.has(selectedFile.key)) {
        setSelectedFile(null)
        setPreviewData(null)
        setFileUrl(null)
      }
      setSelectedFiles((prev) => {
        const next = new Set(prev)
        deletedKeys.forEach((k) => next.delete(k))
        prev.forEach((k) => {
          if (Array.from(deletedKeys).some((d) => d !== k && (k.startsWith(d + "/") || k.startsWith(d)))) {
            next.delete(k)
          }
        })
        return next
      })
      toast({
        title: "삭제 완료",
        description: `${items.length}개 항목이 삭제되었습니다.`,
      })
    } catch (error) {
      toast({
        title: "삭제 실패",
        description: error instanceof Error ? error.message : "선택 항목 삭제에 실패했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setDeleteProgress(0)
    }
  }, [loadFiles, selectedFile, setSelectedFile, setSelectedFiles, toast])

  const handleDownloadFile = useCallback(async (file: S3File) => {
    try {
      const fileName = file.fileName || file.key.split("/").pop() || "download"
      setDownloadProgress({ fileName, progress: 0 })

      const downloadResponse = await fetch(
        `/api/storage/download?path=${encodeURIComponent(file.key)}`,
        { credentials: "include" }
      )

      if (!downloadResponse.ok) {
        const errorData = await downloadResponse.json().catch(() => ({}))
        const errorMessage = errorData.error || "다운로드 실패"
        if (downloadResponse.status === 404) {
          throw new Error("파일이 존재하지 않습니다.")
        }
        if (downloadResponse.status === 403) {
          throw new Error("다운로드 권한이 없습니다.")
        }
        throw new Error(errorMessage)
      }

      const contentLength = downloadResponse.headers.get("content-length")
      const total = contentLength ? parseInt(contentLength, 10) : 0

      if (!downloadResponse.body) {
        throw new Error("Response body가 없습니다")
      }

      const reader = downloadResponse.body.getReader()
      const chunks: Uint8Array[] = []
      let receivedLength = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        receivedLength += value.length
        if (total > 0) {
          const progress = Math.round((receivedLength / total) * 100)
          setDownloadProgress({ fileName, progress })
        }
      }

      const allChunks = new Uint8Array(receivedLength)
      let position = 0
      for (const chunk of chunks) {
        allChunks.set(chunk, position)
        position += chunk.length
      }

      const blob = new Blob([allChunks])
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        setDownloadProgress(null)
      }, 100)

      toast({
        title: "Success",
        description: "파일이 다운로드되었습니다",
      })
    } catch (error) {
      console.error("파일 다운로드 오류:", error)
      setDownloadProgress(null)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "파일 다운로드에 실패했습니다",
        variant: "destructive",
      })
    }
  }, [toast])

  const handleDownloadZip = useCallback(async (getSelectedFileKeys: () => Promise<string[]>, getSelectedFilesForAssignment: () => S3File[]) => {
    const selectedItems = getSelectedFilesForAssignment()
    if (selectedItems.length === 0) {
      toast({
        title: "파일 선택 필요",
        description: "다운로드할 파일 또는 폴더를 선택해주세요.",
        variant: "destructive",
      })
      return
    }

    setIsDownloadingZip(true)
    try {
      const fileKeys = await getSelectedFileKeys()
      
      if (fileKeys.length === 0) {
        toast({
          title: "다운로드할 파일 없음",
          description: "선택한 폴더에 파일이 없습니다.",
          variant: "destructive",
        })
        setIsDownloadingZip(false)
        return
      }

      const response = await fetch("/api/storage/download-zip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileKeys: fileKeys,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "압축 다운로드 실패")
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `files-${Date.now()}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: "다운로드 완료",
        description: `${fileKeys.length}개의 파일이 압축되어 다운로드되었습니다.`,
      })
    } catch (error: any) {
      toast({
        title: "다운로드 실패",
        description: error.message || "파일 다운로드 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsDownloadingZip(false)
    }
  }, [toast])

  return {
    isLoading,
    fileUrl,
    setFileUrl,
    previewData,
    setPreviewData,
    isLoadingPreview,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    fileToDelete,
    setFileToDelete,
    isDeleting,
    deleteProgress,
    isExtracting,
    extractProgress,
    extractInfo,
    downloadProgress,
    isDownloadingZip,
    loadFiles,
    handleViewFile,
    handleDeleteFile,
    handleExtractZip,
    cancelExtract,
    confirmDeleteFile,
    cancelDelete,
    deleteSelectedItems,
    handleDownloadFile,
    handleDownloadZip,
  }
}
