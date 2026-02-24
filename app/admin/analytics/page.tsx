"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Eye, RefreshCw, Loader2, ArrowLeft, Archive, Trash2, Upload, Search, Calendar as CalendarIcon, Bold, Italic, Underline, Minus, Grid3x3 as TableIcon, UserPlus, X, Plus } from "lucide-react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { useSearchParams } from "next/navigation"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { uploadWithProgress } from "@/lib/utils/upload-with-progress"
import { S3File, ExcelPreview, DicomPreview, TableGridHover, NiftiPreview } from "./types"
import { useEditor } from "./hooks/useEditor"
import { useFileManagement } from "./hooks/useFileManagement"
import { useTaskAssignment } from "./hooks/useTaskAssignment"
import { useFileUpload } from "./hooks/useFileUpload"
import { getFileType, getFileTypeIcon, formatFileSize, updateDisplayedFiles, getDisplayPath } from "./utils/fileUtils"
import { TaskFormHeader } from "./components/TaskFormHeader"
import { FilePreviewSection } from "./components/FilePreviewSection"

export default function ClientAnalyticsPage() {
  const searchParams = useSearchParams()
  const fromWorklist = searchParams.get("from") === "worklist"
  const s3UpdateId = searchParams.get("s3_update_id")

  const [allFiles, setAllFiles] = useState<S3File[]>([]) // 전체 파일 목록
  const [files, setFiles] = useState<S3File[]>([]) // 현재 표시할 파일 목록
  const [currentPath, setCurrentPath] = useState<string>("") // 현재 폴더 경로
  const [user, setUser] = useState<any>(null)
  const [selectedFile, setSelectedFile] = useState<S3File | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set()) // 체크된 파일들의 key Set
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; email: string; organization?: string }>>([])
  const [isUsersLoading, setIsUsersLoading] = useState(false) // 담당자 추가 다이얼로그용 사용자 목록 로딩
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set()) // 체크된 사용자들의 ID Set
  const [isAssigning, setIsAssigning] = useState(false)
  const [isDownloadLinksDialogOpen, setIsDownloadLinksDialogOpen] = useState(false)
  const [isAssignConfirmDialogOpen, setIsAssignConfirmDialogOpen] = useState(false)
  const [downloadLinks, setDownloadLinks] = useState<Array<{ fileName: string; url: string; expiresAt: Date }>>([])
  const [assignForm, setAssignForm] = useState({
    title: "",
    content: "",
    priority: "medium",
    description: "",
    due_date: null as Date | null,
    assigned_to: "", // 개별 업무 담당자 ID (필수)
  })
  const prioritySelectRef = useRef<HTMLButtonElement>(null)
  
  // 에디터 state (굵게/기울임/밑줄 툴바 활성 표시용)
  const [editorState, setEditorState] = useState({
    bold: false,
    italic: false,
    underline: false,
  })
  const [tableGridHover, setTableGridHover] = useState<TableGridHover>({ row: 0, col: 0, show: false })

  // contentEditable 선택 상태를 툴바에 반영 (queryCommandState → 로컬 state)
  const syncEditorToolbarState = () => {
    setEditorState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    })
  }

  // 공동 할당 관련 상태
  const [isUserSelectDialogOpen, setIsUserSelectDialogOpen] = useState(false)
  const [selectedAssignees, setSelectedAssignees] = useState<Set<string>>(new Set())
  const [contentMode, setContentMode] = useState<'single' | 'multi'>('single') // 토글 상태: 개별업무/공동업무
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('') // 현재 입력 중인 부제목
  const [subContent, setSubContent] = useState<string>('') // 공동업무 탭의 내용 저장
  const [subtasks, setSubtasks] = useState<Array<{
    id: string
    subtitle: string  // 부제
    assignedToList: string[]  // 여러 사용자 지원
    content: string
    fileKeys: string[]
  }>>([])
  const [userSearchQuery, setUserSearchQuery] = useState<string>('') // 사용자 검색어
  const [selectedUserId, setSelectedUserId] = useState<string>('') // 선택된 사용자 ID (라디오버튼용)
  
  // contentEditable refs
  const contentEditableRef = useRef<HTMLDivElement>(null)
  const contentEditableMultiRef = useRef<HTMLDivElement>(null)

  // Upload 관련 state (hooks보다 먼저 선언)
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

  const [extractPasswordDialogOpen, setExtractPasswordDialogOpen] = useState(false)
  const [extractPasswordFile, setExtractPasswordFile] = useState<S3File | null>(null)
  const [extractPasswordValue, setExtractPasswordValue] = useState("")

  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)

  const { toast } = useToast()
  
  // Editor hook
  const { updateEditorState, addResizeHandlersToTable, createTable } = useEditor(assignForm, setAssignForm)
  
  // File management hook
  const {
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
  
  // Task assignment hook
  const { handleAssignFiles } = useTaskAssignment({
    toast,
    assignForm,
    setAssignForm,
    subtasks,
    setSubtasks,
    selectedFiles,
    setSelectedFiles,
    setSelectedAssignees,
    s3UpdateId: s3UpdateId || undefined,
  })
  
  // File upload hook
  const fileUpload = useFileUpload({
    toast,
    isFolderUpload,
    fileType,
    uploadedFile,
    uploadedFiles,
    compressToZip,
    folderPath,
    folderName,
    setAllFolderFiles,
    setFolderPath,
    setFolderName,
    setUploadedFiles,
    setUploadedFile,
    setUploadProgress,
    setFileType,
    setIsFolderUpload,
    setCompressToZip,
    loadFiles,
  })
  
  // 초기 로드 시 에디터 내용 설정
  useEffect(() => {
    const mainEditor = contentEditableRef.current
    if (mainEditor && !mainEditor.innerHTML) {
      mainEditor.innerHTML = assignForm.content || ''
    }
  }, [])
  
  useEffect(() => {
    const subEditor = contentEditableMultiRef.current
    if (subEditor && !subEditor.innerHTML) {
      subEditor.innerHTML = subContent || ''
    }
  }, [])
  
  // 탭 전환 시에만 에디터 내용 복원 (커서 위치 저장 및 복원)
  useEffect(() => {
    if (contentMode === 'single') {
      const mainEditor = contentEditableRef.current
      if (mainEditor) {
        // 포커스가 있는지 확인
        const isFocused = document.activeElement === mainEditor
        if (!isFocused && assignForm.content !== mainEditor.innerHTML) {
          mainEditor.innerHTML = assignForm.content
        }
      }
    } else {
      const subEditor = contentEditableMultiRef.current
      if (subEditor) {
        const isFocused = document.activeElement === subEditor
        if (!isFocused && subContent !== subEditor.innerHTML) {
          subEditor.innerHTML = subContent
        }
      }
    }
  }, [contentMode])

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (res.ok) {
          const me = await res.json()
          setUser(me)
          // 자기 자신은 배정 불가: 기본 담당자 선택 안 함
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

  // S3 업데이트에서 담당자 지정으로 들어온 경우: 제목·파일 키 미리 채우기
  useEffect(() => {
    if (!s3UpdateId) return
    const load = async () => {
      try {
        const res = await fetch(`/api/s3-updates/${s3UpdateId}`, { credentials: "include" })
        if (!res.ok) return
        const data = await res.json()
        const row = data.s3Update as { file_name?: string | null; s3_key: string }
        const title = row.file_name || row.s3_key?.split("/").pop() || row.s3_key || "S3 업로드 작업"
        setAssignForm((prev: typeof assignForm) => ({ ...prev, title }))
        setSelectedFiles(new Set([row.s3_key]))
      } catch {
        // ignore
      }
    }
    load()
  }, [s3UpdateId])

  // 업무 추가(worklist/s3_update) 진입 시에는 S3 파일 목록 로드 생략 → AWS 자격증명은 다운로드(presigned URL)에서만 사용
  useEffect(() => {
    if (user && !s3UpdateId && !fromWorklist) {
      loadFiles()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, s3UpdateId, fromWorklist])

  // currentPath 변경 시 파일 목록 업데이트
  useEffect(() => {
    if (allFiles.length > 0) {
      updateDisplayedFiles(allFiles, currentPath, setFiles)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath])

  const handleFolderClick = (folderPath: string) => {
    setCurrentPath(folderPath)
    updateDisplayedFiles(allFiles, folderPath, setFiles)
    setSelectedFile(null)
  }

  const handleGoUp = () => {
    if (!currentPath) return
    const pathParts = typeof currentPath === 'string' ? currentPath.split('/') : []
    pathParts.pop()
    const newPath = pathParts.join('/')
    setCurrentPath(newPath)
    updateDisplayedFiles(allFiles, newPath, setFiles)
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
    const allItems = [...allFiles, ...files]
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
        const folderPrefix = item.key.endsWith('/') ? item.key : `${item.key}/`
        const folderFiles = allFiles.filter(f => {
          if (f.fileType === 'folder') return false
          if (!f.folderPath || f.folderPath === '') {
            return f.key.startsWith(folderPrefix)
          }
          if (f.folderPath === item.key || f.folderPath.startsWith(folderPrefix)) {
            return true
          }
          return f.key.startsWith(folderPrefix)
        })
        fileKeys.push(...folderFiles.map(f => f.key))
      } else {
        fileKeys.push(item.key)
      }
    }
    return fileKeys
  }

  // 사용자 목록 로드 — 가입된 전체 인원 (API가 admin/staff일 때 { profiles, pendingStaffRequests } 객체 반환)
  const loadUsers = async () => {
    setIsUsersLoading(true)
    try {
      const response = await fetch("/api/profiles")
      if (response.ok) {
        const data = await response.json()
        const allProfiles = Array.isArray(data)
          ? data
          : (Array.isArray(data?.profiles) ? data.profiles : [])
        setUsers(allProfiles)
      }
    } catch (error) {
      console.error("[Analytics] 사용자 목록 로드 오류:", error)
    } finally {
      setIsUsersLoading(false)
    }
  }

  useEffect(() => {
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

  return (
    <div className="relative mx-auto max-w-7xl p-6 w-full overflow-hidden">
      {isUploading && (
        <div className="mb-6">
          <Progress value={uploadProgress} />
        </div>
      )}

      {/* 업무 등록 폼 */}
      <Card className="flex flex-col h-full w-full min-w-0 max-w-full overflow-hidden">
          <CardHeader className="shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              {fromWorklist && (
                <Button variant="ghost" size="icon" className="shrink-0" asChild>
                  <Link href="/admin/cases" aria-label="뒤로가기">
                    <ArrowLeft className="h-5 w-5" />
                  </Link>
                </Button>
              )}
              <CardTitle className="text-2xl">업무 등록</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 flex-1 flex flex-col min-w-0 max-w-full overflow-hidden">
            <TaskFormHeader
              assignForm={assignForm}
              setAssignForm={setAssignForm}
              contentMode={contentMode}
              prioritySelectRef={prioritySelectRef}
            />

            {/* [개별업무] 모드: 내용 에디터 + 사용자 목록 */}
            {contentMode === 'single' && (
              <div className="grid gap-4 lg:grid-cols-[5.6fr_2.4fr] min-w-0 max-w-full">
                <div className="space-y-2 min-w-0 max-w-full">
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-semibold">내용</Label>
                    {/* 개별/공동 슬라이딩 세그먼트 */}
                    <div className="relative inline-flex items-center bg-muted rounded-full p-0.5 h-8 w-fit">
                      <div 
                        className="absolute h-7 rounded-full bg-background shadow-sm transition-all duration-200 ease-in-out"
                        style={{
                          width: '45px', 
                          left: '2px',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setContentMode('single' as const)}
                        className="relative z-10 w-[45px] h-7 text-sm font-medium transition-colors duration-200 text-foreground"
                      >
                        개별
                      </button>
                      <button
                        type="button"
                        onClick={() => setContentMode('multi' as const)}
                        className="relative z-10 w-[45px] h-7 text-sm font-medium transition-colors duration-200 text-muted-foreground"
                      >
                        공동
                      </button>
                    </div>
                  </div>
                <div className="border rounded-md overflow-hidden bg-background" style={{
                  height: '492px',
                  minHeight: '492px',
                  maxHeight: '492px',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <div className="flex items-center justify-between gap-1 p-2 flex-wrap shrink-0 bg-background border-b">
                    <div className="flex items-center gap-1 flex-1">
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
                            // eslint-disable-next-line deprecation/deprecation
                            document.execCommand('bold', false)
                            syncEditorToolbarState()
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
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault()
                          const editor = document.getElementById('assign-content')
                          if (editor) {
                            editor.focus()
                            // eslint-disable-next-line deprecation/deprecation
                            document.execCommand('italic', false)
                            syncEditorToolbarState()
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
                            // eslint-disable-next-line deprecation/deprecation
                            document.execCommand('underline', false)
                            syncEditorToolbarState()
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
                            // onBlur에서 상태 업데이트
                          }
                        }}
                        title="구분선"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div
                    ref={contentEditableRef}
                    id="assign-content"
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => {
                      // 상태 업데이트 없이 DOM만 업데이트
                      setTimeout(() => {
                        const editor = e.currentTarget
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
                      setEditorState({ bold: false, italic: false, underline: false })
                    }}
                    onMouseUp={syncEditorToolbarState}
                    onKeyUp={syncEditorToolbarState}
                    className="resize-none text-base leading-relaxed w-full max-w-full min-w-0 overflow-y-auto p-3 focus:outline-none focus:ring-0 bg-background flex-1"
                    style={{ 
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                    data-placeholder="내용을 입력하세요."
                  />
                  <style jsx global>{`
                    #assign-content:empty:before {
                      content: attr(data-placeholder);
                      color: #9ca3af;
                      pointer-events: none;
                    }
                    #assign-content table {
                      border-collapse: collapse;
                      width: 100%;
                      margin: 10px 0;
                      border: 2px solid #6b7280;
                    }
                    #assign-content table td,
                    #assign-content table th {
                      border: 2px solid #6b7280;
                      padding: 8px;
                      position: relative;
                    }
                    #assign-content table td u,
                    #assign-content table th u,
                    #assign-content table td[style*="underline"],
                    #assign-content table th[style*="underline"],
                    #assign-content table td *[style*="underline"],
                    #assign-content table th *[style*="underline"] {
                      text-decoration: none !important;
                    }
                    #assign-content table td * u,
                    #assign-content table th * u {
                      text-decoration: none !important;
                    }
                    #assign-content hr {
                      border: none;
                      border-top: 2px solid #9ca3af;
                      margin: 10px 0;
                    }
                    table[data-resizable="true"] td[contenteditable="true"] u,
                    table[data-resizable="true"] th[contenteditable="true"] u,
                    table[data-resizable="true"] td[contenteditable="true"][style*="underline"],
                    table[data-resizable="true"] th[contenteditable="true"][style*="underline"],
                    table[data-resizable="true"] td[contenteditable="true"] *[style*="underline"],
                    table[data-resizable="true"] th[contenteditable="true"] *[style*="underline"] {
                      text-decoration: none !important;
                    }
                    table[data-resizable="true"] td[contenteditable="true"] * u,
                    table[data-resizable="true"] th[contenteditable="true"] * u {
                      text-decoration: none !important;
                    }
                  `}</style>
                </div>
              </div>

              {/* 오른쪽: 사용자 리스트 */}
              <div className="min-w-0 max-w-full">
                <div className="flex items-center gap-2 mb-2" style={{ height: '32px' }}>
                  <Label className="text-base font-semibold">
                    사용자 리스트 ({users.length}명)
                  </Label>
                </div>
                <div className="border rounded-md bg-background" style={{ minHeight: '492px', maxHeight: '492px', display: 'flex', flexDirection: 'column' }}>
                  {/* 검색 입력창 */}
                  <div className="p-3 border-b shrink-0">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="이름 또는 이메일 검색..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  
                  {/* 사용자 목록 - 라디오버튼 */}
                  <div className="flex-1 overflow-y-auto p-3">
                    {users.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        사용자가 없습니다
                      </p>
                    ) : (
                      <RadioGroup 
                        value={selectedUserId} 
                        onValueChange={(userId) => {
                          setSelectedUserId(userId)
                          setAssignForm({ ...assignForm, assigned_to: userId })
                        }} 
                        className="space-y-0"
                      >
                        {users
                          .filter((u) => {
                            const query = userSearchQuery.toLowerCase()
                            return (
                              u.full_name?.toLowerCase().includes(query) ||
                              u.email?.toLowerCase().includes(query) ||
                              u.organization?.toLowerCase().includes(query)
                            )
                          })
                          .map((u) => (
                            <div key={u.id} className="flex items-center space-x-2 py-0.5 rounded px-2 transition-colors hover:bg-muted/30">
                              <RadioGroupItem 
                                value={u.id} 
                                id={u.id} 
                              />
                              <Label 
                                htmlFor={u.id} 
                                className="flex-1 flex items-center gap-2 cursor-pointer"
                              >
                                <span className="font-medium text-sm">{u.full_name}</span>
                                {u.organization && (
                                  <span className="text-xs text-muted-foreground">({u.organization})</span>
                                )}
                              </Label>
                            </div>
                          ))
                        }
                      </RadioGroup>
                    )}
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* 공동업무 요청 영역: 파란 그리드 + 공동업무 추가 버튼(테두리 위 오른쪽) */}
            <div className={contentMode === 'multi' ? 'relative w-full min-w-0' : ''}>
            <div className={contentMode === 'multi' ? 'border-2 border-primary/50 rounded-xl p-4 gap-4 bg-muted/10 min-w-0 ring-1 ring-primary/20 flex flex-col min-h-0' : ''}>
            {contentMode === 'multi' && (
              <div className="grid gap-4 lg:grid-cols-[5.6fr_2.4fr] lg:grid-rows-[auto_1fr] min-w-0 max-w-full w-full flex-1 min-h-0 overflow-hidden">
                {/* 왼쪽: 공동업무 내용 (개별과 동일 레이아웃 — 내용 | 사용자리스트) */}
                <div className="space-y-2 min-w-0 max-w-full">
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-semibold">공동업무 내용</Label>
                    <div className="relative inline-flex items-center bg-muted rounded-full p-0.5 h-8 w-fit">
                      <div
                        className="absolute h-7 rounded-full bg-background shadow-sm transition-all duration-200 ease-in-out"
                        style={{ width: '45px', left: '47px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setContentMode('single' as const)}
                        className="relative z-10 w-[45px] h-7 text-sm font-medium transition-colors duration-200 text-muted-foreground"
                      >
                        개별
                      </button>
                      <button
                        type="button"
                        onClick={() => setContentMode('multi' as const)}
                        className="relative z-10 w-[45px] h-7 text-sm font-medium transition-colors duration-200 text-foreground"
                      >
                        공동
                      </button>
                    </div>
                  </div>
                  <Input
                    id="subtitle"
                    value={currentSubtitle}
                    onChange={(e) => setCurrentSubtitle(e.target.value)}
                    placeholder="공동업무의 부제를 입력하세요"
                    className="focus-visible:ring-0 focus-visible:border-input"
                  />
                    <Label htmlFor="assign-content-multi" className="text-base font-semibold sr-only">공동업무 내용 입력</Label>
                    <div className="border rounded-xl overflow-hidden bg-background" style={{
                      height: '492px',
                      minHeight: '492px',
                      maxHeight: '492px',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <div className="flex items-center justify-between gap-1 p-2 flex-wrap shrink-0 bg-background border-b">
                        <div className="flex items-center gap-1">
                          {/* 서식 버튼들 */}
                          <Button
                            type="button"
                            variant={editorState.bold ? "secondary" : "ghost"}
                            size="sm"
                            className={`h-8 w-8 p-0 ${editorState.bold ? 'bg-primary/10' : ''}`}
                            onClick={(e) => {
                              e.preventDefault()
                              const editor = document.getElementById('assign-content-multi')
                              if (editor) {
                                editor.focus()
                                // eslint-disable-next-line deprecation/deprecation
                                document.execCommand('bold', false)
                                syncEditorToolbarState()
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
                            onClick={(e: React.MouseEvent) => {
                              e.preventDefault()
                              const editor = document.getElementById('assign-content-multi')
                              if (editor) {
                                editor.focus()
                                // eslint-disable-next-line deprecation/deprecation
                                document.execCommand('italic', false)
                                syncEditorToolbarState()
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
                              const editor = document.getElementById('assign-content-multi')
                              if (editor) {
                                editor.focus()
                                // eslint-disable-next-line deprecation/deprecation
                                document.execCommand('underline', false)
                                syncEditorToolbarState()
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
                                          const editor = document.getElementById('assign-content-multi')
                                          if (editor) {
                                            editor.focus()
                                            const table = document.createElement('table')
                                            table.style.borderCollapse = 'collapse'
                                            table.style.width = '100%'
                                            table.style.margin = '10px 0'
                                            table.style.border = '2px solid #6b7280'
                                            table.style.position = 'relative'
                                            table.style.tableLayout = 'fixed'
                                            table.setAttribute('data-resizable', 'true')
                                            
                                            const columnWidth = `${100 / col}%`
                                            
                                            for (let i = 0; i < row; i++) {
                                              const tr = document.createElement('tr')
                                              for (let j = 0; j < col; j++) {
                                                const cell = document.createElement('td')
                                                cell.style.border = '2px solid #6b7280'
                                                cell.style.padding = '8px'
                                                cell.style.width = columnWidth
                                                cell.style.minWidth = '50px'
                                                cell.style.position = 'relative'
                                                cell.contentEditable = 'true'
                                                cell.innerHTML = '&nbsp;'
                                                tr.appendChild(cell)
                                              }
                                              table.appendChild(tr)
                                            }
                                            
                                            editor.appendChild(table)
                                            setTimeout(() => addResizeHandlersToTable(table), 0)
                                            setSubContent(editor.innerHTML)
                                          }
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
                              const editor = document.getElementById('assign-content-multi')
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
                              }
                            }}
                            title="구분선"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* 오른쪽: 담당자 추가 (공동업무 추가는 그리드 밖 오른쪽 끝에 배치) */}
                        <div className="flex items-center gap-2 ml-auto">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={(e) => {
                              e.preventDefault()
                              setIsUserSelectDialogOpen(true)
                            }}
                          >
                            <UserPlus className="h-4 w-4 mr-1" />
                            담당자 추가 ({selectedAssignees.size})
                          </Button>
                        </div>
                      </div>

                      {/* 에디터 영역 */}
                      <div
                        ref={contentEditableMultiRef}
                        id="assign-content-multi"
                        contentEditable
                        suppressContentEditableWarning
                        onInput={(e) => {
                          // 상태 업데이트 없이 DOM만 업데이트
                          setTimeout(() => {
                            const editor = e.currentTarget
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
                          setSubContent(html)
                          updateEditorState()
                          setEditorState({ bold: false, italic: false, underline: false })
                        }}
                        onMouseUp={syncEditorToolbarState}
                        onKeyUp={syncEditorToolbarState}
                        className="resize-none text-base leading-relaxed w-full max-w-full min-w-0 overflow-y-auto p-3 focus:outline-none focus:ring-0 bg-background flex-1"
                        style={{ 
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}
                        data-placeholder="추가 내용을 입력하세요."
                      />
                      <style jsx global>{`
                        #assign-content-multi:empty:before {
                          content: attr(data-placeholder);
                          color: #9ca3af;
                          pointer-events: none;
                        }
                        #assign-content-multi table {
                          border-collapse: collapse;
                          width: 100%;
                          margin: 10px 0;
                          border: 2px solid #6b7280;
                        }
                        #assign-content-multi table td,
                        #assign-content-multi table th {
                          border: 2px solid #6b7280;
                          padding: 8px;
                          position: relative;
                        }
                        #assign-content-multi table td u,
                        #assign-content-multi table th u,
                        #assign-content-multi table td[style*="underline"],
                        #assign-content-multi table th[style*="underline"],
                        #assign-content-multi table td *[style*="underline"],
                        #assign-content-multi table th *[style*="underline"] {
                          text-decoration: none !important;
                        }
                        #assign-content-multi table td * u,
                        #assign-content-multi table th * u {
                          text-decoration: none !important;
                        }
                        #assign-content-multi hr {
                          border: none;
                          border-top: 2px solid #9ca3af;
                          margin: 10px 0;
                        }
                      `}</style>
                    </div>
                  </div>

                {/* 오른쪽: 업무 목록 — 셀 높이 채워서 하단 모서리 왼쪽과 일치 */}
                <div className="min-w-0 max-w-full flex flex-col min-h-0">
                  <div className="flex items-center gap-2 mb-2 shrink-0" style={{ height: '32px' }}>
                    <Label className="text-base font-semibold">업무 목록 ({subtasks.length})</Label>
                  </div>
                  <div className="border rounded-xl bg-background flex-1 min-h-[492px] flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {subtasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          공동 할당을 위해 부제목과 내용을 작성하고 &quot;추가&quot; 버튼을 눌러주세요<br/>
                        </p>
                      ) : (
                        subtasks.map((subtask) => {
                          return (
                            <Card key={subtask.id} className="p-3">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  {subtask.subtitle && (
                                    <div className="font-semibold text-sm mb-2">{subtask.subtitle}</div>
                                  )}
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {subtask.assignedToList.map(userId => {
                                      const assignedUser = users.find(u => u.id === userId)
                                      return (
                                        <Badge key={userId} variant="outline" className="text-xs">
                                          {assignedUser?.full_name || assignedUser?.email || '알 수 없음'}
                                        </Badge>
                                      )
                                    })}
                                  </div>
                                  {subtask.fileKeys.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {subtask.fileKeys.map((key) => {
                                        const file = allFiles.find(f => f.key === key)
                                        return (
                                          <Badge key={key} variant="secondary" className="text-xs">
                                            {file?.fileName || (typeof key === 'string' ? key.split('/').pop() : 'unknown')}
                                          </Badge>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 ml-2 shrink-0"
                                  onClick={() => {
                                    setSubtasks(subtasks.filter(s => s.id !== subtask.id))
                                    toast({ title: "공동 업무가 제거되었습니다" })
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </Card>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 파일 목록 및 미리보기 섹션 (공동업무 모드일 때는 위 테두리 영역 안에 포함, 그리드 열 정렬로 모서리 맞춤) */}
            <div className={contentMode === 'multi' ? 'min-w-0 max-w-full w-full flex-1 flex flex-col min-h-0' : 'space-y-4 min-w-0 max-w-full'} style={contentMode === 'multi' ? undefined : { height: '70%' }}>
              <div className={`grid gap-4 lg:grid-cols-[5.6fr_2.4fr] w-full min-w-0 max-w-full overflow-hidden items-stretch ${contentMode === 'multi' ? 'flex-1 min-h-0 h-full' : 'h-full'}`}>
                {/* 파일 목록 — 하단 모서리 일정하도록 셀 높이 채움 */}
                <Card className="flex flex-col min-h-0 h-full w-full min-w-0 overflow-hidden rounded-xl flex-1">
                  <CardHeader className="shrink-0 pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg">파일 목록</CardTitle>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {selectedFiles.size > 0 && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="shrink-0"
                            disabled={isDeleting}
                            onClick={() => setIsBulkDeleteDialogOpen(true)}
                          >
                            <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                            <span className="hidden sm:inline ml-2">선택 삭제</span>
                          </Button>
                        )}
                        <Button 
                          onClick={() => {
                            setSelectedFile(null)
                            setPreviewData(null)
                            setFileUrl(null)
                            setSelectedFiles(new Set())
                            loadFiles(true)
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
                          </div>
                        )}
                        <div className="overflow-x-auto overflow-y-auto border rounded-md" style={{ maxHeight: '500px' }}>
                          <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                              <TableHead className="w-12 bg-background">
                                {files.length > 0 && (
                                  <Checkbox
                                    checked={files.length > 0 && files.every(f => selectedFiles.has(f.key))}
                                    onCheckedChange={handleSelectAll}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                )}
                              </TableHead>
                              <TableHead className="w-[40%] bg-background">파일명</TableHead>
                              <TableHead className="w-[15%] bg-background">타입</TableHead>
                              <TableHead className="w-[15%] bg-background">크기</TableHead>
                              <TableHead className="w-[15%] bg-background">업로드일</TableHead>
                              <TableHead className="w-[15%] bg-background">작업</TableHead>
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
                                  {file.fileType === 'folder' ? (
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteFile(file)}
                                        title="폴더 삭제"
                                        className="text-destructive hover:text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 shrink-0">
                                      {/* zip 파일인 경우 압축 해제 버튼 추가 */}
                                      {((file.fileName?.toLowerCase().endsWith('.zip') || file.fileName?.toLowerCase().endsWith('.7z')) || (file.key?.toLowerCase().endsWith('.zip') || file.key?.toLowerCase().endsWith('.7z'))) && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={async () => {
                                            try {
                                              await handleExtractZip(file)
                                            } catch (err) {
                                              if ((err as Error & { code?: string }).code === "ZIP_MISSING_PASSWORD") {
                                                setExtractPasswordFile(file)
                                                setExtractPasswordValue("")
                                                setExtractPasswordDialogOpen(true)
                                              }
                                            }
                                          }}
                                          title="압축 해제"
                                          disabled={isExtracting}
                                        >
                                          <Archive className="h-4 w-4" />
                                        </Button>
                                      )}
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
                        {isExtracting && (
                          <div className="mt-4 p-4 border rounded-lg bg-muted/50 shrink-0 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span className="text-sm font-medium">zip 파일 압축 해제 중...</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{extractProgress}%</span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={cancelExtract}
                                >
                                  취소
                                </Button>
                              </div>
                            </div>
                            <Progress value={extractProgress} />
                            {extractInfo && (
                              <div className="text-xs text-muted-foreground space-y-1">
                                <div className="flex justify-between">
                                  <span>파일 진행:</span>
                                  <span className="font-medium">{extractInfo.extractedCount} / {extractInfo.totalFiles}</span>
                                </div>
                                {extractInfo.totalSize > 0 && (
                                  <div className="flex justify-between">
                                    <span>용량 진행:</span>
                                    <span className="font-medium">
                                      {(extractInfo.extractedSize / (1024 * 1024)).toFixed(2)} MB / {(extractInfo.totalSize / (1024 * 1024)).toFixed(2)} MB
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {isDeleting && deleteProgress > 0 && (
                          <div className="mt-4 p-4 border rounded-lg bg-muted/50 shrink-0 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span className="text-sm font-medium">파일 삭제 중...</span>
                              </div>
                              <span className="text-sm font-medium">{deleteProgress}%</span>
                            </div>
                            <Progress value={deleteProgress} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">파일이 없습니다</p>
                    )}
                  </CardContent>
                </Card>

                {/* 파일 미리보기 — 하단 모서리 일정하도록 셀 높이 채움 */}
                <Card className="relative flex flex-col min-h-0 h-full w-full rounded-xl overflow-hidden" style={{
                  width: '100%',
                  minHeight: '400px',
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
              </div>
              {selectedFiles.size > 0 && (
                <div className="mt-5 space-y-2 min-w-0 w-full">
                  <Label>선택된 파일/폴더 ({selectedFiles.size}개)</Label>
                  <div className="text-sm text-muted-foreground min-w-0 w-full overflow-y-auto overflow-x-hidden border rounded-md p-3 max-h-[20vh]">
                    {(() => {
                      const selectedItems = getSelectedFilesForAssignment()
                      return selectedItems.length > 0 ? (
                        <div className="space-y-1 min-w-0">
                          {selectedItems.slice(0, 5).map((item, index) => (
                            <div key={index} className="flex items-center gap-2 min-w-0 w-full">
                              {item.fileType === 'folder' ? (
                                <>
                                  <span className="shrink-0 text-lg">📁</span>
                                  <span className="truncate min-w-0 flex-1">{item.fileName || (typeof item.key === 'string' ? item.key.split("/").pop() : 'unknown')}</span>
                                  <span className="shrink-0 text-xs text-muted-foreground">(폴더)</span>
                                </>
                              ) : (
                                <>
                                  <span className="shrink-0 text-sm">📄</span>
                                  <span className="truncate min-w-0 flex-1">{item.fileName || (typeof item.key === 'string' ? item.key.split("/").pop() : 'unknown')}</span>
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
            </div>
            {contentMode === 'multi' && (
              <div className="absolute -top-10 right-4 z-10 shadow-md">
                <Button
                  type="button"
                  variant="default"
                  size="default"
                  onClick={(e) => {
                    e.preventDefault()
                    if (!currentSubtitle.trim()) {
                      toast({
                        title: "부제목 필요",
                        description: "부제목을 입력해주세요.",
                        variant: "destructive",
                      })
                      return
                    }
                    if (!subContent.trim()) {
                      toast({
                        title: "내용 필요",
                        description: "추가 내용을 입력해주세요.",
                        variant: "destructive",
                      })
                      return
                    }
                    const newSubtask = {
                      id: crypto.randomUUID(),
                      subtitle: currentSubtitle,
                      assignedToList: Array.from(selectedAssignees),
                      content: subContent,
                      fileKeys: Array.from(selectedFiles)
                    }
                    setSubtasks([...subtasks, newSubtask])
                    setCurrentSubtitle('')
                    setSubContent('')
                    const editor = document.getElementById('assign-content-multi')
                    if (editor) editor.innerHTML = ''
                    setSelectedFiles(new Set())
                    setSelectedAssignees(new Set())
                    const assigneeCount = newSubtask.assignedToList.length
                    const currentUserName = user?.full_name || user?.email || '본인'
                    toast({
                      title: "공동 업무가 추가되었습니다",
                      description: assigneeCount > 0 ? `${assigneeCount}명에게 할당됩니다` : `${currentUserName}에게 할당됩니다`
                    })
                  }}
                  disabled={!currentSubtitle.trim()}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  공동업무 추가
                </Button>
              </div>
            )}
            </div>

            <div className="flex gap-2 pt-8 mt-8 min-w-0 max-w-full justify-center">
              <Button
                onClick={() => {
                  if (!assignForm.title.trim()) {
                    toast({
                      title: "제목 입력 필요",
                      description: "제목을 입력해주세요.",
                      variant: "destructive",
                    })
                    return
                  }
                  // 개별업무 모드: 담당자 필수
                  if (subtasks.length === 0 && !assignForm.assigned_to) {
                    toast({
                      title: "담당자 선택 필요",
                      description: "업무를 할당할 담당자를 선택해주세요.",
                      variant: "destructive",
                    })
                    return
                  }
                  
                  // 공동업무 모드: subtasks가 있어야 함
                  if (subtasks.length > 0 && subtasks.some(s => s.assignedToList.length === 0)) {
                    toast({
                      title: "담당자 추가 필요",
                      description: "모든 공동업무에 최소 1명 이상의 담당자를 추가해주세요.",
                      variant: "destructive",
                    })
                    return
                  }
                  setIsAssignConfirmDialogOpen(true)
                }}
                disabled={isAssigning || !assignForm.title.trim() || (subtasks.length === 0 && !assignForm.assigned_to)}
                className="w-auto min-w-[120px] cursor-pointer"
              >
                {isAssigning
                  ? "등록 중..."
                  : contentMode === "multi" && subtasks.length > 0
                    ? `등록하기 (${subtasks.length})`
                    : "등록하기"}
              </Button>
            </div>

          </CardContent>
        </Card>

        {/* 파일/폴더 삭제 확인 다이얼로그 */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setIsDeleteDialogOpen(false)
            setFileToDelete(null)
          } else if (!open && isDeleting) {
            // 삭제 중일 때 X 버튼 클릭 시 취소
            cancelDelete()
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{fileToDelete?.fileType === 'folder' ? '폴더 삭제' : '파일 삭제'}</DialogTitle>
              <DialogDescription>
                {fileToDelete?.fileType === 'folder' 
                  ? '정말로 이 폴더와 폴더 내의 모든 파일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.'
                  : '정말로 이 파일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.'}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {fileToDelete && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{fileToDelete.fileType === 'folder' ? '폴더명:' : '파일명:'}</p>
                  <p className="text-sm text-muted-foreground">
                    {fileToDelete.fileName || (typeof fileToDelete.key === 'string' ? fileToDelete.key.split("/").pop() : 'unknown')}
                  </p>
                </div>
              )}
              {isDeleting && deleteProgress > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">삭제 진행 중...</span>
                    <span className="text-sm font-medium">{deleteProgress}%</span>
                  </div>
                  <Progress value={deleteProgress} />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  if (isDeleting) {
                    cancelDelete()
                  } else {
                    setIsDeleteDialogOpen(false)
                    setFileToDelete(null)
                  }
                }}
              >
                {isDeleting ? "취소" : "닫기"}
              </Button>
              {!isDeleting && (
                <Button
                  variant="destructive"
                  onClick={confirmDeleteFile}
                >
                  삭제
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 다중 선택 삭제 확인 다이얼로그 */}
        <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>선택 항목 삭제</AlertDialogTitle>
              <AlertDialogDescription>
                선택한 {getSelectedFilesForAssignment().length}개 파일/폴더를 삭제하시겠습니까? 폴더는 그 안의 모든 파일이 함께 삭제되며, 이 작업은 되돌릴 수 없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const items = getSelectedFilesForAssignment()
                  if (items.length > 0) {
                    setIsBulkDeleteDialogOpen(false)
                    await deleteSelectedItems(items)
                  }
                }}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? `삭제 중... ${deleteProgress}%` : "삭제"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ZIP 비밀번호 입력 다이얼로그 */}
        <Dialog open={extractPasswordDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setExtractPasswordDialogOpen(false)
            setExtractPasswordFile(null)
            setExtractPasswordValue("")
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>ZIP 비밀번호</DialogTitle>
              <DialogDescription>
                비밀번호가 설정된 ZIP 파일입니다. 압축 해제를 위해 비밀번호를 입력해 주세요.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {extractPasswordFile && (
                <p className="text-sm text-muted-foreground">
                  파일: {extractPasswordFile.fileName || extractPasswordFile.key?.split("/").pop() || ""}
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="zip-password">비밀번호</Label>
                <Input
                  id="zip-password"
                  type="password"
                  value={extractPasswordValue}
                  onChange={(e) => setExtractPasswordValue(e.target.value)}
                  placeholder="ZIP 비밀번호 입력"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      if (extractPasswordFile) {
                        const file = extractPasswordFile
                        const pwd = extractPasswordValue
                        setExtractPasswordDialogOpen(false)
                        setExtractPasswordFile(null)
                        setExtractPasswordValue("")
                        handleExtractZip(file, pwd)
                      }
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setExtractPasswordDialogOpen(false)
                  setExtractPasswordFile(null)
                  setExtractPasswordValue("")
                }}
              >
                취소
              </Button>
              <Button
                onClick={() => {
                  if (extractPasswordFile) {
                    setExtractPasswordDialogOpen(false)
                    const file = extractPasswordFile
                    const pwd = extractPasswordValue
                    setExtractPasswordFile(null)
                    setExtractPasswordValue("")
                    handleExtractZip(file, pwd)
                  }
                }}
              >
                압축 해제
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
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(() => {
                // 공동 업무 (subtasks)가 있는 경우
                if (subtasks.length > 0) {
                  const assigneeNames: string[] = []
                  
                  // 메인 task 담당자
                  if (assignForm.assigned_to) {
                    const mainAssignee = users.find(u => u.id === assignForm.assigned_to)
                    if (mainAssignee) {
                      assigneeNames.push(mainAssignee.full_name || mainAssignee.email || '알 수 없음')
                    }
                  }
                  
                  // subtasks 담당자들
                  const subtaskAssignees = new Set(subtasks.flatMap(s => s.assignedToList))
                  subtaskAssignees.forEach(userId => {
                    const assignee = users.find(u => u.id === userId)
                    const userName = assignee?.full_name || assignee?.email || '알 수 없음'
                    if (!assigneeNames.includes(userName)) {
                      assigneeNames.push(userName)
                    }
                  })
                  
                  // subtasks에 담당자가 없는 것이 있으면 현재 로그인한 사용자 추가
                  const hasEmptyAssignees = subtasks.some(s => s.assignedToList.length === 0)
                  if (hasEmptyAssignees && user) {
                    const currentUserName = user.full_name || user.email || '알 수 없음'
                    if (!assigneeNames.includes(currentUserName)) {
                      assigneeNames.push(currentUserName)
                    }
                  }
                  
                  return `${assigneeNames.join(', ')}에게 업무 할당`
                }
                
                // 개별 업무 (메인 task만 있는 경우)
                if (assignForm.assigned_to) {
                  const assignedUser = users.find(u => u.id === assignForm.assigned_to)
                  const assignedName = assignedUser?.full_name || assignedUser?.email || "담당자"
                  return `${assignedName}에게 업무 할당`
                }
                
                return "업무 할당 확인"
              })()}
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              업무 할당 확인
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <span className="font-medium">중요도:</span> {
                assignForm.priority === "low" ? "낮음" :
                assignForm.priority === "medium" ? "보통" :
                assignForm.priority === "high" ? "높음" : "긴급"
              }
            </div>
            {assignForm.due_date && (
              <div>
                <span className="font-medium">마감일:</span> {format(assignForm.due_date, "yyyy-MM-dd", { locale: ko })}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setIsAssignConfirmDialogOpen(false)
                await handleAssignFiles()
                window.location.reload()
              }}
            >
              {(() => {
                const assigneeNames: string[] = []
                
                // 메인 task 담당자
                if (assignForm.assigned_to) {
                  const mainAssignee = users.find(u => u.id === assignForm.assigned_to)
                  if (mainAssignee) {
                    assigneeNames.push(mainAssignee.full_name || mainAssignee.email || '담당자')
                  }
                }
                
                // subtasks 담당자들
                if (subtasks.length > 0) {
                  const subtaskAssignees = new Set(subtasks.flatMap(s => s.assignedToList))
                  subtaskAssignees.forEach(userId => {
                    if (userId !== assignForm.assigned_to) {
                      const assignee = users.find(u => u.id === userId)
                      const userName = assignee?.full_name || assignee?.email
                      if (userName && !assigneeNames.includes(userName)) {
                        assigneeNames.push(userName)
                      }
                    }
                  })
                }
                
                if (assigneeNames.length > 1) {
                  return `${assigneeNames[0]} 외 ${assigneeNames.length - 1}명에게 할당`
                } else if (assigneeNames.length === 1) {
                  return `${assigneeNames[0]}에게 할당`
                }
                return "업무 할당"
              })()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 인원 선택 다이얼로그 */}
      <Dialog
        open={isUserSelectDialogOpen}
        onOpenChange={(open) => {
          setIsUserSelectDialogOpen(open)
          if (open) {
            loadUsers()
            if (user?.id) {
              setSelectedAssignees((prev) => {
                const next = new Set(prev)
                next.delete(user.id)
                return next
              })
            }
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>담당자 추가 (선택사항)</DialogTitle>
            <DialogDescription>
              다중 할당을 위해 담당자를 추가하세요. (복수 선택 가능)
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              {isUsersLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">사용자 목록 로딩 중...</p>
              ) : users.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">등록된 인원이 없습니다.</p>
              ) : (
              users
                .sort((a, b) => {
                  // 할당된 사용자를 먼저 표시
                  const aSelected = selectedAssignees.has(a.id)
                  const bSelected = selectedAssignees.has(b.id)
                  if (aSelected && !bSelected) return -1
                  if (!aSelected && bSelected) return 1
                  return 0
                })
                .map((u) => (
                <div
                  key={u.id}
                  className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => {
                    const newSet = new Set(selectedAssignees)
                    if (newSet.has(u.id)) {
                      newSet.delete(u.id)
                    } else {
                      newSet.add(u.id)
                    }
                    setSelectedAssignees(newSet)
                  }}
                >
                  <Checkbox
                    checked={selectedAssignees.has(u.id)}
                    onCheckedChange={(checked) => {
                      const newSet = new Set(selectedAssignees)
                      if (checked) {
                        newSet.add(u.id)
                      } else {
                        newSet.delete(u.id)
                      }
                      setSelectedAssignees(newSet)
                    }}
                  />
                  <div className="flex-1">
                    <div className="font-medium">
                      {u.full_name || u.email}
                      {u.organization && (
                        <span className="ml-2 text-sm text-muted-foreground font-normal">({u.organization})</span>
                      )}
                    </div>
                    {u.email && u.full_name && (
                      <div className="text-sm text-muted-foreground">{u.email}</div>
                    )}
                  </div>
                </div>
              ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsUserSelectDialogOpen(false)
              }}
            >
              취소
            </Button>
            <Button
              onClick={() => {
                setIsUserSelectDialogOpen(false)
                if (selectedAssignees.size > 0) {
                  const selectedUsers = Array.from(selectedAssignees).map(id => {
                    const user = users.find(u => u.id === id)
                    return user?.full_name || user?.email || '알 수 없음'
                  }).join(', ')
                  
                  toast({ 
                    title: `${selectedAssignees.size}명이 선택되었습니다`,
                    description: `선택된 담당자: ${selectedUsers}`
                  })
                }
              }}
            >
              확인 ({selectedAssignees.size}명)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

