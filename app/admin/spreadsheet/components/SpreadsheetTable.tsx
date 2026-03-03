"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Download,
  Save,
  Plus,
  Trash2,
  Loader2,
  PlusSquare,
  Columns,
  FilePlus,
  FileUp,
  ChevronDown,
  Undo2,
  Redo2,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_COLS = 10
const DEFAULT_ROWS = 50
const DEFAULT_COL_WIDTH = 120
const MIN_COL_WIDTH = 60
const MAX_HISTORY = 50

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDefaultHeaders(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `컬럼 ${i + 1}`)
}

function makeDefaultRows(headers: string[], n: number): Record<string, string>[] {
  return Array.from({ length: n }, () =>
    Object.fromEntries(headers.map((h) => [h, ""]))
  )
}

function initGrid(headers: string[], rows: Record<string, string>[]) {
  if (headers.length > 0) return { headers, rows }
  const h = makeDefaultHeaders(DEFAULT_COLS)
  return { headers: h, rows: makeDefaultRows(h, DEFAULT_ROWS) }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Snapshot = { headers: string[]; rows: Record<string, string>[] }

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  fileId: string
  fileName: string
  initialHeaders: string[]
  initialRows: Record<string, string>[]
  onSave: (headers: string[], rows: Record<string, string>[]) => Promise<void>
  /** 새 파일로 가져오기 – 컴포넌트 remount로 처리됨 */
  onImport: (file: File) => Promise<void>
  /** 현재 파일에 덮어쓰기 – 로컬 state 갱신 */
  onOverwrite: (file: File) => Promise<{ headers: string[]; rows: Record<string, string>[] }>
  onExport: () => void
}

export function SpreadsheetTable({
  fileId,
  fileName,
  initialHeaders,
  initialRows,
  onSave,
  onImport,
  onOverwrite,
  onExport,
}: Props) {
  const { toast } = useToast()

  const { headers: initH, rows: initR } = initGrid(initialHeaders, initialRows)

  // ── Data state ────────────────────────────────────────────────────────────
  const [headers, setHeaders] = useState<string[]>(initH)
  const [rows, setRows] = useState<Record<string, string>[]>(initR)
  const [hasChanges, setHasChanges] = useState(initialHeaders.length === 0)
  const [isSaving, setIsSaving] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  // ── Cell range selection ──────────────────────────────────────────────────
  const [selStart, setSelStart] = useState<{ row: number; col: number } | null>(null)
  const [selEnd, setSelEnd] = useState<{ row: number; col: number } | null>(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{ row: number; col: number } | null>(null)
  const hasDraggedRef = useRef(false) // 다른 셀로 드래그했는지 여부

  const inSelection = (row: number, col: number): boolean => {
    if (!selStart || !selEnd) return false
    const r0 = Math.min(selStart.row, selEnd.row)
    const r1 = Math.max(selStart.row, selEnd.row)
    const c0 = Math.min(selStart.col, selEnd.col)
    const c1 = Math.max(selStart.col, selEnd.col)
    return row >= r0 && row <= r1 && col >= c0 && col <= c1
  }

  const selRowCount = selStart && selEnd ? Math.abs(selEnd.row - selStart.row) + 1 : 0
  const selColCount = selStart && selEnd ? Math.abs(selEnd.col - selStart.col) + 1 : 0
  const isMultiSel = selRowCount > 1 || selColCount > 1

  const clearSel = () => { setSelStart(null); setSelEnd(null) }

  // ── Undo/Redo history (ref 기반: re-render 최소화) ────────────────────────
  const historyRef = useRef<Snapshot[]>([])
  const redoRef = useRef<Snapshot[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  // 최신 headers/rows를 항상 참조하기 위한 ref (stale closure 방지)
  const latestRef = useRef<Snapshot>({ headers: initH, rows: initR })
  latestRef.current = { headers, rows }

  // ── Column widths (드래그 리사이즈) ──────────────────────────────────────
  const [colWidths, setColWidths] = useState<number[]>(() =>
    Array(initH.length).fill(DEFAULT_COL_WIDTH)
  )
  const colWidthsRef = useRef(colWidths)
  colWidthsRef.current = colWidths
  const resizingRef = useRef<{ colIdx: number; startX: number; startWidth: number } | null>(null)

  // ── Editing state ─────────────────────────────────────────────────────────
  const [editCell, setEditCell] = useState<{ row: number; col: number } | null>(null)
  const [editHeader, setEditHeader] = useState<number | null>(null)
  const [editValue, setEditValue] = useState<string>("")
  const cellInputRef = useRef<HTMLInputElement>(null)
  const headerInputRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const overwriteFileRef = useRef<HTMLInputElement>(null)

  // ── Reset when file changes ───────────────────────────────────────────────
  useEffect(() => {
    const { headers: h, rows: r } = initGrid(initialHeaders, initialRows)
    setHeaders(h)
    setRows(r)
    setHasChanges(initialHeaders.length === 0)
    setEditCell(null)
    setEditHeader(null)
    setEditValue("")
    historyRef.current = []
    redoRef.current = []
    setCanUndo(false)
    setCanRedo(false)
    setColWidths(Array(h.length).fill(DEFAULT_COL_WIDTH))
    clearSel()
  }, [fileId])

  // Auto-focus inputs
  useEffect(() => {
    if (editCell !== null) setTimeout(() => cellInputRef.current?.focus(), 10)
  }, [editCell])
  useEffect(() => {
    if (editHeader !== null) {
      setTimeout(() => {
        headerInputRef.current?.focus()
        headerInputRef.current?.select()
      }, 10)
    }
  }, [editHeader])

  const markChanged = () => setHasChanges(true)

  // ── History API ───────────────────────────────────────────────────────────

  const adjustColWidths = (targetLen: number) =>
    setColWidths((prev) => {
      const diff = targetLen - prev.length
      if (diff > 0) return [...prev, ...Array(diff).fill(DEFAULT_COL_WIDTH)]
      if (diff < 0) return prev.slice(0, targetLen)
      return prev
    })

  const pushHistory = useCallback(() => {
    const { headers, rows } = latestRef.current
    historyRef.current = [
      ...historyRef.current.slice(-MAX_HISTORY + 1),
      { headers: [...headers], rows: rows.map((r) => ({ ...r })) },
    ]
    // 새 액션이 발생하면 redo 스택 초기화
    redoRef.current = []
    setCanUndo(true)
    setCanRedo(false)
  }, [])

  const undoAction = useCallback(() => {
    if (historyRef.current.length === 0) return
    const snapshot = historyRef.current[historyRef.current.length - 1]
    historyRef.current = historyRef.current.slice(0, -1)
    // 현재 상태를 redo 스택에 push
    const { headers: ch, rows: cr } = latestRef.current
    redoRef.current = [
      ...redoRef.current.slice(-MAX_HISTORY + 1),
      { headers: [...ch], rows: cr.map((r) => ({ ...r })) },
    ]
    setHeaders(snapshot.headers)
    setRows(snapshot.rows)
    adjustColWidths(snapshot.headers.length)
    const remaining = historyRef.current.length
    setCanUndo(remaining > 0)
    setCanRedo(true)
    if (remaining === 0 && initialHeaders.length > 0) setHasChanges(false)
  }, [initialHeaders.length])

  const redoAction = useCallback(() => {
    if (redoRef.current.length === 0) return
    const snapshot = redoRef.current[redoRef.current.length - 1]
    redoRef.current = redoRef.current.slice(0, -1)
    // 현재 상태를 undo 스택에 push
    const { headers: ch, rows: cr } = latestRef.current
    historyRef.current = [
      ...historyRef.current.slice(-MAX_HISTORY + 1),
      { headers: [...ch], rows: cr.map((r) => ({ ...r })) },
    ]
    setHeaders(snapshot.headers)
    setRows(snapshot.rows)
    adjustColWidths(snapshot.headers.length)
    setCanUndo(true)
    setCanRedo(redoRef.current.length > 0)
    setHasChanges(true)
  }, [])

  // ── Selection: 범위 내 셀 값 비우기 ─────────────────────────────────────
  const deleteSelContent = useCallback(() => {
    if (!selStart || !selEnd) return
    const r0 = Math.min(selStart.row, selEnd.row)
    const r1 = Math.max(selStart.row, selEnd.row)
    const c0 = Math.min(selStart.col, selEnd.col)
    const c1 = Math.max(selStart.col, selEnd.col)
    pushHistory()
    setRows((prev) =>
      prev.map((row, ri) => {
        if (ri < r0 || ri > r1) return row
        const updated = { ...row }
        for (let ci = c0; ci <= c1; ci++) updated[latestRef.current.headers[ci]] = ""
        return updated
      })
    )
    markChanged()
  }, [selStart, selEnd, pushHistory])

  // ── 드래그 선택: 전역 mouseup 감지 ──────────────────────────────────────
  useEffect(() => {
    const handler = () => { isDraggingRef.current = false }
    document.addEventListener("mouseup", handler)
    return () => document.removeEventListener("mouseup", handler)
  }, [])

  // ── 키보드 단축키 ─────────────────────────────────────────────────────────
  // Ctrl+Z / Ctrl+Shift+Z / Delete / Escape / Ctrl+A
  // (셀/헤더 편집 중에는 브라우저 기본 동작 유지)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editCell !== null || editHeader !== null) return

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault(); undoAction()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "Z" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault(); redoAction()
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault(); redoAction()
      } else if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault()
        setSelStart({ row: 0, col: 0 })
        setSelEnd({ row: latestRef.current.rows.length - 1, col: latestRef.current.headers.length - 1 })
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selStart && selEnd) { e.preventDefault(); deleteSelContent() }
      } else if (e.key === "Escape") {
        if (selStart || selEnd) { e.preventDefault(); clearSel() }
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        if (selStart) {
          e.preventDefault()
          const r = selStart.row
          const c = selStart.col
          const newRow =
            e.key === "ArrowUp" ? Math.max(0, r - 1) :
            e.key === "ArrowDown" ? Math.min(latestRef.current.rows.length - 1, r + 1) : r
          const newCol =
            e.key === "ArrowLeft" ? Math.max(0, c - 1) :
            e.key === "ArrowRight" ? Math.min(latestRef.current.headers.length - 1, c + 1) : c
          setSelStart({ row: newRow, col: newCol })
          setSelEnd({ row: newRow, col: newCol })
        }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [editCell, editHeader, undoAction, redoAction, deleteSelContent, selStart, selEnd])

  // ── Column resize ──────────────────────────────────────────────────────────

  const startResize = useCallback((colIdx: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startWidth = colWidthsRef.current[colIdx] ?? DEFAULT_COL_WIDTH
    resizingRef.current = { colIdx, startX: e.clientX, startWidth }

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      const { colIdx: ci, startX, startWidth: sw } = resizingRef.current
      const newWidth = Math.max(MIN_COL_WIDTH, sw + ev.clientX - startX)
      setColWidths((prev) => {
        const next = [...prev]
        next[ci] = newWidth
        return next
      })
    }

    const onMouseUp = () => {
      resizingRef.current = null
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }, [])

  // ── Cell editing ──────────────────────────────────────────────────────────

  const startEditCell = (rowIdx: number, colIdx: number) => {
    const val = rows[rowIdx]?.[headers[colIdx]] ?? ""
    setEditCell({ row: rowIdx, col: colIdx })
    setEditValue(String(val))
  }

  // ref로 즉시 추적하여 onBlur + keydown 이중 호출 방지
  const editCellConfirmedRef = useRef(false)
  useEffect(() => {
    editCellConfirmedRef.current = false
  }, [editCell])

  const confirmEditCell = useCallback(() => {
    if (!editCell) return
    if (editCellConfirmedRef.current) return
    editCellConfirmedRef.current = true
    const { row, col } = editCell
    const oldVal = latestRef.current.rows[row]?.[latestRef.current.headers[col]] ?? ""
    setEditCell(null)
    if (String(oldVal) === editValue) return
    pushHistory()
    setRows((prev) => {
      const next = [...prev]
      next[row] = { ...next[row], [headers[col]]: editValue }
      return next
    })
    markChanged()
  }, [editCell, editValue, headers, pushHistory])

  const handleCellKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    if (e.key === "Escape") { setEditCell(null); return }

    // 화살표: 편집 확정 후 인접 셀로 선택 이동
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault()
      confirmEditCell()
      const newRow =
        e.key === "ArrowUp" ? Math.max(0, rowIdx - 1) :
        e.key === "ArrowDown" ? Math.min(rows.length - 1, rowIdx + 1) : rowIdx
      const newCol =
        e.key === "ArrowLeft" ? Math.max(0, colIdx - 1) :
        e.key === "ArrowRight" ? Math.min(headers.length - 1, colIdx + 1) : colIdx
      setTimeout(() => {
        setSelStart({ row: newRow, col: newCol })
        setSelEnd({ row: newRow, col: newCol })
      }, 20)
      return
    }

    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      confirmEditCell()
      if (e.key === "Tab" && !e.shiftKey) {
        const nextCol = colIdx + 1 < headers.length ? colIdx + 1 : 0
        const nextRow = colIdx + 1 < headers.length ? rowIdx : rowIdx + 1
        if (nextRow < rows.length) setTimeout(() => {
          setSelStart({ row: nextRow, col: nextCol })
          setSelEnd({ row: nextRow, col: nextCol })
        }, 20)
      } else if (e.key === "Enter") {
        const nextRow = rowIdx + 1 < rows.length ? rowIdx + 1 : rowIdx
        setTimeout(() => {
          setSelStart({ row: nextRow, col: colIdx })
          setSelEnd({ row: nextRow, col: colIdx })
        }, 20)
      }
    }
  }

  // ── Header editing ────────────────────────────────────────────────────────

  const startEditHeader = (colIdx: number) => {
    const name = headers[colIdx] ?? ""
    setEditValue(name)
    setEditHeader(colIdx)
  }

  const confirmEditHeader = useCallback(() => {
    if (editHeader === null) return
    const newName = editValue.trim()
    const oldName = headers[editHeader]
    setEditHeader(null)
    if (!newName || newName === oldName) return
    pushHistory()
    setHeaders((prev) => prev.map((h, i) => (i === editHeader ? newName : h)))
    setRows((prev) =>
      prev.map((row) => {
        if (!(oldName in row)) return row
        const next = { ...row, [newName]: row[oldName] }
        delete next[oldName]
        return next
      })
    )
    markChanged()
  }, [editHeader, editValue, headers, pushHistory])

  const handleHeaderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") confirmEditHeader()
    else if (e.key === "Escape") setEditHeader(null)
  }

  // ── Row / Column mutations ────────────────────────────────────────────────

  const addRow = () => {
    const empty: Record<string, string> = {}
    headers.forEach((h) => (empty[h] = ""))
    pushHistory()
    setRows((prev) => [...prev, empty])
    markChanged()
  }

  const deleteRow = (idx: number) => {
    pushHistory()
    setRows((prev) => prev.filter((_, i) => i !== idx))
    markChanged()
  }

  const addColumn = () => {
    let name = "새 컬럼"
    let n = 1
    while (headers.includes(name)) name = `새 컬럼 ${++n}`
    const newColIdx = headers.length
    pushHistory()
    setHeaders((prev) => [...prev, name])
    setRows((prev) => prev.map((row) => ({ ...row, [name]: "" })))
    setColWidths((prev) => [...prev, DEFAULT_COL_WIDTH])
    markChanged()
    setEditValue(name)
    setTimeout(() => setEditHeader(newColIdx), 30)
  }

  const deleteColumn = (colIdx: number) => {
    const col = headers[colIdx]
    pushHistory()
    setHeaders((prev) => prev.filter((_, i) => i !== colIdx))
    setRows((prev) =>
      prev.map((row) => {
        const next = { ...row }
        delete next[col]
        return next
      })
    )
    setColWidths((prev) => prev.filter((_, i) => i !== colIdx))
    markChanged()
  }

  // ── Save / Import / Export ────────────────────────────────────────────────

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave(headers, rows)
      setHasChanges(false)
      toast({ title: "저장 완료", description: `${rows.length}행이 저장되었습니다.` })
    } catch {
      toast({ title: "저장 실패", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setIsImporting(true)
    try {
      await onImport(file)
    } catch {
      toast({ title: "가져오기 실패", variant: "destructive" })
      setIsImporting(false)
    }
  }

  const handleOverwriteFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setIsImporting(true)
    try {
      const result = await onOverwrite(file)
      setHeaders(result.headers)
      setRows(result.rows)
      setColWidths(Array(result.headers.length).fill(DEFAULT_COL_WIDTH))
      historyRef.current = []
      redoRef.current = []
      setCanUndo(false)
      setCanRedo(false)
      setHasChanges(false)
      toast({
        title: "덮어쓰기 완료",
        description: `${result.headers.length}개 컬럼, ${result.rows.length}행`,
      })
    } catch {
      toast({ title: "덮어쓰기 실패", variant: "destructive" })
    } finally {
      setIsImporting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isEmpty = headers.length === 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b shrink-0 bg-card flex-wrap">
        <span className="text-sm font-semibold truncate max-w-[200px]" title={fileName}>
          {fileName}
        </span>
        {hasChanges && (
          <span className="text-xs text-orange-500 font-medium">(변경됨)</span>
        )}
        <div className="flex-1" />

        {/* Undo / Redo */}
        <Button
          variant="ghost"
          size="sm"
          onClick={undoAction}
          disabled={!canUndo}
          title="되돌리기 (Ctrl+Z)"
          className="h-7 w-7 p-0"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={redoAction}
          disabled={!canRedo}
          title="다시 실행 (Ctrl+Shift+Z)"
          className="h-7 w-7 p-0"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>

        {/* Import dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isImporting || isSaving}>
              {isImporting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
              )}
              xlsx 가져오기
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => setTimeout(() => importFileRef.current?.click(), 100)}
            >
              <FilePlus className="mr-2 h-4 w-4" />
              새 파일로 가져오기
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setTimeout(() => overwriteFileRef.current?.click(), 100)}
              className="text-orange-600 focus:text-orange-600"
            >
              <FileUp className="mr-2 h-4 w-4" />
              현재 파일에 덮어쓰기
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" size="sm" onClick={onExport} disabled={isEmpty}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          xlsx 내보내기
        </Button>
        <Button variant="outline" size="sm" onClick={addColumn}>
          <Columns className="mr-1.5 h-3.5 w-3.5" />
          컬럼 추가
        </Button>
        <Button variant="outline" size="sm" onClick={addRow} disabled={isEmpty}>
          <PlusSquare className="mr-1.5 h-3.5 w-3.5" />
          행 추가
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="bg-primary"
        >
          {isSaving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          저장
        </Button>
        <input ref={importFileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFile} />
        <input ref={overwriteFileRef} type="file" accept=".xlsx" className="hidden" onChange={handleOverwriteFile} />
      </div>

      {/* Table */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <p className="text-sm">컬럼을 추가하거나 xlsx를 가져오세요.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => importFileRef.current?.click()}>
              <FilePlus className="mr-2 h-4 w-4" />
              xlsx 가져오기
            </Button>
            <Button variant="outline" onClick={addColumn}>
              <Plus className="mr-2 h-4 w-4" />
              컬럼 추가
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table
            className="text-sm border-collapse"
            style={{ tableLayout: "fixed", minWidth: "100%" }}
          >
            <colgroup>
              {/* 행 번호 열 */}
              <col style={{ width: 36 }} />
              {headers.map((_, i) => (
                <col key={i} style={{ width: colWidths[i] ?? DEFAULT_COL_WIDTH }} />
              ))}
              {/* 컬럼 추가 버튼 열 */}
              <col style={{ width: 32 }} />
            </colgroup>

            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="border border-border px-1 py-1 text-center text-xs text-muted-foreground font-normal bg-muted/80 sticky left-0 z-20">
                  #
                </th>
                {headers.map((h, colIdx) => (
                  <th
                    key={colIdx}
                    className="border border-border px-2 py-1 text-left font-semibold bg-muted group relative overflow-hidden"
                  >
                    {editHeader === colIdx ? (
                      <Input
                        ref={headerInputRef}
                        value={editValue ?? ""}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleHeaderKeyDown}
                        onBlur={confirmEditHeader}
                        className="h-6 text-xs px-1 w-full"
                      />
                    ) : (
                      <div className="flex items-center gap-1 pr-2">
                        <span
                          className="flex-1 cursor-pointer hover:text-primary truncate"
                          onDoubleClick={() => startEditHeader(colIdx)}
                          title={`${h} (더블클릭하여 수정)`}
                        >
                          {h}
                        </span>
                        <button
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                          onClick={() => deleteColumn(colIdx)}
                          title="컬럼 삭제"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    {/* 드래그 리사이즈 핸들 */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/60 active:bg-primary/80 select-none z-10 transition-colors"
                      onMouseDown={(e) => startResize(colIdx, e)}
                      title="드래그하여 너비 조정"
                    />
                  </th>
                ))}
                <th className="border border-border px-1 py-1 bg-muted">
                  <button
                    onClick={addColumn}
                    className="text-muted-foreground hover:text-primary"
                    title="컬럼 추가"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-muted/30 group/row">
                  <td className="border border-border text-center text-xs text-muted-foreground px-1 sticky left-0 bg-background group-hover/row:bg-muted/30">
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="group-hover/row:hidden">{rowIdx + 1}</span>
                      <button
                        className="hidden group-hover/row:flex text-muted-foreground hover:text-destructive"
                        onClick={() => deleteRow(rowIdx)}
                        title="행 삭제"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  {headers.map((h, colIdx) => {
                    const isEditing = editCell?.row === rowIdx && editCell?.col === colIdx
                    const isSel = !isEditing && inSelection(rowIdx, colIdx)
                    return (
                      <td
                        key={colIdx}
                        className={`border border-border px-0 py-0 overflow-hidden select-none ${
                          isSel ? "bg-blue-100 dark:bg-blue-900/30" : ""
                        }`}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return
                          isDraggingRef.current = true
                          hasDraggedRef.current = false
                          dragStartRef.current = { row: rowIdx, col: colIdx }
                          setSelStart({ row: rowIdx, col: colIdx })
                          setSelEnd({ row: rowIdx, col: colIdx })
                        }}
                        onMouseEnter={() => {
                          if (!isDraggingRef.current) return
                          setSelEnd({ row: rowIdx, col: colIdx })
                          if (
                            dragStartRef.current &&
                            (dragStartRef.current.row !== rowIdx || dragStartRef.current.col !== colIdx)
                          ) hasDraggedRef.current = true
                        }}
                        onClick={() => {
                          if (hasDraggedRef.current) { hasDraggedRef.current = false; return }
                          // 단일 클릭: 편집 중인 셀 확정 + 해당 셀 선택
                          if (editCell) confirmEditCell()
                          setSelStart({ row: rowIdx, col: colIdx })
                          setSelEnd({ row: rowIdx, col: colIdx })
                        }}
                        onDoubleClick={() => {
                          clearSel()
                          confirmEditCell()
                          startEditCell(rowIdx, colIdx)
                        }}
                      >
                        {isEditing ? (
                          <Input
                            ref={cellInputRef}
                            value={editValue ?? ""}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, rowIdx, colIdx)}
                            onBlur={confirmEditCell}
                            className="h-7 rounded-none border-0 border-primary ring-2 ring-primary focus-visible:ring-2 text-xs px-2 w-full"
                          />
                        ) : (
                          <div
                            className="px-2 py-1 text-xs min-h-[28px] cursor-cell truncate"
                            title={row[h] ?? ""}
                          >
                            {row[h] ?? ""}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="border border-border" />
                </tr>
              ))}
              <tr>
                <td colSpan={headers.length + 2} className="border border-border px-2 py-1">
                  <button
                    onClick={addRow}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    행 추가
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {!isEmpty && (
        <div className="px-4 py-1.5 border-t text-xs text-muted-foreground shrink-0 flex gap-4 items-center">
          <span>{rows.length}행</span>
          <span>{headers.length}열</span>
          {isMultiSel ? (
            <span className="text-blue-600 font-medium">
              {selRowCount}행 × {selColCount}열 선택 · Delete: 삭제 · Esc: 선택 해제
            </span>
          ) : (
            <span className="text-muted-foreground/60">드래그: 범위 선택 · Ctrl+A: 전체 선택 · Ctrl+Z: 되돌리기</span>
          )}
        </div>
      )}
    </div>
  )
}
