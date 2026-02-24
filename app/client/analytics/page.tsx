"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, FileSpreadsheet, Eye, RefreshCw, Loader2, ArrowLeft, UserPlus, Archive, Trash2, Upload, Search, Bold, Italic, Underline, Minus, Grid3x3 as TableIcon } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { uploadWithProgress } from "@/lib/utils/upload-with-progress"
import { getFileType, getFileTypeIcon, formatFileSize, getDisplayPath } from "@/app/admin/analytics/utils/fileUtils"
import type { S3File } from "@/app/admin/analytics/types"

interface ExcelPreview {
  type: "excel" | "csv"
  headers: string[]
  data: any[]
  totalRows: number
}

interface DicomPreview {
  type: "dicom"
  metadata: Record<string, any>
  hasImage: boolean
  imageDataUrl: string | null
}

interface NiftiPreview {
  type: "nifti"
  metadata: Record<string, any>
}

export default function ClientAnalyticsPage() {
  const [allFiles, setAllFiles] = useState<S3File[]>([]) // 전체 파일 목록
  const [files, setFiles] = useState<S3File[]>([]) // 현재 표시할 파일 목록
  const [currentPath, setCurrentPath] = useState<string>("") // 현재 폴더 경로
  const [isLoading, setIsLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<S3File | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<ExcelPreview | DicomPreview | NiftiPreview | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set()) // 체크된 파일들의 key Set
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; email: string; organization?: string }>>([])
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set()) // 체크된 사용자들의 ID Set
  const [isAssigning, setIsAssigning] = useState(false)
  const [isDownloadingZip, setIsDownloadingZip] = useState(false)
  const [isDownloadLinksDialogOpen, setIsDownloadLinksDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<S3File | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isAssignConfirmDialogOpen, setIsAssignConfirmDialogOpen] = useState(false)
  const [downloadLinks, setDownloadLinks] = useState<Array<{ fileName: string; url: string; expiresAt: Date }>>([])
  const [downloadProgress, setDownloadProgress] = useState<{ fileName: string; progress: number } | null>(null)
  const [assignForm, setAssignForm] = useState({
    title: "",
    content: "",
    priority: "medium",
    description: "",
  })
  const [userSearchQuery, setUserSearchQuery] = useState("") // 사용자 검색 쿼리
  const [editorState, setEditorState] = useState({
    bold: false,
    italic: false,
    underline: false,
  })
  const [tableGridHover, setTableGridHover] = useState({ row: 0, col: 0, show: false })
  
  // contentEditable 초기값 설정
  useEffect(() => {
    const editor = document.getElementById('assign-content')
    if (editor && assignForm.content && !editor.innerHTML) {
      editor.innerHTML = assignForm.content
    }
  }, [])
  
  // 에디터 상태 업데이트 함수
  const updateEditorState = () => {
    const editor = document.getElementById('assign-content')
    if (editor) {
      setEditorState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      })
    }
  }
  
  // 테이블 리사이즈 핸들러 추가 함수
  const addResizeHandlersToTable = (table: HTMLTableElement) => {
    const editor = document.getElementById('assign-content')
    if (!editor) return
    
    const rows = table.querySelectorAll('tr')
    rows.forEach((row) => {
      const cells = row.querySelectorAll('td')
      cells.forEach((cell) => {
        // 기존 핸들러 제거
        const existingHandle = cell.querySelector('[data-resize-handle]')
        if (existingHandle) {
          existingHandle.remove()
        }
        
        // 셀 우측 리사이즈 핸들
        const resizeHandle = document.createElement('div')
        resizeHandle.setAttribute('data-resize-handle', 'true')
        resizeHandle.style.position = 'absolute'
        resizeHandle.style.right = '-4px'
        resizeHandle.style.top = '0'
        resizeHandle.style.width = '8px'
        resizeHandle.style.height = '100%'
        resizeHandle.style.cursor = 'col-resize'
        resizeHandle.style.backgroundColor = 'transparent'
        resizeHandle.style.zIndex = '10'
        resizeHandle.style.userSelect = 'none'
        
        cell.style.position = 'relative'
        
        let isResizing = false
        let startX = 0
        let startWidth = 0
        
        resizeHandle.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
          isResizing = true
          startX = e.clientX
          startWidth = cell.offsetWidth
          
          // 같은 열의 모든 셀 찾기
          const cellIndex = Array.from(row.children).indexOf(cell)
          const allCellsInColumn = Array.from(table.querySelectorAll('tr')).map(
            (row) => row.children[cellIndex] as HTMLElement
          )
          
          const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return
            const diff = e.clientX - startX
            const newWidth = Math.max(50, startWidth + diff)
            // 같은 열의 모든 셀에 동일한 너비 적용
            allCellsInColumn.forEach((colCell) => {
              if (colCell) {
                colCell.style.width = `${newWidth}px`
              }
            })
          }
          
          const handleMouseUp = () => {
            isResizing = false
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
            const html = editor.innerHTML
            setAssignForm({ ...assignForm, content: html })
          }
          
          document.addEventListener('mousemove', handleMouseMove)
          document.addEventListener('mouseup', handleMouseUp)
        })
        
        cell.appendChild(resizeHandle)
      })
    })
  }
  
  // 테이블 생성 함수
  const createTable = (rows: number, cols: number) => {
    const editor = document.getElementById('assign-content')
    if (!editor) return
    
    // 에디터에 포커스 설정
    editor.focus()
    
    const table = document.createElement('table')
    table.style.borderCollapse = 'collapse'
    table.style.width = '100%'
    table.style.margin = '10px 0'
    table.style.border = '2px solid #6b7280'
    table.style.position = 'relative'
    table.style.tableLayout = 'fixed' // 테이블 레이아웃 고정
    table.setAttribute('data-resizable', 'true')
    
    // 각 열의 초기 너비 계산 (100%를 열 개수로 나눔)
    const columnWidth = `${100 / cols}%`
    
    for (let i = 0; i < rows; i++) {
      const row = document.createElement('tr')
      for (let j = 0; j < cols; j++) {
        const cell = document.createElement('td')
        cell.style.border = '2px solid #6b7280'
        cell.style.padding = '8px'
        cell.style.width = columnWidth // 고정 너비 설정
        cell.style.minWidth = '50px'
        cell.style.position = 'relative'
        cell.contentEditable = 'true'
        cell.innerHTML = '&nbsp;'
        row.appendChild(cell)
      }
      table.appendChild(row)
    }
    
    // 에디터 내부에만 테이블 삽입
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      // 선택 범위가 에디터 내부에 있는지 확인
      if (editor.contains(range.commonAncestorContainer) || range.commonAncestorContainer === editor) {
        range.deleteContents()
        range.insertNode(table)
        range.setStartAfter(table)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      } else {
        // 선택 범위가 에디터 외부에 있으면 에디터 끝에 추가
        const range = document.createRange()
        range.selectNodeContents(editor)
        range.collapse(false)
        range.insertNode(table)
        range.setStartAfter(table)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    } else {
      // 선택이 없으면 에디터 끝에 추가
      editor.appendChild(table)
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
    
    // 리사이즈 핸들러 추가
    setTimeout(() => {
      addResizeHandlersToTable(table)
    }, 0)
    
    const html = editor.innerHTML
    setAssignForm({ ...assignForm, content: html })
  }
  
  // Upload 관련 state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [allFolderFiles, setAllFolderFiles] = useState<File[]>([])
  const [folderPath, setFolderPath] = useState<string>("")
  const [folderName, setFolderName] = useState<string>("")
  const [isFolderUpload, setIsFolderUpload] = useState(false)
  const [compressToZip, setCompressToZip] = useState(false)
  const [fileType, setFileType] = useState<"excel" | "pdf" | "dicom" | "nifti" | "other">("excel")
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const { toast } = useToast()

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (res.ok) {
          const me = await res.json()
          setUser(me)
        }
      } catch (error) {
        console.error("[Analytics] 사용자 로드 오류:", error)
        if (error instanceof Error) {
          console.error("[Analytics] 오류 메시지:", error.message)
          console.error("[Analytics] 오류 스택:", error.stack)
        }
      }
    }
    loadUser()
  }, [])

  const loadFiles = async (force = false, targetPath?: string) => {
    // user가 없어도 API는 토큰으로 인증하므로 시도 (force일 때는 무조건 시도)
    if (!user && !force) {
      return
    }

    setIsLoading(true)
    
    try {
      // 파일 타입 필터링 제거 - 모든 파일 타입 표시
      const apiUrl = `/api/storage/files`
      
      const response = await fetch(apiUrl, {
        method: "GET",
        credentials: "include", // 쿠키 포함
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error("[Analytics] API 응답 실패:", response.status)
        console.error("[Analytics] API 오류 내용:", errorText)
        
        try {
          const errorData = JSON.parse(errorText)
          console.error("[Analytics] API 오류 데이터:", errorData)
        } catch {
          console.error("[Analytics] API 오류는 JSON이 아님")
        }
        
        throw new Error(`Failed to load files: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const filesToSet = data.files || []
      
      // targetPath가 제공되면 그것을 사용, 아니면 currentPath 사용
      const pathToUse = targetPath !== undefined ? targetPath : currentPath
      
      setAllFiles(filesToSet) // 전체 파일 목록 저장
      updateDisplayedFiles(filesToSet, pathToUse) // 현재 경로에 맞게 필터링
    } catch (error) {
      console.error("[Analytics] 파일 로드 오류:", error)
      if (error instanceof Error) {
        console.error("[Analytics] Error message:", error.message)
        console.error("[Analytics] Error stack:", error.stack)
      }
      toast({
        title: "Error",
        description: "파일 목록을 불러오는데 실패했습니다",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      loadFiles()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // currentPath 변경 시 파일 목록 업데이트
  useEffect(() => {
    if (allFiles.length > 0) {
      updateDisplayedFiles(allFiles, currentPath)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath])

  // 자동 새로고침 제거 (사용자 요청)

  const handleViewFile = async (file: S3File) => {
    setSelectedFile(file)
    setPreviewData(null)
    setFileUrl(null)
    setIsLoadingPreview(true)
    
    try {
      // 파일 타입 확인
      const fileType = getFileType(file)
      const isExcel = fileType === "excel"
      const isPdf = fileType === "pdf"
      const isDicom = fileType === "dicom"
      const isNifti = file.fileName?.toLowerCase().endsWith('.nii') || file.fileName?.toLowerCase().endsWith('.nii.gz') || file.key.toLowerCase().endsWith('.nii') || file.key.toLowerCase().endsWith('.nii.gz')
      const isImage = fileType === "image"
      const isVideo = fileType === "video"
      const isPpt = fileType === "ppt"
      const isCSV = file.fileName?.toLowerCase().endsWith('.csv') || file.key.toLowerCase().endsWith('.csv')

      // CSV와 Excel 모두 Excel 타입으로 처리
      if (isExcel || isDicom || isNifti || isCSV) {
        // Excel, CSV, DICOM 또는 NIFTI 미리보기 데이터 가져오기
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

      // PDF, 이미지, 동영상, PPT는 signed URL 가져오기
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
  }

  const handleDeleteFile = async (file: S3File) => {
    setFileToDelete(file)
    setIsDeleteDialogOpen(true)
  }

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/storage/delete?key=${encodeURIComponent(fileToDelete.key)}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "파일 삭제에 실패했습니다")
      }

      toast({
        title: "성공",
        description: "파일이 삭제되었습니다",
      })

      // 파일 목록 새로고침
      await loadFiles()

      // 삭제된 파일이 현재 선택된 파일이면 선택 해제
      if (selectedFile?.key === fileToDelete.key) {
        setSelectedFile(null)
        setPreviewData(null)
        setFileUrl(null)
      }

      // 삭제된 파일을 체크박스 선택 목록에서 제거
      if (selectedFiles.has(fileToDelete.key)) {
        setSelectedFiles(prev => {
          const newSet = new Set(prev)
          newSet.delete(fileToDelete.key)
          return newSet
        })
      }

      setIsDeleteDialogOpen(false)
      setFileToDelete(null)
    } catch (error) {
      console.error("Error deleting file:", error)
      toast({
        title: "오류",
        description: error instanceof Error ? error.message : "파일 삭제에 실패했습니다",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDownloadFile = async (file: S3File) => {
    try {
      const fileName = file.fileName ||
        (typeof file.key === "string" ? file.key.split("/").pop() : null) ||
        "download"
      setDownloadProgress({ fileName, progress: 0 })

      const downloadResponse = await fetch(
        `/api/storage/download?path=${encodeURIComponent(file.key)}`,
        { credentials: "include" }
      )

      if (!downloadResponse.ok) {
        const errorData = await downloadResponse.json().catch(() => ({}))
        const errorMessage = errorData.error || "다운로드 실패"
        if (downloadResponse.status === 404) throw new Error("파일이 존재하지 않습니다.")
        if (downloadResponse.status === 403) throw new Error("다운로드 권한이 없습니다.")
        throw new Error(errorMessage)
      }

      const contentLength = downloadResponse.headers.get("content-length")
      const total = contentLength ? parseInt(contentLength, 10) : 0
      if (!downloadResponse.body) throw new Error("Response body가 없습니다")

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
  }


  // 폴더와 파일을 분리하고 현재 경로에 맞게 필터링
  const updateDisplayedFiles = (fileList: S3File[], path: string) => {
    // 폴더와 파일 분리
    const folders = new Set<string>()
    const filesInFolder: S3File[] = []

    fileList.forEach(file => {
      if (!file.folderPath) {
        // folderPath가 없으면 루트 레벨 파일
        if (!path) {
          filesInFolder.push(file)
        }
      } else {
        if (!path) {
          // 루트 레벨: userId 다음의 첫 번째 폴더만 표시 (excel, pdf, dicom 등)
          const folderParts = typeof file.folderPath === 'string' ? file.folderPath.split('/') : []
          if (folderParts.length >= 2) {
            // userId 다음의 첫 번째 폴더만 표시
            // 예: userId/excel/folder1 -> excel 폴더만 표시
            const firstFolder = folderParts.slice(0, 2).join('/')
            folders.add(firstFolder)
          } else if (folderParts.length === 1) {
            // userId만 있는 경우 (폴더가 없음) - 거의 없을 것
            filesInFolder.push(file)
          } else {
            // folderPath가 없는 경우
            filesInFolder.push(file)
          }
        } else {
          // 특정 폴더 내: 현재 경로의 직접 하위 항목만 표시
          // path가 "userId/excel"이면 그 안의 파일/폴더만 표시
          // path가 "userId/excel/folder1"이면 그 안의 파일만 표시
          
          if (file.folderPath === path) {
            // 현재 폴더의 직접 파일
            // 예: path = "userId/excel", file.folderPath = "userId/excel", file.key = "userId/excel/file.xlsx"
            filesInFolder.push(file)
          } else if (file.folderPath.startsWith(path + '/')) {
            // 현재 경로의 하위 항목만 (다른 경로는 제외)
            const relativePath = file.folderPath.substring(path.length + 1)
            const relativeParts = typeof relativePath === 'string' ? relativePath.split('/') : []
            
            if (relativeParts.length > 0) {
              const firstPart = relativeParts[0]
              const subFolderPath = `${path}/${firstPart}`
              
              // 현재 경로의 직접 하위 폴더만 표시
              // 예: path = "userId/excel", file.folderPath = "userId/excel/folder1" -> folder1 표시
              // 예: path = "userId/excel", file.folderPath = "userId/excel/folder1/subfolder" -> folder1만 표시
              folders.add(subFolderPath)
            }
          }
          // file.folderPath가 path로 시작하지 않으면 표시하지 않음 (중복 방지)
        }
      }
    })

    // 폴더를 파일 목록에 추가 (가상 폴더 객체)
    const folderItems: S3File[] = Array.from(folders).map(folderPath => {
      // 폴더 이름만 추출 (마지막 부분)
      const folderName = typeof folderPath === 'string' ? 
        (folderPath.split('/').pop() || folderPath) : 
        folderPath
      return {
        key: folderPath,
        size: 0,
        lastModified: new Date(),
        fileName: folderName,
        fileType: 'folder' as any,
        folderPath: path,
      }
    })

    // 정렬: 폴더 우선, 그 다음 파일 (알파벳 순)
    const sorted = [...folderItems, ...filesInFolder].sort((a, b) => {
      // 폴더 우선
      if (a.fileType === 'folder' && b.fileType !== 'folder') return -1
      if (a.fileType !== 'folder' && b.fileType === 'folder') return 1
      
      // 같은 타입이면 알파벳 순으로 정렬
      return (a.fileName || '').localeCompare(b.fileName || '')
    })

    setFiles(sorted)
  }

  // 폴더 클릭 핸들러
  const handleFolderClick = (folderPath: string) => {
    setCurrentPath(folderPath)
    updateDisplayedFiles(allFiles, folderPath)
    setSelectedFile(null) // 폴더 클릭 시 미리보기 초기화
  }

  // 상위 폴더로 이동
  const handleGoUp = () => {
    if (!currentPath) return
    
    const pathParts = typeof currentPath === 'string' ? currentPath.split('/') : []
    pathParts.pop()
    const newPath = pathParts.join('/')
    
    setCurrentPath(newPath)
    updateDisplayedFiles(allFiles, newPath)
    setSelectedFile(null)
  }


  // 체크박스 토글 핸들러
  const handleToggleFile = (fileKey: string, checked: boolean) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(fileKey)
      } else {
        newSet.delete(fileKey)
      }
      return newSet
    })
  }

  // 전체 선택/해제 핸들러 (폴더 포함)
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allKeys = files.map(f => f.key)
      setSelectedFiles(new Set(allKeys))
    } else {
      setSelectedFiles(new Set())
    }
  }

  // 체크된 파일/폴더들 가져오기 (폴더 포함)
  const getSelectedFilesForAssignment = (): S3File[] => {
    // allFiles와 files를 합쳐서 검색 (폴더는 files에만 있을 수 있음)
    const allItems = [...allFiles, ...files]
    // 중복 제거 (key 기준)
    const uniqueItems = new Map<string, S3File>()
    allItems.forEach(item => {
      if (!uniqueItems.has(item.key)) {
        uniqueItems.set(item.key, item)
      }
    })
    return Array.from(uniqueItems.values()).filter(file => selectedFiles.has(file.key))
  }

  // 선택된 항목에서 실제 파일 키 목록 가져오기 (폴더인 경우 내부 파일 포함)
  const getSelectedFileKeys = async (): Promise<string[]> => {
    const selectedItems = getSelectedFilesForAssignment()
    const fileKeys: string[] = []
    
    for (const item of selectedItems) {
      if (item.fileType === 'folder') {
        // 폴더인 경우, 해당 폴더 내의 모든 파일을 재귀적으로 가져오기
        const folderPrefix = item.key.endsWith('/') ? item.key : `${item.key}/`
        // root 폴더(excel, dicom 등)의 경우, 해당 타입의 모든 파일 포함
        const folderFiles = allFiles.filter(f => {
          if (f.fileType === 'folder') return false // 폴더는 제외
          
          // folderPath가 없거나 빈 문자열인 경우도 처리 (root 레벨 파일)
          if (!f.folderPath || f.folderPath === '') {
            // root 레벨 파일 중에서 folderPrefix와 일치하는 경우
            // 예: folderPrefix가 "userId/excel"이면 "userId/excel/file.xlsx" 포함
            return f.key.startsWith(folderPrefix)
          }
          
          // folderPath가 폴더 key와 일치하거나 그 하위인 경우
          // 예: folderPrefix가 "userId/excel"이고 f.folderPath가 "userId/excel" 또는 "userId/excel/subfolder"인 경우
          if (f.folderPath === item.key || f.folderPath.startsWith(folderPrefix)) {
            return true
          }
          
          // key로 시작하는 경우 (일반 폴더)
          return f.key.startsWith(folderPrefix)
        })
        fileKeys.push(...folderFiles.map(f => f.key))
      } else {
        // 파일인 경우 직접 추가
        fileKeys.push(item.key)
      }
    }
    
    return fileKeys
  }

  // 사용자 목록 로드 (모든 사용자)
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const response = await fetch("/api/profiles")
        if (response.ok) {
          const profiles = await response.json()
          const allProfiles = Array.isArray(profiles) ? profiles : []
          // 모든 사용자 표시 (필터링 제거)
          setUsers(allProfiles)
        }
      } catch (error) {
        console.error("[Analytics] 사용자 목록 로드 오류:", error)
      }
    }
    if (user) {
      loadUsers()
    }
  }, [user])

  // 사용자 체크박스 토글 핸들러
  const handleToggleUser = (userId: string, checked: boolean) => {
    setSelectedUserIds(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(userId)
      } else {
        newSet.delete(userId)
      }
      return newSet
    })
  }

  // 업무 등록 핸들러 (실제 등록 수행)
  const handleAssignFiles = async () => {
    if (selectedUserIds.size === 0) {
      toast({
        title: "사용자 선택 필요",
        description: "담당자를 선택해주세요.",
        variant: "destructive",
      })
      return
    }

    if (selectedUserIds.size > 1) {
      toast({
        title: "담당자 제한",
        description: "담당자는 1명만 선택할 수 있습니다.",
        variant: "destructive",
      })
      return
    }

    setIsAssigning(true)
    try {
      const selectedFilesList = getSelectedFilesForAssignment()
      let fileKeys: string[] = []
      
      // 폴더와 파일 분리
      const folders = selectedFilesList.filter(f => f.fileType === 'folder')
      const files = selectedFilesList.filter(f => f.fileType !== 'folder')
      
      // 일반 파일 키 추가
      fileKeys.push(...files.map(f => f.key))
      
      // 폴더가 있으면 각 폴더를 zip으로 압축해서 S3에 업로드
      if (folders.length > 0) {
        toast({
          title: "폴더 압축 중...",
          description: `${folders.length}개의 폴더를 압축하고 있습니다.`,
        })
        
        for (const folder of folders) {
          try {
            // 폴더 내 모든 파일 가져오기
            const folderPrefix = folder.key.endsWith('/') ? folder.key : `${folder.key}/`
            const folderFiles = allFiles.filter(f => {
              if (f.fileType === 'folder') return false
              return f.key.startsWith(folderPrefix)
            })
            
            if (folderFiles.length === 0) {
              continue
            }
            
            // 폴더 내 파일들을 zip으로 압축
            const response = await fetch("/api/storage/download-zip", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
              body: JSON.stringify({
                fileKeys: folderFiles.map(f => f.key)
              }),
            })
            
            if (!response.ok) {
              throw new Error(`폴더 압축 실패: ${folder.key}`)
            }
            
            // zip 파일을 Blob으로 받기
            const zipBlob = await response.blob()
            
            // zip 파일을 S3에 업로드 (temp/ProgressZip/ 경로에 저장)
            const formData = new FormData()
            const folderName = typeof folder.key === 'string' ? 
              (folder.key.split('/').pop() || 'folder') : 
              'folder'
            const timestamp = Date.now()
            const zipFileName = `${folderName}.zip`
            const zipFile = new File([zipBlob], zipFileName, { type: "application/zip" })
            formData.append("file", zipFile)
            formData.append("fileType", "other")
            // temp/ProgressZip 경로에 저장하도록 path 지정 (서버에서 userId 추가)
            // path에 userId를 포함하지 않고, 서버에서 자동으로 추가하도록 함
            formData.append("path", `temp/ProgressZip/${timestamp}-${zipFileName}`)
            formData.append("useProgressZipPath", "true") // ProgressZip 경로 사용 플래그
            
            const uploadData = await uploadWithProgress<any>({
              url: "/api/storage/upload",
              formData,
              withCredentials: true,
              onProgress: (p) => setUploadProgress(p.percent),
            })
            
            // 업로드된 zip 파일의 s3_key 찾기
            // upload API는 { fileId, path } 형식으로 응답하므로 path에서 s3_key 추출
            if (uploadData.fileId) {
              // path는 s3://bucket/key 형식이므로 key 부분만 추출
              const s3Path = uploadData.path || ""
              const s3Key = s3Path.replace(/^s3:\/\/[^\/]+\//, '')
              
              if (s3Key) {
                fileKeys.push(s3Key)
              }
            } else if (uploadData.files && uploadData.files.length > 0) {
              // 폴더 업로드인 경우 files 배열 반환
              const uploadedFile = uploadData.files[0]
              const s3Path = uploadedFile.path || ""
              const s3Key = s3Path.replace(/^s3:\/\/[^\/]+\//, '')
              
              if (s3Key) {
                fileKeys.push(s3Key)
              }
            }
          } catch (error: any) {
            console.error(`[Worklist] 폴더 압축 오류 (${folder.key}):`, error)
            toast({
              title: "폴더 압축 실패",
              description: `폴더 "${folder.key}" 압축 중 오류가 발생했습니다: ${error.message}`,
              variant: "destructive",
            })
          }
        }
      }
      
      const userIds = Array.from(selectedUserIds)

      // 1명만 할당 (기존 로직 유지하되 1명만 처리)
      const results = await Promise.all(
        userIds.slice(0, 1).map(async (userId) => {
          try {
            const requestBody = {
              fileKeys: fileKeys,
              assignedTo: userId,
              title: assignForm.title,
              content: assignForm.content || "",
              priority: assignForm.priority,
            }
            
            const response = await fetch("/api/storage/assign", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requestBody),
            })

            if (!response.ok) {
              let errorMessage = "업무 등록 실패"
              try {
                const errorData = await response.json()
                errorMessage = errorData.error || errorMessage
              } catch (e) {
                const errorText = await response.text()
                errorMessage = `HTTP ${response.status}: ${errorText || errorMessage}`
              }
              throw new Error(errorMessage)
            }

            const responseData = await response.json()

            return { userId, success: true, taskId: responseData.taskId }
          } catch (error: any) {
            return { userId, success: false, error: error.message }
          }
        })
      )

      const successCount = results.filter(r => r.success).length
      const failCount = results.filter(r => !r.success).length

      if (successCount > 0) {
        // 다운로드 링크는 API에서 본문에 자동으로 추가되므로 클라이언트에서 별도 처리 불필요
        
        toast({
          title: "업무 등록 완료",
          description: `${fileKeys.length > 0 ? `${fileKeys.length}개의 파일이 포함된 ` : ""}업무가 ${successCount}명의 담당자에게 지정되었습니다.${failCount > 0 ? ` (${failCount}명 실패)` : ""}${fileKeys.length > 0 ? " 첨부파일 링크는 업무 본문에 자동으로 추가되었습니다." : ""}`,
          duration: 5000,
        })
      } else {
        throw new Error("모든 할당이 실패했습니다")
      }

      // 선택 및 폼 초기화
      setSelectedFiles(new Set())
      setSelectedUserIds(new Set())
      setAssignForm({
        title: "",
        content: "",
        priority: "medium",
        description: "",
      })
    } catch (error: any) {
      toast({
        title: "업무 등록 실패",
        description: error.message || "파일 등록 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsAssigning(false)
    }
  }

  // 파일 업로드 핸들러 (upload 페이지에서 복사)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    if (isFolderUpload) {
      const fileArray = Array.from(files)
      const MAX_FOLDER_SIZE = 5 * 1024 * 1024 * 1024
      const totalSize = fileArray.reduce((sum, file) => sum + file.size, 0)
      
      if (totalSize > MAX_FOLDER_SIZE) {
        toast({
          title: "폴더 크기 초과",
          description: `폴더 크기가 5GB를 초과합니다. (현재: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB)`,
          variant: "destructive",
        })
        return
      }
      
      setAllFolderFiles(fileArray)
      
      const firstFile = fileArray[0] as any
      if (firstFile.webkitRelativePath) {
        const pathParts = typeof firstFile.webkitRelativePath === 'string' ? 
          firstFile.webkitRelativePath.split('/') : 
          []
        if (pathParts.length > 1) {
          const fullPath = pathParts.slice(0, -1).join('/')
          setFolderPath(fullPath)
          setFolderName("")
        }
      }

      const allowedExtensions: Record<string, string[]> = {
        excel: ['xlsx', 'xls', 'csv'],
        pdf: ['pdf'],
        dicom: ['dcm', 'dicom'],
        nifti: ['nii', 'nii.gz', 'nifti'],
        other: [],
      }
      
      const extensions = fileType ? allowedExtensions[fileType] || [] : 
        [...allowedExtensions.excel, ...allowedExtensions.pdf, ...allowedExtensions.dicom]

      const checkFileExtension = (fileName: string, allowedExts: string[]): boolean => {
        if (fileType === 'other') {
          return true
        }
        const fileNameLower = fileName.toLowerCase()
        if (fileNameLower.endsWith('.nii.gz')) {
          return allowedExts.includes('nii.gz')
        }
        const extension = fileName.split('.').pop()?.toLowerCase()
        return extension ? allowedExts.includes(extension) : false
      }

      const filteredFiles = fileArray.filter(file => {
        return checkFileExtension(file.name, extensions)
      })

      setUploadedFiles(filteredFiles)
      setUploadedFile(null)
      
      if (filteredFiles.length === 0) {
        toast({
          title: "경고",
          description: `선택한 폴더에 ${fileType} 파일이 없습니다.`,
          variant: "destructive",
        })
        const fileInput = document.getElementById("fileInput") as HTMLInputElement
        if (fileInput) {
          fileInput.value = ""
        }
        setAllFolderFiles([])
        setUploadedFiles([])
        setFolderPath("")
        setFolderName("")
      } else {
        toast({
          title: "폴더 선택됨",
          description: `${filteredFiles.length}개의 ${fileType} 파일이 업로드됩니다`,
        })
      }
    } else {
      const file = files[0]
      setUploadedFile(file)
      setUploadedFiles([])
    }
  }

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!uploadedFile && uploadedFiles.length === 0) {
      toast({
        title: "Error",
        description: "파일을 선택해주세요",
        variant: "destructive",
      })
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      if (isFolderUpload && uploadedFiles.length > 0) {
        if (compressToZip) {
          // 동적 import: JSZip은 사용자가 ZIP 압축 업로드를 선택한 경우에만 로드됨 (53.8 KiB 절약)
          const JSZip = (await import("jszip")).default
          const zip = new JSZip()
          const fileNamesInZip = new Set<string>()
          
          for (const file of uploadedFiles) {
            const fileWithPath = file as any
            const relativePath = fileWithPath.webkitRelativePath || file.name
            const pathParts = typeof relativePath === 'string' ? relativePath.split('/') : []
            let pathWithoutRoot = pathParts.slice(1).join('/') || file.name
            
            if (fileNamesInZip.has(pathWithoutRoot)) {
              const timestamp = Date.now()
              const nameParts = pathWithoutRoot.split('.')
              const ext = nameParts.pop()
              const nameWithoutExt = nameParts.join('.')
              pathWithoutRoot = `${nameWithoutExt}-${timestamp}.${ext || ''}`
            }
            fileNamesInZip.add(pathWithoutRoot)
            
            zip.file(pathWithoutRoot, file)
          }
          
          const zipBlob = await zip.generateAsync({ type: "blob" })
          const zipFileName = (folderName.trim() || (folderPath ? folderPath.split(/[/\\]/).pop() || "folder" : "folder")) + ".zip"
          const zipFile = new File([zipBlob], zipFileName, { type: "application/zip" })
          
          formData.append("file", zipFile)
          formData.append("fileType", "zip")
        } else {
          uploadedFiles.forEach(file => {
            formData.append("files", file)
          })
          const folderNameToSend = folderName.trim() || (folderPath ? folderPath.split(/[/\\]/).pop() || folderPath : "")
          formData.append("folderName", folderNameToSend)
        }
      } else if (uploadedFile) {
        formData.append("file", uploadedFile)
        const fileExtension = uploadedFile.name.split('.').pop()?.toLowerCase()
        if (fileExtension === '7z' || fileExtension === 'zip') {
          formData.append("fileType", "zip")
        } else {
          formData.append("fileType", fileType)
        }
      } else {
        formData.append("fileType", fileType)
      }

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
      setUploadedFile(null)
      setUploadedFiles([])
      setAllFolderFiles([])
      setFolderPath("")
      setFolderName("")
      setFileType("excel")
      setIsFolderUpload(false)
      setCompressToZip(false)
      const fileInput = document.getElementById("fileInput") as HTMLInputElement
      if (fileInput) {
        fileInput.value = ""
      }

      // 파일 목록 새로고침
      await loadFiles(true)
    } catch (error: unknown) {
      console.error("[Upload] Upload error:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "파일 업로드에 실패했습니다",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  // 압축 다운로드 핸들러 (폴더 포함)
  const handleDownloadZip = async () => {
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
      // 선택된 항목의 키 목록 가져오기 (폴더인 경우 내부 파일 포함)
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
  }

  return (
    <div className="relative mx-auto max-w-7xl p-6 w-full overflow-hidden">
      <div className="mb-8">
        <div>
          <h1 className="text-3xl font-bold">Work</h1>
          <p className="text-muted-foreground mt-2">업무를 등록합니다</p>
        </div>
      </div>
      {isUploading && (
        <div className="mb-6">
          <Progress value={uploadProgress} />
        </div>
      )}

      {/* 업무 등록 폼 */}
      <Card className="flex flex-col h-full w-full min-w-0 max-w-full overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle className="text-2xl">업무 등록</CardTitle>
            <CardDescription className="text-base">
              업무 정보를 입력하고 담당자를 선택하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 flex-1 flex flex-col min-w-0 max-w-full overflow-hidden">
            {/* 본문과 담당자 블록 가로 배치 */}
            <div className="grid gap-4 lg:grid-cols-[7fr_3fr] min-w-0 max-w-full">
              <div className="space-y-6 min-w-0 max-w-full">
                <div className="space-y-2 min-w-0 max-w-full">
                  <Label htmlFor="assign-title" className="text-base font-semibold">제목 *</Label>
                  <Input
                    id="assign-title"
                    placeholder="제목을 입력하세요"
                    value={assignForm.title}
                    onChange={(e) => setAssignForm({ ...assignForm, title: e.target.value })}
                    className="text-base h-12 w-full max-w-full min-w-0"
                  />
                </div>
                <div className="space-y-2 min-w-0 max-w-full">
                  <Label htmlFor="assign-priority">중요도</Label>
                  <Select
                    value={assignForm.priority}
                    onValueChange={(value) => setAssignForm({ ...assignForm, priority: value })}
                  >
                    <SelectTrigger id="assign-priority" className="h-auto py-2">
                      {assignForm.priority === "low" && (
                        <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-sm font-medium">낮음</span>
                      )}
                      {assignForm.priority === "medium" && (
                        <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700 text-sm font-medium">보통</span>
                      )}
                      {assignForm.priority === "high" && (
                        <span className="px-2 py-1 rounded bg-orange-100 text-orange-700 text-sm font-medium">높음</span>
                      )}
                      {assignForm.priority === "urgent" && (
                        <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-sm font-medium">긴급</span>
                      )}
                      {!assignForm.priority && (
                        <SelectValue placeholder="선택하세요" />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low" className="cursor-pointer">
                        <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-sm font-medium">낮음</span>
                      </SelectItem>
                      <SelectItem value="medium" className="cursor-pointer">
                        <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700 text-sm font-medium">보통</span>
                      </SelectItem>
                      <SelectItem value="high" className="cursor-pointer">
                        <span className="px-2 py-1 rounded bg-orange-100 text-orange-700 text-sm font-medium">높음</span>
                      </SelectItem>
                      <SelectItem value="urgent" className="cursor-pointer">
                        <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-sm font-medium">긴급</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 min-w-0 max-w-full">
                  <Label htmlFor="assign-content" className="text-base font-semibold">본문</Label>
                {/* 리치 텍스트 에디터 툴바 */}
                <div className="border rounded-md bg-background overflow-hidden">
                  <div className="flex items-center gap-1 p-2 flex-wrap">
                  <Button
                    type="button"
                    variant={editorState.bold ? "secondary" : "ghost"}
                    size="sm"
                    className={`h-8 w-8 p-0 ${editorState.bold ? 'bg-primary/10' : ''}`}
                    onClick={(e) => {
                      e.preventDefault()
                      const editor = document.getElementById('assign-content')
                      if (editor) {
                        editor.focus()
                        document.execCommand('bold', false)
                        updateEditorState()
                      }
                    }}
                    title="굵게 (Ctrl+B)"
                  >
                    <Bold className={`h-4 w-4 ${editorState.bold ? 'text-primary' : ''}`} />
                  </Button>
                  <Button
                    type="button"
                    variant={editorState.italic ? "secondary" : "ghost"}
                    size="sm"
                    className={`h-8 w-8 p-0 ${editorState.italic ? 'bg-primary/10' : ''}`}
                    onClick={(e) => {
                      e.preventDefault()
                      const editor = document.getElementById('assign-content')
                      if (editor) {
                        editor.focus()
                        document.execCommand('italic', false)
                        updateEditorState()
                      }
                    }}
                    title="기울임 (Ctrl+I)"
                  >
                    <Italic className={`h-4 w-4 ${editorState.italic ? 'text-primary' : ''}`} />
                  </Button>
                  <Button
                    type="button"
                    variant={editorState.underline ? "secondary" : "ghost"}
                    size="sm"
                    className={`h-8 w-8 p-0 ${editorState.underline ? 'bg-primary/10' : ''}`}
                    onClick={(e) => {
                      e.preventDefault()
                      const editor = document.getElementById('assign-content')
                      if (editor) {
                        editor.focus()
                        document.execCommand('underline', false)
                        updateEditorState()
                      }
                    }}
                    title="밑줄"
                  >
                    <Underline className={`h-4 w-4 ${editorState.underline ? 'text-primary' : ''}`} />
                  </Button>
                  <div className="w-px h-6 bg-border mx-1" />
                  <div className="relative">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={(e) => {
                        e.preventDefault()
                        if (tableGridHover.show) {
                          setTableGridHover({ row: 0, col: 0, show: false })
                        } else {
                          setTableGridHover({ row: 0, col: 0, show: true })
                        }
                      }}
                      title="테이블"
                    >
                      <TableIcon className="h-4 w-4" />
                    </Button>
                    {tableGridHover.show && (
                      <div 
                        className="absolute top-full left-0 mt-2 bg-background border rounded-lg shadow-xl p-4 z-50 min-w-[280px]"
                        onMouseLeave={() => setTableGridHover({ row: 0, col: 0, show: false })}
                      >
                        <div className="grid grid-cols-10 gap-1 mb-3">
                          {Array.from({ length: 100 }).map((_, idx) => {
                            const row = Math.floor(idx / 10) + 1
                            const col = (idx % 10) + 1
                            const isSelected = row <= tableGridHover.row && col <= tableGridHover.col
                            
                            return (
                              <div
                                key={idx}
                                className={`w-5 h-5 border border-border rounded-sm transition-colors ${
                                  isSelected ? 'bg-primary border-primary' : 'bg-muted hover:bg-muted/80'
                                }`}
                                onMouseEnter={() => {
                                  setTableGridHover({ row, col, show: true })
                                }}
                                onClick={() => {
                                  createTable(row, col)
                                  setTableGridHover({ row: 0, col: 0, show: false })
                                }}
                              />
                            )
                          })}
                        </div>
                        <div className="text-sm text-center font-medium text-foreground border-t pt-2">
                          {tableGridHover.row > 0 && tableGridHover.col > 0 
                            ? `${tableGridHover.row} x ${tableGridHover.col} 테이블`
                            : '테이블 크기 선택'}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="w-px h-6 bg-border mx-1" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.preventDefault()
                      const editor = document.getElementById('assign-content')
                      if (editor) {
                        editor.focus()
                        const hr = document.createElement('hr')
                        hr.style.border = 'none'
                        hr.style.borderTop = '2px solid #6b7280'
                        hr.style.margin = '10px 0'
                        const selection = window.getSelection()
                        if (selection && selection.rangeCount > 0) {
                          const range = selection.getRangeAt(0)
                          range.deleteContents()
                          range.insertNode(hr)
                          range.setStartAfter(hr)
                          range.collapse(true)
                          selection.removeAllRanges()
                          selection.addRange(range)
                        }
                        const html = editor.innerHTML
                        setAssignForm({ ...assignForm, content: html })
                      }
                    }}
                    title="구분선"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  </div>
                  <div
                    id="assign-content"
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => {
                      const html = e.currentTarget.innerHTML
                      setAssignForm({ ...assignForm, content: html })
                      updateEditorState()
                      // 테이블 리사이즈 핸들러 재추가
                      setTimeout(() => {
                        const editor = document.getElementById('assign-content')
                        if (editor) {
                          const tables = editor.querySelectorAll('table[data-resizable="true"]')
                          tables.forEach((table) => {
                            addResizeHandlersToTable(table as HTMLTableElement)
                          })
                        }
                      }, 0)
                    }}
                    onBlur={(e) => {
                      const html = e.currentTarget.innerHTML
                      setAssignForm({ ...assignForm, content: html })
                      updateEditorState()
                    }}
                    onMouseUp={updateEditorState}
                    onKeyUp={updateEditorState}
                    className="resize-none text-base leading-relaxed w-full max-w-full min-w-0 overflow-y-auto border-t p-3 focus:outline-none focus:ring-0 bg-background"
                  style={{ 
                    height: '450px',
                    minHeight: '450px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}
                    data-placeholder="본문을 입력하세요. 위의 아이콘을 사용하여 텍스트를 꾸밀 수 있습니다."
                  />
                  <style jsx global>{`
                    #assign-content:empty:before {
                      content: attr(data-placeholder);
                      color: #9ca3af;
                      pointer-events: none;
                    }
                  `}</style>
                </div>
                </div>
              </div>
              <div className="flex flex-col min-w-0 max-w-full pt-[218px]">
                <div className="relative mb-2 shrink-0">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="사용자 검색..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="pl-8 h-12 text-sm"
                  />
                </div>
                <div className="border rounded-md p-2 overflow-y-auto min-h-0" style={{ height: '444px' }}>
                  {users.length > 0 ? (() => {
                    const filteredUsers = users.filter((u) => {
                      if (!userSearchQuery.trim()) return true
                      const query = userSearchQuery.toLowerCase()
                      return (
                        (u.full_name || "").toLowerCase().includes(query) ||
                        (u.email || "").toLowerCase().includes(query) ||
                        (u.organization || "").toLowerCase().includes(query)
                      )
                    })
                    
                    if (filteredUsers.length === 0 && userSearchQuery.trim()) {
                      return (
                        <p className="text-sm text-muted-foreground text-center py-4">검색 결과가 없습니다</p>
                      )
                    }
                    
                    return (
                      <div className="space-y-2">
                        {filteredUsers.map((u) => (
                          <div 
                            key={u.id} 
                            className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 rounded-md p-1 -m-1"
                            onClick={() => {
                              if (selectedUserIds.size > 0 && !selectedUserIds.has(u.id)) {
                                setSelectedUserIds(new Set([u.id]))
                              } else {
                                handleToggleUser(u.id, !selectedUserIds.has(u.id))
                              }
                            }}
                          >
                            <div className="flex items-center justify-center w-4 h-4 border-2 rounded-full border-primary shrink-0">
                              {selectedUserIds.has(u.id) && (
                                <div className="w-2 h-2 rounded-full bg-primary" />
                              )}
                            </div>
                            <label className="text-sm cursor-pointer flex-1 pointer-events-none">
                              <span className="font-medium">{u.full_name || u.email}</span>
                              {u.organization && (
                                <span className="text-muted-foreground ml-1">
                                  ({u.id === user?.id ? `나 : ${u.organization}` : u.organization})
                                </span>
                              )}
                              {!u.organization && u.id === user?.id && (
                                <span className="text-muted-foreground ml-1">(나)</span>
                              )}
                            </label>
                          </div>
                        ))}
                      </div>
                    )
                  })() : (
                    <p className="text-sm text-muted-foreground text-center py-4">사용자 목록을 불러오는 중...</p>
                  )}
                </div>
              </div>
            </div>

            {/* 파일 목록 및 미리보기 섹션 */}
            <div className="space-y-4 min-w-0 max-w-full" style={{ height: '70%' }}>
              <div className="grid gap-4 lg:grid-cols-[5.6fr_2.4fr] w-full min-w-0 max-w-full overflow-hidden h-full">
                {/* 파일 목록 */}
                <Card className="flex flex-col min-h-0 h-full w-full min-w-0 overflow-hidden">
                  <CardHeader className="shrink-0 pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">파일 목록</CardTitle>
                      </div>
                      <Button 
                        onClick={() => {
                          setSelectedFile(null)
                          setPreviewData(null)
                          setFileUrl(null)
                          setSelectedFiles(new Set())
                          setCurrentPath("")
                          loadFiles(true, "")
                        }} 
                        disabled={isLoading}
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                      >
                        <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 ${isLoading ? "animate-spin" : ""}`} />
                        <span className="hidden sm:inline ml-2">새로고침</span>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden flex flex-col min-h-0">
                    {isLoading ? (
                      <p className="text-center text-muted-foreground py-8">로딩 중...</p>
                    ) : files.length > 0 ? (
                      <div className="flex flex-col flex-1 overflow-hidden">
                        {downloadProgress && (
                          <div className="mb-4 p-3 border rounded-md bg-muted/50 shrink-0">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">{downloadProgress.fileName}</span>
                              <span className="text-sm text-muted-foreground">{downloadProgress.progress}%</span>
                            </div>
                            <Progress value={downloadProgress.progress} />
                          </div>
                        )}
                        <div className="overflow-x-auto flex-1 overflow-y-auto">
                          <Table>
                            <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">
                                {files.length > 0 && (
                                  <Checkbox
                                    checked={files.length > 0 && files.every(f => selectedFiles.has(f.key))}
                                    onCheckedChange={handleSelectAll}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                )}
                              </TableHead>
                              <TableHead className="w-[40%]">파일명</TableHead>
                              <TableHead className="w-[15%]">타입</TableHead>
                              <TableHead className="w-[15%]">크기</TableHead>
                              <TableHead className="w-[15%]">업로드일</TableHead>
                              <TableHead className="w-[15%]">작업</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {currentPath && (
                              <TableRow 
                                className="cursor-pointer hover:bg-muted/50 bg-muted/30"
                                onClick={handleGoUp}
                              >
                                <TableCell colSpan={6} className="font-medium">
                                  <div className="flex items-center gap-2">
                                    <ArrowLeft className="h-4 w-4" />
                                    <span>뒤로가기</span>
                                    <span className="text-xs text-muted-foreground truncate" title={getDisplayPath(currentPath)}>
                                      ({(() => {
                                        const path = getDisplayPath(currentPath)
                                        return typeof path === 'string' ? (path.split('/').pop() || path) : path
                                      })()})
                                    </span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                            {files.map((file, index) => (
                              <TableRow 
                                key={index}
                                className={`cursor-pointer hover:bg-muted/50 ${file.fileType === 'folder' ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}
                                onClick={() => {
                                  if (file.fileType === 'folder') {
                                    handleFolderClick(file.key)
                                  } else {
                                    handleViewFile(file)
                                  }
                                }}
                              >
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={selectedFiles.has(file.key)}
                                    onCheckedChange={(checked) => handleToggleFile(file.key, checked as boolean)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </TableCell>
                                <TableCell className="font-medium overflow-hidden select-none">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {file.fileType === 'folder' && (
                                      <span className="text-lg shrink-0">📁</span>
                                    )}
                                    <span className="truncate min-w-0" title={file.fileName || (typeof file.key === 'string' ? file.key.split("/").pop() : 'unknown')}>
                                      {file.fileName || (typeof file.key === 'string' ? file.key.split("/").pop() : 'unknown')}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="overflow-hidden">
                                  {file.fileType === 'folder' ? (
                                    <span className="text-xs">폴더</span>
                                  ) : (() => {
                                    const Icon = getFileTypeIcon(file)
                                    return (
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="shrink-0"><Icon className="h-4 w-4" /></span>
                                        <span className="text-xs truncate min-w-0">
                                          {getFileType(file) === "excel" ? "Excel" :
                                           getFileType(file) === "pdf" ? "PDF" : 
                                           getFileType(file) === "dicom" ? "DICOM" : 
                                           getFileType(file) === "image" ? "이미지" : 
                                           getFileType(file) === "video" ? "동영상" : 
                                           getFileType(file) === "ppt" ? "PPT" : "기타"}
                                        </span>
                                      </div>
                                    )
                                  })()}
                                </TableCell>
                                <TableCell className="overflow-hidden">
                                  <span className="truncate block">{file.fileType === 'folder' ? '-' : formatFileSize(file.size)}</span>
                                </TableCell>
                                <TableCell className="overflow-hidden">
                                  <span className="truncate block">{file.fileType === 'folder' ? '-' : new Date(file.lastModified).toLocaleDateString("ko-KR")}</span>
                                </TableCell>
                                <TableCell className="overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                  {file.fileType !== 'folder' && (
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDownloadFile(file)}
                                        title="파일 다운로드"
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteFile(file)}
                                        title="파일 삭제"
                                        className="text-destructive hover:text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        </div>
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">파일이 없습니다</p>
                    )}
                  </CardContent>
                </Card>

                {/* 파일 미리보기 */}
                <Card className="relative flex flex-col shrink-0" style={{
                  width: '100%',
                  height: '500px',
                  minHeight: '500px',
                  maxHeight: '500px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  <CardHeader className="pb-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">미리보기</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className={((getFileType(selectedFile || {} as S3File) === "excel" || selectedFile?.fileName?.toLowerCase().endsWith('.csv') || selectedFile?.key?.toLowerCase().endsWith('.csv')) ? "flex-1 overflow-hidden flex flex-col" : getFileType(selectedFile || {} as S3File) === "pdf" ? "flex-1 overflow-hidden flex flex-col min-h-0" : "overflow-y-auto")}>
                    {selectedFile ? (
                      <div className={getFileType(selectedFile) === "pdf" ? "flex flex-col h-full min-h-0" : "space-y-4"}>
                        <div className={getFileType(selectedFile) === "pdf" ? "shrink-0 mb-2" : ""}>
                          <div className="mb-2">
                            {selectedFile.folderPath && (() => {
                              const pathParts = typeof selectedFile.folderPath === 'string' ? selectedFile.folderPath.split('/') : []
                              const displayPath = pathParts.length > 1 && pathParts[0] ? pathParts.slice(1).join('/') : selectedFile.folderPath
                              return (
                                <p className="text-xs text-muted-foreground truncate mb-1" title={displayPath}>
                                  경로: {displayPath || '/'}
                                </p>
                              )
                            })()}
                            <p className="text-sm font-medium truncate" title={selectedFile.fileName || (typeof selectedFile.key === 'string' ? selectedFile.key.split("/").pop() : 'unknown')}>
                              파일명: {selectedFile.fileName || (typeof selectedFile.key === 'string' ? selectedFile.key.split("/").pop() : 'unknown')}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>크기: {formatFileSize(selectedFile.size)}</span>
                            <span>|</span>
                            <span>업로드일: {new Date(selectedFile.lastModified).toLocaleString("ko-KR")}</span>
                          </div>
                        </div>
                        <div className={getFileType(selectedFile) === "pdf" ? "flex-1 border rounded-lg overflow-hidden min-h-0" : "border rounded-lg overflow-hidden"} style={getFileType(selectedFile) === "pdf" ? {} : { minHeight: "400px" }}>
                          {isLoadingPreview ? (
                            <div className="flex items-center justify-center h-[400px]">
                              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                          ) : getFileType(selectedFile) === "pdf" ? (
                            fileUrl ? (
                              <iframe
                                src={fileUrl}
                                className="w-full h-full border-0"
                                style={{ minHeight: 0 }}
                                title="PDF Preview"
                              />
                            ) : (
                              <div className="p-4 text-center">
                                <p className="text-sm text-muted-foreground">PDF 파일을 불러오는 중...</p>
                              </div>
                            )
                          ) : (getFileType(selectedFile) === "excel" || selectedFile.fileName?.toLowerCase().endsWith('.csv') || selectedFile.key?.toLowerCase().endsWith('.csv')) ? (
                            previewData && (previewData.type === "excel" || previewData.type === "csv") ? (
                              <div className="flex flex-col h-full" style={{ height: "100%" }}>
                                <div className="mb-4 shrink-0 px-4 pt-4">
                                  <p className="text-sm font-medium mb-2">
                                    {previewData.type === "csv" ? "CSV" : "Excel"} 미리보기 (총 {previewData.totalRows}행 중 {previewData.data.length}행 표시)
                                  </p>
                                </div>
                                <div 
                                  className="flex-1 overflow-auto cursor-grab active:cursor-grabbing px-4"
                                  style={{ 
                                    minHeight: 0,
                                    WebkitOverflowScrolling: "touch"
                                  }}
                                  onMouseDown={(e) => {
                                    const element = e.currentTarget
                                    const startX = e.pageX - element.offsetLeft
                                    const startY = e.pageY - element.offsetTop
                                    const scrollLeft = element.scrollLeft
                                    const scrollTop = element.scrollTop

                                    const handleMouseMove = (e: MouseEvent) => {
                                      e.preventDefault()
                                      const x = e.pageX - element.offsetLeft
                                      const y = e.pageY - element.offsetTop
                                      const walkX = (x - startX) * 2
                                      const walkY = (y - startY) * 2
                                      element.scrollLeft = scrollLeft - walkX
                                      element.scrollTop = scrollTop - walkY
                                    }

                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove)
                                      document.removeEventListener('mouseup', handleMouseUp)
                                      element.style.cursor = 'grab'
                                    }

                                    element.style.cursor = 'grabbing'
                                    document.addEventListener('mousemove', handleMouseMove)
                                    document.addEventListener('mouseup', handleMouseUp)
                                  }}
                                >
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full border-collapse border border-gray-300 text-sm">
                                      <thead className="bg-muted sticky top-0 z-10">
                                        <tr>
                                          {previewData.headers.map((header, idx) => (
                                            <th key={idx} className="border border-gray-300 px-2 py-1 text-left font-semibold">
                                              {header}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {previewData.data.length > 0 ? (
                                          previewData.data.map((row, rowIdx) => (
                                            <tr key={rowIdx} className="hover:bg-muted/50">
                                              {previewData.headers.map((header, colIdx) => (
                                                <td key={colIdx} className="border border-gray-300 px-2 py-1">
                                                  {row[header] || ""}
                                                </td>
                                              ))}
                                            </tr>
                                          ))
                                        ) : (
                                          <tr>
                                            <td colSpan={previewData.headers.length} className="text-center text-muted-foreground">
                                              데이터가 없습니다
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 text-center">
                                <p className="text-sm text-muted-foreground">데이터를 불러오는 중...</p>
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
                                        <span className="flex-1 break-words">{String(value)}</span>
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
                                      // 배열인 경우 포맷팅
                                      let displayValue = value
                                      if (Array.isArray(value)) {
                                        displayValue = `[${value.join(', ')}]`
                                      } else if (typeof value === 'object' && value !== null) {
                                        displayValue = JSON.stringify(value, null, 2)
                                      }
                                      return (
                                        <div key={key} className="flex items-start gap-2 border-b pb-2">
                                          <span className="font-medium text-muted-foreground min-w-[200px]">{key}:</span>
                                          <span className="flex-1 break-words font-mono text-xs">{String(displayValue)}</span>
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
              </div>
              {selectedFiles.size > 0 && (
                <div className="space-y-2 min-w-0 max-w-full">
                  <Label>선택된 파일/폴더 ({selectedFiles.size}개)</Label>
                  <div className="text-sm text-muted-foreground max-h-32 overflow-y-auto border rounded-md p-3 min-w-0 max-w-full">
                    {(() => {
                      const selectedItems = getSelectedFilesForAssignment()
                      return selectedItems.length > 0 ? (
                        <div className="space-y-1">
                          {selectedItems.slice(0, 5).map((item, index) => (
                            <div key={index} className="flex items-center gap-2">
                              {item.fileType === 'folder' ? (
                                <>
                                  <span className="text-lg">📁</span>
                                  <span className="truncate">{item.fileName || (typeof item.key === 'string' ? item.key.split("/").pop() : 'unknown')}</span>
                                  <span className="text-xs text-muted-foreground">(폴더)</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-sm">📄</span>
                                  <span className="truncate">{item.fileName || (typeof item.key === 'string' ? item.key.split("/").pop() : 'unknown')}</span>
                                </>
                              )}
                            </div>
                          ))}
                          {selectedItems.length > 5 && (
                            <div className="text-xs text-muted-foreground pt-1">
                              ... 외 {selectedItems.length - 5}개
                            </div>
                          )}
                        </div>
                      ) : (
                        <span>선택된 파일이 없습니다</span>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-8 mt-8 min-w-0 max-w-full justify-center">
              <Button
                onClick={() => {
                  if (selectedUserIds.size === 0) {
                    toast({
                      title: "사용자 선택 필요",
                      description: "담당자를 선택해주세요.",
                      variant: "destructive",
                    })
                    return
                  }
                  if (!assignForm.title.trim()) {
                    toast({
                      title: "제목 입력 필요",
                      description: "제목을 입력해주세요.",
                      variant: "destructive",
                    })
                    return
                  }
                  setIsAssignConfirmDialogOpen(true)
                }}
                disabled={isAssigning || !assignForm.title.trim() || selectedUserIds.size === 0}
                className="w-auto min-w-[120px] cursor-pointer"
              >
                {isAssigning ? "등록 중..." : "등록하기"}
              </Button>
            </div>

          </CardContent>
        </Card>

        {/* 파일 삭제 확인 다이얼로그 */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>파일 삭제</DialogTitle>
              <DialogDescription>
                정말로 이 파일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {fileToDelete && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">파일명:</p>
                  <p className="text-sm text-muted-foreground">
                    {fileToDelete.fileName || (typeof fileToDelete.key === 'string' ? fileToDelete.key.split("/").pop() : 'unknown')}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsDeleteDialogOpen(false)
                  setFileToDelete(null)
                }}
                disabled={isDeleting}
              >
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeleteFile}
                disabled={isDeleting}
              >
                {isDeleting ? "삭제 중..." : "삭제"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 다운로드 링크 다이얼로그 */}
        <Dialog open={isDownloadLinksDialogOpen} onOpenChange={setIsDownloadLinksDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>다운로드 링크</DialogTitle>
              <DialogDescription>
                다음 링크는 1주일간 유효합니다. 링크를 복사하여 저장하세요.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {downloadLinks.length > 0 ? (
                <div className="space-y-3">
                  {downloadLinks.map((link, idx) => (
                    <div key={idx} className="border rounded-md p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{idx + 1}.</span>
                          <span className="text-sm font-medium">{link.fileName}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          만료: {link.expiresAt.toLocaleDateString("ko-KR")} {link.expiresAt.toLocaleTimeString("ko-KR", { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          value={link.url}
                          readOnly
                          className="flex-1 text-sm font-mono"
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(link.url)
                            toast({
                              title: "링크 복사됨",
                              description: `${link.fileName}의 다운로드 링크가 클립보드에 복사되었습니다.`,
                            })
                          }}
                        >
                          복사
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            window.open(link.url, '_blank')
                          }}
                        >
                          열기
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  다운로드 링크가 없습니다.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  // 모든 링크를 한 번에 복사
                  const allLinks = downloadLinks.map((link, idx) => 
                    `${idx + 1}. ${link.fileName}\n${link.url}\n만료: ${link.expiresAt.toLocaleDateString("ko-KR")}\n`
                  ).join('\n')
                  navigator.clipboard.writeText(allLinks)
                  toast({
                    title: "모든 링크 복사됨",
                    description: "모든 다운로드 링크가 클립보드에 복사되었습니다.",
                  })
                }}
              >
                전체 복사
              </Button>
              <Button onClick={() => setIsDownloadLinksDialogOpen(false)}>
                닫기
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      {/* 업무 등록 확인 다이얼로그 */}
      <AlertDialog open={isAssignConfirmDialogOpen} onOpenChange={setIsAssignConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업무 등록 확인</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 담당자에게 업무를 등록하시겠습니까?
              {selectedFiles.size > 0 && (
                <span className="block mt-2">
                  선택한 파일: {selectedFiles.size}개
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={async () => {
                setIsAssignConfirmDialogOpen(false)
                await handleAssignFiles()
                window.location.reload()
              }}
            >
              등록하기
            </AlertDialogAction>
            <AlertDialogCancel>취소</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

