"use client"

import { useState, useEffect, useCallback } from "react"
import { FolderTree, type FolderNode, type FileNode } from "./components/FolderTree"
import { SpreadsheetTable } from "./components/SpreadsheetTable"
import { FileSpreadsheet } from "lucide-react"
import type { SpreadsheetFolder, SpreadsheetFile } from "@/lib/database/spreadsheet"
import { useToast } from "@/hooks/use-toast"

// ── Helpers ───────────────────────────────────────────────────────────────────

/** 폴더 id → parent_id 맵을 사용하여 파일이 삭제된 폴더 트리 안에 있는지 재귀 확인 */
function isFileInDeletedTree(
  fileFolderId: string | null,
  deletedFolderId: string,
  folderParentMap: Map<string, string | null>
): boolean {
  let currentId: string | null = fileFolderId
  while (currentId !== null) {
    if (currentId === deletedFolderId) return true
    currentId = folderParentMap.get(currentId) ?? null
  }
  return false
}

function getFilesInFolder(
  folderId: string | null,
  folders: FolderNode[],
  rootFiles: FileNode[]
): FileNode[] {
  if (!folderId) return rootFiles
  const find = (nodes: FolderNode[]): FolderNode | null => {
    for (const n of nodes) {
      if (n.id === folderId) return n
      const found = find(n.children)
      if (found) return found
    }
    return null
  }
  return find(folders)?.files ?? []
}

function resolveUniqueName(base: string, existingNames: string[]): string {
  const names = new Set(existingNames)
  if (!names.has(base)) return base
  let n = 2
  while (names.has(`${base} (${n})`)) n++
  return `${base} (${n})`
}

// ── Tree builder ──────────────────────────────────────────────────────────────

function buildTree(
  folders: SpreadsheetFolder[],
  files: SpreadsheetFile[]
): { roots: FolderNode[]; rootFiles: FileNode[] } {
  const nodeMap = new Map<string, FolderNode>()
  folders.forEach((f) => nodeMap.set(f.id, { ...f, children: [], files: [] }))

  const roots: FolderNode[] = []
  folders.forEach((f) => {
    const node = nodeMap.get(f.id)!
    if (!f.parent_id) roots.push(node)
    else nodeMap.get(f.parent_id)?.children.push(node) ?? roots.push(node)
  })

  const rootFiles: FileNode[] = []
  files.forEach((f) => {
    const treeFile: FileNode = {
      id: f.id,
      folder_id: f.folder_id,
      name: f.name,
      updated_at: f.updated_at,
    }
    if (!f.folder_id) rootFiles.push(treeFile)
    else nodeMap.get(f.folder_id)?.files.push(treeFile) ?? rootFiles.push(treeFile)
  })

  return { roots, rootFiles }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SpreadsheetPage() {
  const { toast } = useToast()
  const [folders, setFolders] = useState<FolderNode[]>([])
  const [rootFiles, setRootFiles] = useState<FileNode[]>([])
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null)
  const [fileData, setFileData] = useState<{
    headers: string[]
    rows: Record<string, string>[]
  } | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(false)

  // ── Load tree ────────────────────────────────────────────────────────────

  const loadTree = useCallback(async () => {
    try {
      const res = await fetch("/api/spreadsheet/tree", { credentials: "include" })
      if (!res.ok) return
      const data = await res.json()
      const { roots, rootFiles } = buildTree(data.folders, data.files)
      setFolders(roots)
      setRootFiles(rootFiles)
    } catch (err) {
      console.error("loadTree error:", err)
    }
  }, [])

  useEffect(() => {
    loadTree()
  }, [loadTree])

  // ── Select file ──────────────────────────────────────────────────────────

  const handleSelectFile = async (file: FileNode) => {
    setSelectedFile(file)
    setIsLoadingData(true)
    try {
      const res = await fetch(`/api/spreadsheet/files/${file.id}/data`, {
        credentials: "include",
      })
      if (!res.ok) return
      const { file: meta, rows } = await res.json()
      setFileData({ headers: meta.headers ?? [], rows: rows ?? [] })
    } catch (err) {
      console.error("handleSelectFile error:", err)
    } finally {
      setIsLoadingData(false)
    }
  }

  // ── Folder CRUD ──────────────────────────────────────────────────────────

  const handleCreateFolder = async (parentId: string | null, name: string) => {
    await fetch("/api/spreadsheet/folders", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId, name }),
    })
    await loadTree()
  }

  const handleRenameFolder = async (id: string, name: string) => {
    await fetch(`/api/spreadsheet/folders/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    await loadTree()
  }

  const handleDeleteFolder = async (id: string) => {
    await fetch(`/api/spreadsheet/folders/${id}`, {
      method: "DELETE",
      credentials: "include",
    })
    // 선택된 파일이 삭제 폴더 트리(중첩 포함) 안에 있으면 선택 해제
    if (selectedFile?.folder_id) {
      const folderParentMap = new Map<string, string | null>()
      const collectMap = (nodes: typeof folders) => {
        nodes.forEach((n) => {
          folderParentMap.set(n.id, n.parent_id)
          collectMap(n.children)
        })
      }
      collectMap(folders)
      if (isFileInDeletedTree(selectedFile.folder_id, id, folderParentMap)) {
        setSelectedFile(null)
        setFileData(null)
      }
    }
    await loadTree()
  }

  // ── File CRUD ────────────────────────────────────────────────────────────

  const handleCreateFile = async (folderId: string | null, name: string) => {
    const res = await fetch("/api/spreadsheet/files", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId, name }),
    })
    await loadTree()
    if (res.ok) {
      const newFile: SpreadsheetFile = await res.json()
      setSelectedFile({
        id: newFile.id,
        folder_id: newFile.folder_id,
        name: newFile.name,
        updated_at: newFile.updated_at,
      })
      setFileData({ headers: [], rows: [] })
    }
  }

  const handleRenameFile = async (id: string, name: string) => {
    await fetch(`/api/spreadsheet/files/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    if (selectedFile?.id === id) {
      setSelectedFile((prev) => (prev ? { ...prev, name } : prev))
    }
    await loadTree()
  }

  const handleDeleteFile = async (id: string) => {
    await fetch(`/api/spreadsheet/files/${id}`, {
      method: "DELETE",
      credentials: "include",
    })
    if (selectedFile?.id === id) {
      setSelectedFile(null)
      setFileData(null)
    }
    await loadTree()
  }

  // ── Data save / import / export ──────────────────────────────────────────

  const handleSave = async (headers: string[], rows: Record<string, string>[]) => {
    if (!selectedFile) return
    const res = await fetch(`/api/spreadsheet/files/${selectedFile.id}/data`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headers, rows }),
    })
    if (!res.ok) throw new Error("Save failed")
  }

  // xlsx → 새 파일 생성 (중복 시 (2), (3), ... 처리)
  const handleImport = async (file: File): Promise<void> => {
    const rawName = file.name.replace(/\.[^.]+$/, "")
    const folderId = selectedFile?.folder_id ?? null
    const existingNames = getFilesInFolder(folderId, folders, rootFiles).map((f) => f.name)
    const name = resolveUniqueName(rawName, existingNames)

    const createRes = await fetch("/api/spreadsheet/files", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId, name }),
    })
    if (!createRes.ok) throw new Error("파일 생성 실패")
    const newFile: SpreadsheetFile = await createRes.json()

    const formData = new FormData()
    formData.append("file", file)
    const importRes = await fetch(`/api/spreadsheet/files/${newFile.id}/import`, {
      method: "POST",
      credentials: "include",
      body: formData,
    })
    if (!importRes.ok) throw new Error("가져오기 실패")
    const result = await importRes.json()

    await loadTree()
    setSelectedFile({
      id: newFile.id,
      folder_id: newFile.folder_id,
      name: newFile.name,
      updated_at: newFile.updated_at,
    })
    setFileData({ headers: result.headers, rows: result.rows })
    toast({
      title: "가져오기 완료",
      description: `"${name}" 파일이 생성되었습니다. (${result.headers.length}개 컬럼, ${result.rows.length}행)`,
    })
  }

  // xlsx → 현재 파일에 덮어쓰기
  const handleOverwrite = async (
    file: File
  ): Promise<{ headers: string[]; rows: Record<string, string>[] }> => {
    if (!selectedFile) throw new Error("선택된 파일 없음")
    const formData = new FormData()
    formData.append("file", file)
    const res = await fetch(`/api/spreadsheet/files/${selectedFile.id}/import`, {
      method: "POST",
      credentials: "include",
      body: formData,
    })
    if (!res.ok) throw new Error("덮어쓰기 실패")
    return res.json()
  }

  const handleExport = () => {
    if (!selectedFile) return
    const a = document.createElement("a")
    a.href = `/api/spreadsheet/files/${selectedFile.id}/export`
    a.click()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-65px)] overflow-hidden">
      {/* Left panel – folder tree */}
      <div className="w-64 shrink-0 border-r bg-card flex flex-col">
        <FolderTree
          folders={folders}
          rootFiles={rootFiles}
          selectedFileId={selectedFile?.id ?? null}
          onSelectFile={handleSelectFile}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onCreateFile={handleCreateFile}
          onRenameFile={handleRenameFile}
          onDeleteFile={handleDeleteFile}
        />
      </div>

      {/* Right panel – spreadsheet */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedFile && fileData ? (
          isLoadingData ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              데이터를 불러오는 중...
            </div>
          ) : (
            <SpreadsheetTable
              key={selectedFile.id}
              fileId={selectedFile.id}
              fileName={selectedFile.name}
              initialHeaders={fileData.headers}
              initialRows={fileData.rows}
              onSave={handleSave}
              onImport={handleImport}
              onOverwrite={handleOverwrite}
              onExport={handleExport}
            />
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <FileSpreadsheet className="h-12 w-12 opacity-20" />
            <p className="text-sm">좌측에서 파일을 선택하세요</p>
          </div>
        )}
      </div>
    </div>
  )
}
