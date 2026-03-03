"use client"

import { useState, useRef, useEffect } from "react"
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileSpreadsheet,
  Plus,
  Pencil,
  Trash2,
  FolderPlus,
  FilePlus,
  ChevronsDownUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export interface FolderNode {
  id: string
  parent_id: string | null
  name: string
  children: FolderNode[]
  files: FileNode[]
}

export interface FileNode {
  id: string
  folder_id: string | null
  name: string
  updated_at: string
}

interface Props {
  folders: FolderNode[]
  rootFiles: FileNode[]
  selectedFileId: string | null
  onSelectFile: (file: FileNode) => void
  onCreateFolder: (parentId: string | null, name: string) => Promise<void>
  onRenameFolder: (id: string, name: string) => Promise<void>
  onDeleteFolder: (id: string) => Promise<void>
  onCreateFile: (folderId: string | null, name: string) => Promise<void>
  onRenameFile: (id: string, name: string) => Promise<void>
  onDeleteFile: (id: string) => Promise<void>
}

type InlineAction =
  | { type: "create-folder"; parentId: string | null }
  | { type: "create-file"; folderId: string | null }
  | { type: "rename-folder"; id: string }
  | { type: "rename-file"; id: string }

export function FolderTree({
  folders,
  rootFiles,
  selectedFileId,
  onSelectFile,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [inlineAction, setInlineAction] = useState<InlineAction | null>(null)
  const [inputValue, setInputValue] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "folder" | "file"
    id: string
    name: string
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inlineAction) {
      // DropdownMenu가 완전히 닫힌 후 포커스 (aria-hidden 충돌 방지)
      setTimeout(() => inputRef.current?.focus(), 120)
    }
  }, [inlineAction])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const startCreate = (type: "folder" | "file", parentId: string | null) => {
    setInlineAction(
      type === "folder"
        ? { type: "create-folder", parentId }
        : { type: "create-file", folderId: parentId }
    )
    setInputValue("")
    if (parentId) setExpanded((prev) => new Set([...prev, parentId]))
  }

  const startRename = (type: "folder" | "file", id: string, currentName: string) => {
    setInlineAction(
      type === "folder" ? { type: "rename-folder", id } : { type: "rename-file", id }
    )
    setInputValue(currentName)
  }

  const submitInlineAction = async () => {
    const name = inputValue.trim()
    if (!name || !inlineAction) {
      setInlineAction(null)
      return
    }
    const action = inlineAction
    setInlineAction(null)
    if (action.type === "create-folder") await onCreateFolder(action.parentId, name)
    else if (action.type === "create-file") await onCreateFile(action.folderId, name)
    else if (action.type === "rename-folder") await onRenameFolder(action.id, name)
    else if (action.type === "rename-file") await onRenameFile(action.id, name)
  }

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter") await submitInlineAction()
    else if (e.key === "Escape") setInlineAction(null)
  }

  const confirmDelete = async () => {
    if (!deleteConfirm) return
    if (deleteConfirm.type === "folder") await onDeleteFolder(deleteConfirm.id)
    else await onDeleteFile(deleteConfirm.id)
    setDeleteConfirm(null)
  }

  const renderInput = (placeholder: string) => (
    <Input
      ref={inputRef}
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={submitInlineAction}
      placeholder={placeholder}
      className="h-6 text-xs px-2 flex-1 min-w-0"
      onClick={(e) => e.stopPropagation()}
    />
  )

  const renderRowActions = (type: "folder" | "file", id: string, name: string) => (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 ml-auto shrink-0">
      {type === "folder" && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={(e) => e.stopPropagation()}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => setTimeout(() => startCreate("folder", id), 100)}
            >
              <FolderPlus className="mr-2 h-4 w-4" />
              하위 폴더
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTimeout(() => startCreate("file", id), 100)}
            >
              <FilePlus className="mr-2 h-4 w-4" />
              새 파일
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5"
        onClick={(e) => {
          e.stopPropagation()
          startRename(type, id, name)
        }}
      >
        <Pencil className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 text-destructive hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation()
          setDeleteConfirm({ type, id, name })
        }}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  )

  const renderFolder = (folder: FolderNode, depth = 0): React.ReactNode => {
    const isExpanded = expanded.has(folder.id)
    const isRenaming = inlineAction?.type === "rename-folder" && inlineAction.id === folder.id
    const isCreatingChild =
      inlineAction &&
      ((inlineAction.type === "create-folder" && inlineAction.parentId === folder.id) ||
        (inlineAction.type === "create-file" && inlineAction.folderId === folder.id))

    return (
      <div key={folder.id}>
        <div
          className="flex items-center gap-1 py-1 rounded-sm hover:bg-muted/50 cursor-pointer group"
          style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: "8px" }}
          onClick={() => toggleExpand(folder.id)}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-yellow-500" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-yellow-500" />
          )}
          {isRenaming ? (
            renderInput("폴더 이름...")
          ) : (
            <span className="text-sm truncate flex-1 min-w-0">{folder.name}</span>
          )}
          {!isRenaming && renderRowActions("folder", folder.id, folder.name)}
        </div>

        {isExpanded && (
          <div>
            {isCreatingChild && (
              <div
                className="flex items-center gap-1 py-1"
                style={{ paddingLeft: `${8 + (depth + 1) * 14 + 3.5 + 4}px`, paddingRight: "8px" }}
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                {renderInput(
                  inlineAction?.type === "create-folder" ? "폴더 이름..." : "파일 이름..."
                )}
              </div>
            )}
            {folder.children.map((c) => renderFolder(c, depth + 1))}
            {folder.files.map((f) => renderFile(f, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const renderFile = (file: FileNode, depth = 0): React.ReactNode => {
    const isSelected = selectedFileId === file.id
    const isRenaming = inlineAction?.type === "rename-file" && inlineAction.id === file.id

    return (
      <div
        key={file.id}
        className={`flex items-center gap-1 py-1 rounded-sm hover:bg-muted/50 cursor-pointer group ${
          isSelected ? "bg-primary/10" : ""
        }`}
        style={{ paddingLeft: `${8 + depth * 14 + 3.5 + 4}px`, paddingRight: "8px" }}
        onClick={() => !isRenaming && onSelectFile(file)}
      >
        <FileSpreadsheet
          className={`h-4 w-4 shrink-0 ${isSelected ? "text-primary" : "text-green-600"}`}
        />
        {isRenaming ? (
          renderInput("파일 이름...")
        ) : (
          <span
            className={`text-sm truncate flex-1 min-w-0 ${isSelected ? "text-primary font-medium" : ""}`}
          >
            {file.name}
          </span>
        )}
        {!isRenaming && renderRowActions("file", file.id, file.name)}
      </div>
    )
  }

  const isCreatingAtRoot =
    inlineAction &&
    ((inlineAction.type === "create-folder" && inlineAction.parentId === null) ||
      (inlineAction.type === "create-file" && inlineAction.folderId === null))

  const isEmpty = folders.length === 0 && rootFiles.length === 0 && !isCreatingAtRoot

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-sm font-semibold text-foreground">파일 탐색기</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setExpanded(new Set())}
            title="전부 접기"
            disabled={expanded.size === 0}
          >
            <ChevronsDownUp className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => setTimeout(() => startCreate("folder", null), 100)}
            >
              <FolderPlus className="mr-2 h-4 w-4" />
              새 폴더
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTimeout(() => startCreate("file", null), 100)}
            >
              <FilePlus className="mr-2 h-4 w-4" />
              새 파일
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {isCreatingAtRoot && (
          <div className="flex items-center gap-1 py-1 px-2">
            <div className="w-3.5 shrink-0" />
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
            {renderInput(
              inlineAction?.type === "create-folder" ? "폴더 이름..." : "파일 이름..."
            )}
          </div>
        )}
        {rootFiles.map((f) => renderFile(f, 0))}
        {folders.map((f) => renderFolder(f, 0))}
        {isEmpty && (
          <p className="px-3 py-6 text-xs text-muted-foreground text-center">
            우측 상단 + 버튼으로 폴더 또는 파일을 추가하세요
          </p>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === "folder"
                ? `"${deleteConfirm?.name}" 폴더와 모든 하위 항목이 삭제됩니다.`
                : `"${deleteConfirm?.name}" 파일과 모든 데이터가 삭제됩니다.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
