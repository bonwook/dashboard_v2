"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Search, Bold, Italic, Underline, Minus, Grid3x3 as TableIcon, UserPlus, Plus, X } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { useContentEditor } from "@/lib/hooks/useContentEditor"
import { useTaskAssignment } from "../hooks/useTaskAssignment"
import { TaskFormHeader } from "./TaskFormHeader"

const EDITOR_ID = "assign-content"
const EDITOR_MULTI_ID = "assign-content-multi"

export interface TaskRegistrationFormProps {
  s3UpdateId?: string | null
  initialTitle?: string
  onSuccess?: (taskId: string) => void
  currentUserId?: string
  selectedFiles: Set<string>
  setSelectedFiles: (s: Set<string>) => void
  children?: React.ReactNode
  showBackButton?: boolean
}

export function TaskRegistrationForm({
  s3UpdateId,
  initialTitle,
  onSuccess,
  currentUserId,
  selectedFiles,
  setSelectedFiles,
  children,
  showBackButton = false,
}: TaskRegistrationFormProps) {
  const { toast } = useToast()
  const [assignForm, setAssignForm] = useState({
    title: "",
    content: "",
    priority: "medium",
    description: "",
    due_date: null as Date | null,
    assigned_to: "",
  })
  const [contentMode, setContentMode] = useState<"single" | "multi">("single")
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; email: string; organization?: string }>>([])
  const [meId, setMeId] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [userSearchQuery, setUserSearchQuery] = useState("")
  const [isAssignConfirmDialogOpen, setIsAssignConfirmDialogOpen] = useState(false)
  const [subtasks, setSubtasks] = useState<Array<{ id: string; subtitle: string; assignedToList: string[]; content: string; fileKeys: string[] }>>([])
  const [selectedAssignees, setSelectedAssignees] = useState<Set<string>>(new Set())
  const [currentSubtitle, setCurrentSubtitle] = useState("")
  const [subContent, setSubContent] = useState("")
  const [isUserSelectDialogOpen, setIsUserSelectDialogOpen] = useState(false)
  const [tableGridHoverMulti, setTableGridHoverMulti] = useState({ row: 0, col: 0, show: false })
  const prioritySelectRef = useRef<HTMLButtonElement>(null)
  const contentEditableRef = useRef<HTMLDivElement>(null)
  const contentEditableMultiRef = useRef<HTMLDivElement>(null)

  const { editorState, setEditorState, tableGridHover, setTableGridHover, updateEditorState, addResizeHandlersToTable, createTable } = useContentEditor({
    editorId: EDITOR_ID,
  })

  const syncEditorToolbarState = () => {
    setEditorState({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
    })
  }

  const { isAssigning, handleAssignFiles } = useTaskAssignment({
    assignForm,
    subtasks,
    selectedFiles,
    toast,
    setAssignForm,
    setSubtasks,
    setSelectedAssignees,
    setSelectedFiles,
    s3UpdateId: s3UpdateId ?? undefined,
  })

  useEffect(() => {
    if (initialTitle) {
      setAssignForm((prev) => ({ ...prev, title: initialTitle }))
    }
  }, [initialTitle])

  useEffect(() => {
    const load = async () => {
      try {
        const [profilesRes, meRes] = await Promise.all([
          fetch("/api/profiles", { credentials: "include" }),
          fetch("/api/auth/me", { credentials: "include" }),
        ])
        if (profilesRes.ok) {
          const data = await profilesRes.json()
          const list = Array.isArray(data?.profiles) ? data.profiles : Array.isArray(data) ? data : []
          setUsers(list)
        }
        if (meRes.ok) {
          const me = await meRes.json()
          if (me?.id) setMeId(me.id)
        }
      } catch {
        // ignore
      }
    }
    load()
  }, [])

  const handleConfirmAssign = async () => {
    setIsAssignConfirmDialogOpen(false)
    const data = await handleAssignFiles()
    if (data?.taskId && onSuccess) {
      onSuccess(data.taskId)
    } else if (data?.taskId && !onSuccess) {
      window.location.reload()
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = userSearchQuery.toLowerCase()
    return u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.organization?.toLowerCase().includes(q)
  })

  return (
    <Card className="flex flex-col w-full min-w-0 max-w-full overflow-hidden">
      <CardHeader className="shrink-0">
        <CardTitle className="text-2xl">업무 등록</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 flex-1 flex flex-col min-w-0 max-w-full overflow-hidden">
        <TaskFormHeader
          assignForm={assignForm}
          setAssignForm={setAssignForm}
          contentMode={contentMode}
          prioritySelectRef={prioritySelectRef}
        />

        {contentMode === "single" && (
          <div className="grid gap-4 lg:grid-cols-[5.6fr_2.4fr] min-w-0 max-w-full">
            <div className="space-y-2 min-w-0 max-w-full">
              <div className="flex items-center gap-2">
                <Label className="text-base font-semibold">내용</Label>
                <div className="relative inline-flex items-center bg-muted rounded-full p-0.5 h-8 w-fit">
                  <div
                    className="absolute h-7 rounded-full bg-background shadow-sm transition-all duration-200 ease-in-out"
                    style={{ width: "45px", left: contentMode === "single" ? "2px" : "47px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setContentMode("single")}
                    className="relative z-10 w-[45px] h-7 text-sm font-medium transition-colors duration-200 text-foreground"
                  >
                    개별
                  </button>
                  <button
                    type="button"
                    onClick={() => setContentMode("multi")}
                    className="relative z-10 w-[45px] h-7 text-sm font-medium transition-colors duration-200 text-muted-foreground"
                  >
                    공동
                  </button>
                </div>
              </div>
              <div
                className="border rounded-md overflow-hidden bg-background flex flex-col"
                style={{ height: "492px", minHeight: "492px", maxHeight: "492px" }}
              >
                <div className="flex items-center gap-1 p-2 flex-wrap shrink-0 bg-background border-b">
                  <Button type="button" variant={editorState.bold ? "secondary" : "ghost"} size="sm" className={`h-8 w-8 p-0 ${editorState.bold ? "bg-primary/10" : ""}`} onClick={() => { const el = document.getElementById(EDITOR_ID); if (el) { el.focus(); document.execCommand("bold", false); syncEditorToolbarState(); } }} title="굵게">
                    <Bold className={`h-4 w-4 ${editorState.bold ? "text-primary" : ""}`} />
                  </Button>
                  <Button type="button" variant={editorState.italic ? "secondary" : "ghost"} size="sm" className={`h-8 w-8 p-0 ${editorState.italic ? "bg-primary/10" : ""}`} onClick={() => { const el = document.getElementById(EDITOR_ID); if (el) { el.focus(); document.execCommand("italic", false); syncEditorToolbarState(); } }} title="기울임">
                    <Italic className={`h-4 w-4 ${editorState.italic ? "text-primary" : ""}`} />
                  </Button>
                  <Button type="button" variant={editorState.underline ? "secondary" : "ghost"} size="sm" className={`h-8 w-8 p-0 ${editorState.underline ? "bg-primary/10" : ""}`} onClick={() => { const el = document.getElementById(EDITOR_ID); if (el) { el.focus(); document.execCommand("underline", false); syncEditorToolbarState(); } }} title="밑줄">
                    <Underline className={`h-4 w-4 ${editorState.underline ? "text-primary" : ""}`} />
                  </Button>
                  <div className="w-px h-6 bg-border mx-1" />
                  <div className="relative">
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setTableGridHover((p) => (p.show ? { row: 0, col: 0, show: false } : { ...p, show: true }))} title="테이블">
                      <TableIcon className="h-4 w-4" />
                    </Button>
                    {tableGridHover.show && (
                      <div className="absolute top-full left-0 mt-2 bg-background border rounded-lg shadow-xl p-4 z-50 min-w-[280px]" onMouseLeave={() => setTableGridHover({ row: 0, col: 0, show: false })}>
                        <div className="grid grid-cols-10 gap-1 mb-3">
                          {Array.from({ length: 100 }).map((_, idx) => {
                            const row = Math.floor(idx / 10) + 1
                            const col = (idx % 10) + 1
                            const isSelected = row <= tableGridHover.row && col <= tableGridHover.col
                            return (
                              <div
                                key={idx}
                                className={`w-5 h-5 border border-border rounded-sm transition-colors ${isSelected ? "bg-primary border-primary" : "bg-muted hover:bg-muted/80"}`}
                                onMouseEnter={() => setTableGridHover((p) => ({ ...p, row, col }))}
                                onClick={() => { createTable(row, col); setTableGridHover({ row: 0, col: 0, show: false })}}
                              />
                            )
                          })}
                        </div>
                        <div className="text-sm text-center font-medium border-t pt-2">
                          {tableGridHover.row > 0 && tableGridHover.col > 0 ? `${tableGridHover.row} x ${tableGridHover.col} 테이블` : "테이블 크기 선택"}
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
                    onClick={() => {
                      const editor = document.getElementById(EDITOR_ID)
                      if (editor) {
                        editor.focus()
                        const hr = document.createElement("hr")
                        hr.style.border = "none"
                        hr.style.borderTop = "2px solid #6b7280"
                        hr.style.margin = "10px 0"
                        const sel = window.getSelection()
                        if (sel && sel.rangeCount > 0) {
                          const range = sel.getRangeAt(0)
                          range.deleteContents()
                          range.insertNode(hr)
                          range.setStartAfter(hr)
                          range.collapse(true)
                          sel.removeAllRanges()
                          sel.addRange(range)
                        }
                      }
                    }}
                    title="구분선"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                </div>
                <div
                  ref={contentEditableRef}
                  id={EDITOR_ID}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => {
                    setTimeout(() => {
                      const editor = e.currentTarget
                      if (editor) {
                        editor.querySelectorAll('table[data-resizable="true"]').forEach((t) => addResizeHandlersToTable(t as HTMLTableElement))
                      }
                    }, 0)
                  }}
                  onBlur={(e) => {
                    const el = e.currentTarget
                    if (el) {
                      setAssignForm((prev) => ({ ...prev, content: el.innerHTML }))
                    }
                    updateEditorState()
                    setEditorState({ bold: false, italic: false, underline: false })
                  }}
                  onMouseUp={syncEditorToolbarState}
                  onKeyUp={syncEditorToolbarState}
                  className="resize-none text-base leading-relaxed w-full max-w-full min-w-0 overflow-y-auto p-3 focus:outline-none flex-1"
                  style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  data-placeholder="내용을 입력하세요."
                />
                <style jsx global>{`
                  #${EDITOR_ID}:empty:before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }
                  #${EDITOR_ID} table { border-collapse: collapse; width: 100%; margin: 10px 0; border: 2px solid #6b7280; }
                  #${EDITOR_ID} table td, #${EDITOR_ID} table th { border: 2px solid #6b7280; padding: 8px; position: relative; }
                  #${EDITOR_ID} hr { border: none; border-top: 2px solid #9ca3af; margin: 10px 0; }
                `}</style>
              </div>
            </div>

            <div className="min-w-0 max-w-full">
              <div className="flex items-center gap-2 mb-2" style={{ height: "32px" }}>
                <Label className="text-base font-semibold">사용자 리스트 ({users.length}명)</Label>
              </div>
              <div className="border rounded-md bg-background flex flex-col" style={{ minHeight: "492px", maxHeight: "492px" }}>
                <div className="p-3 border-b shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="text" placeholder="이름 또는 이메일 검색..." value={userSearchQuery} onChange={(e) => setUserSearchQuery(e.target.value)} className="pl-9" />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  {filteredUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">사용자가 없습니다</p>
                  ) : (
                    <RadioGroup value={selectedUserId} onValueChange={(id) => { setSelectedUserId(id); setAssignForm((prev) => ({ ...prev, assigned_to: id })) }} className="space-y-0">
                      {filteredUsers.map((u) => (
                        <div key={u.id} className="flex items-center space-x-2 py-0.5 rounded px-2 hover:bg-muted/30">
                          <RadioGroupItem value={u.id} id={u.id} />
                          <Label htmlFor={u.id} className="flex-1 flex items-center gap-2 cursor-pointer">
                            <span className="font-medium text-sm">{u.full_name}</span>
                            {u.organization && <span className="text-xs text-muted-foreground">({u.organization})</span>}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {contentMode === "multi" && (
          <div className="relative w-full min-w-0 border-2 border-primary/50 rounded-xl p-4 gap-4 bg-muted/10 ring-1 ring-primary/20 flex flex-col min-h-0">
            <div className="absolute -top-10 right-4 z-10 shadow-md">
              <Button
                type="button"
                variant="default"
                size="default"
                onClick={() => {
                  if (!currentSubtitle.trim()) { toast({ title: "부제목 필요", description: "부제목을 입력해주세요.", variant: "destructive" }); return }
                  const html = contentEditableMultiRef.current?.innerHTML ?? subContent
                  if (!html || html.trim() === "" || html === "<br>") { toast({ title: "내용 필요", description: "추가 내용을 입력해주세요.", variant: "destructive" }); return }
                  const newSubtask = {
                    id: crypto.randomUUID(),
                    subtitle: currentSubtitle.trim(),
                    assignedToList: Array.from(selectedAssignees),
                    content: html,
                    fileKeys: Array.from(selectedFiles),
                  }
                  setSubtasks((prev) => [...prev, newSubtask])
                  setCurrentSubtitle("")
                  setSubContent("")
                  if (contentEditableMultiRef.current) contentEditableMultiRef.current.innerHTML = ""
                  setSelectedAssignees(new Set())
                  toast({ title: "공동 업무가 추가되었습니다", description: newSubtask.assignedToList.length > 0 ? `${newSubtask.assignedToList.length}명 담당` : "담당자 없음 (추가 시 본인 포함)" })
                }}
                disabled={!currentSubtitle.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                공동업무 추가
              </Button>
            </div>
            <div className="grid gap-4 lg:grid-cols-[5.6fr_2.4fr] lg:grid-rows-[auto_1fr] min-w-0 max-w-full w-full flex-1 min-h-0 overflow-hidden">
            <div className="space-y-2 min-w-0 max-w-full">
              <div className="flex items-center gap-2">
                <Label className="text-base font-semibold">공동업무 내용</Label>
                <div className="relative inline-flex items-center bg-muted rounded-full p-0.5 h-8 w-fit">
                  <div
                    className="absolute h-7 rounded-full bg-background shadow-sm transition-all duration-200 ease-in-out"
                    style={{ width: "45px", left: contentMode === "multi" ? "47px" : "2px" }}
                  />
                  <button type="button" onClick={() => setContentMode("single")} className="relative z-10 w-[45px] h-7 text-sm font-medium transition-colors duration-200 text-muted-foreground">
                    개별
                  </button>
                  <button type="button" onClick={() => setContentMode("multi")} className="relative z-10 w-[45px] h-7 text-sm font-medium transition-colors duration-200 text-foreground">
                    공동
                  </button>
                </div>
              </div>
              <Input value={currentSubtitle} onChange={(e) => setCurrentSubtitle(e.target.value)} placeholder="공동업무의 부제를 입력하세요" className="focus-visible:ring-0 focus-visible:border-input" />
              <div className="border rounded-md overflow-hidden bg-background flex flex-col" style={{ height: "320px", minHeight: "320px", maxHeight: "320px" }}>
                <div className="flex items-center justify-between gap-1 p-2 flex-wrap shrink-0 bg-background border-b">
                  <div className="flex items-center gap-1 flex-wrap">
                    <Button type="button" variant={editorState.bold ? "secondary" : "ghost"} size="sm" className={`h-8 w-8 p-0 ${editorState.bold ? "bg-primary/10" : ""}`} onClick={() => { const el = document.getElementById(EDITOR_MULTI_ID); if (el) { el.focus(); document.execCommand("bold", false); syncEditorToolbarState(); } }} title="굵게"><Bold className={`h-4 w-4 ${editorState.bold ? "text-primary" : ""}`} /></Button>
                    <Button type="button" variant={editorState.italic ? "secondary" : "ghost"} size="sm" className={`h-8 w-8 p-0 ${editorState.italic ? "bg-primary/10" : ""}`} onClick={() => { const el = document.getElementById(EDITOR_MULTI_ID); if (el) { el.focus(); document.execCommand("italic", false); syncEditorToolbarState(); } }} title="기울임"><Italic className={`h-4 w-4 ${editorState.italic ? "text-primary" : ""}`} /></Button>
                    <Button type="button" variant={editorState.underline ? "secondary" : "ghost"} size="sm" className={`h-8 w-8 p-0 ${editorState.underline ? "bg-primary/10" : ""}`} onClick={() => { const el = document.getElementById(EDITOR_MULTI_ID); if (el) { el.focus(); document.execCommand("underline", false); syncEditorToolbarState(); } }} title="밑줄"><Underline className={`h-4 w-4 ${editorState.underline ? "text-primary" : ""}`} /></Button>
                    <div className="w-px h-6 bg-border mx-1" />
                    <div className="relative">
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setTableGridHoverMulti((p) => (p.show ? { row: 0, col: 0, show: false } : { ...p, show: true }))} title="테이블">
                        <TableIcon className="h-4 w-4" />
                      </Button>
                      {tableGridHoverMulti.show && (
                        <div className="absolute top-full left-0 mt-2 bg-background border rounded-lg shadow-xl p-4 z-50 min-w-[280px]" onMouseLeave={() => setTableGridHoverMulti({ row: 0, col: 0, show: false })}>
                          <div className="grid grid-cols-10 gap-1 mb-3">
                            {Array.from({ length: 100 }).map((_, idx) => {
                              const row = Math.floor(idx / 10) + 1
                              const col = (idx % 10) + 1
                              const isSelected = row <= tableGridHoverMulti.row && col <= tableGridHoverMulti.col
                              return (
                                <div
                                  key={idx}
                                  className={`w-5 h-5 border border-border rounded-sm transition-colors ${isSelected ? "bg-primary border-primary" : "bg-muted hover:bg-muted/80"}`}
                                  onMouseEnter={() => setTableGridHoverMulti((p) => ({ ...p, row, col }))}
                                  onClick={() => {
                                    const editor = document.getElementById(EDITOR_MULTI_ID)
                                    if (editor) {
                                      editor.focus()
                                      const table = document.createElement("table")
                                      table.style.borderCollapse = "collapse"
                                      table.style.width = "100%"
                                      table.style.margin = "10px 0"
                                      table.style.border = "2px solid #6b7280"
                                      table.setAttribute("data-resizable", "true")
                                      const colW = `${100 / col}%`
                                      for (let r = 0; r < row; r++) {
                                        const tr = document.createElement("tr")
                                        for (let c = 0; c < col; c++) {
                                          const td = document.createElement("td")
                                          td.style.border = "2px solid #6b7280"
                                          td.style.padding = "8px"
                                          td.style.width = colW
                                          td.contentEditable = "true"
                                          td.innerHTML = "&nbsp;"
                                          tr.appendChild(td)
                                        }
                                        table.appendChild(tr)
                                      }
                                      const sel = window.getSelection()
                                      if (sel && sel.rangeCount > 0) {
                                        const range = sel.getRangeAt(0)
                                        if (editor.contains(range.commonAncestorContainer) || range.commonAncestorContainer === editor) {
                                          range.deleteContents()
                                          range.insertNode(table)
                                          range.setStartAfter(table)
                                          range.collapse(true)
                                        } else {
                                          editor.appendChild(table)
                                        }
                                        sel.removeAllRanges()
                                        sel.addRange(range)
                                      } else {
                                        editor.appendChild(table)
                                      }
                                      if (contentEditableMultiRef.current) setSubContent(contentEditableMultiRef.current.innerHTML)
                                    }
                                    setTableGridHoverMulti({ row: 0, col: 0, show: false })
                                  }}
                                />
                              )
                            })}
                          </div>
                          <div className="text-sm text-center font-medium border-t pt-2">
                            {tableGridHoverMulti.row > 0 && tableGridHoverMulti.col > 0 ? `${tableGridHoverMulti.row} x ${tableGridHoverMulti.col} 테이블` : "테이블 크기 선택"}
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
                      title="구분선"
                      onClick={() => {
                        const editor = document.getElementById(EDITOR_MULTI_ID)
                        if (editor) {
                          editor.focus()
                          const hr = document.createElement("hr")
                          hr.style.border = "none"
                          hr.style.borderTop = "2px solid #6b7280"
                          hr.style.margin = "10px 0"
                          const sel = window.getSelection()
                          if (sel && sel.rangeCount > 0) {
                            const range = sel.getRangeAt(0)
                            range.deleteContents()
                            range.insertNode(hr)
                            range.setStartAfter(hr)
                            range.collapse(true)
                            sel.removeAllRanges()
                            sel.addRange(range)
                          } else {
                            editor.appendChild(hr)
                          }
                          if (contentEditableMultiRef.current) setSubContent(contentEditableMultiRef.current.innerHTML)
                        }
                      }}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setIsUserSelectDialogOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-1" />
                    담당자 추가 ({selectedAssignees.size})
                  </Button>
                </div>
                <div
                  ref={contentEditableMultiRef}
                  id={EDITOR_MULTI_ID}
                  contentEditable
                  suppressContentEditableWarning
                  onFocus={syncEditorToolbarState}
                  onBlur={(e) => {
                    const el = e.currentTarget
                    if (el) setSubContent(el.innerHTML)
                  }}
                  onInput={() => {
                    const el = contentEditableMultiRef.current
                    if (el) setSubContent(el.innerHTML)
                  }}
                  onMouseUp={syncEditorToolbarState}
                  onKeyUp={syncEditorToolbarState}
                  className="resize-none text-base leading-relaxed w-full max-w-full min-w-0 overflow-y-auto p-3 focus:outline-none flex-1"
                  style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  data-placeholder="내용을 입력하세요."
                />
                <style jsx global>{`
                  #${EDITOR_MULTI_ID}:empty:before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }
                  #${EDITOR_MULTI_ID} table { border-collapse: collapse; width: 100%; margin: 10px 0; border: 2px solid #6b7280; }
                  #${EDITOR_MULTI_ID} table td, #${EDITOR_MULTI_ID} table th { border: 2px solid #6b7280; padding: 8px; }
                  #${EDITOR_MULTI_ID} hr { border: none; border-top: 2px solid #9ca3af; margin: 10px 0; }
                `}</style>
              </div>
            </div>
            <div className="min-w-0 max-w-full flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-2 shrink-0" style={{ height: "32px" }}>
                <Label className="text-base font-semibold">업무 목록 ({subtasks.length})</Label>
              </div>
              <div className="border rounded-md bg-background flex-1 min-h-[320px] flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {subtasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">부제목과 내용을 입력한 뒤 &quot;공동업무 추가&quot;를 눌러 주세요.</p>
                  ) : (
                    subtasks.map((subtask) => (
                      <Card key={subtask.id} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {subtask.subtitle && <div className="font-semibold text-sm mb-1">{subtask.subtitle}</div>}
                            <div className="flex flex-wrap gap-1">
                              {subtask.assignedToList.map((userId) => {
                                const u = users.find((x) => x.id === userId)
                                return <Badge key={userId} variant="outline" className="text-xs">{u?.full_name || u?.email || "알 수 없음"}</Badge>
                              })}
                            </div>
                          </div>
                          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => { setSubtasks((prev) => prev.filter((s) => s.id !== subtask.id)); toast({ title: "공동 업무가 제거되었습니다" }) }}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            </div>
            </div>

            {/* 공동 탭: 파일 목록 + 미리보기도 파란 테두리 안에 포함 */}
            <div className="min-w-0 max-w-full w-full flex-1 flex flex-col min-h-0 mt-4">
              <div className="grid gap-4 lg:grid-cols-[5.6fr_2.4fr] w-full min-w-0 max-w-full overflow-hidden items-stretch flex-1 min-h-0">
                <Card className="flex flex-col min-h-0 h-full w-full min-w-0 overflow-hidden rounded-xl flex-1">
                  <CardHeader className="shrink-0 pb-3">
                    <CardTitle className="text-lg">파일 목록</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden flex flex-col min-h-0">
                    {children ?? <p className="text-center text-muted-foreground py-8">파일이 없습니다</p>}
                  </CardContent>
                </Card>
                <Card className="relative flex flex-col min-h-0 h-full w-full rounded-xl overflow-hidden" style={{ minHeight: "400px", display: "flex", flexDirection: "column" }}>
                  <CardHeader className="pb-2 shrink-0">
                    <CardTitle className="text-lg">미리보기</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-y-auto">
                    <p className="text-center text-muted-foreground py-8">파일을 선택하면 미리보기가 표시됩니다</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* 개별 탭: 파일 목록 + 미리보기 */}
        {contentMode === "single" && (
          <div className="space-y-4 min-w-0 max-w-full">
            <div className="grid gap-4 lg:grid-cols-[5.6fr_2.4fr] w-full min-w-0 max-w-full overflow-hidden items-stretch h-full">
              <Card className="flex flex-col min-h-0 h-full w-full min-w-0 overflow-hidden rounded-xl flex-1">
                <CardHeader className="shrink-0 pb-3">
                  <CardTitle className="text-lg">파일 목록</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden flex flex-col min-h-0">
                  {children ?? <p className="text-center text-muted-foreground py-8">파일이 없습니다</p>}
                </CardContent>
              </Card>
              <Card className="relative flex flex-col min-h-0 h-full w-full rounded-xl overflow-hidden" style={{ minHeight: "400px", display: "flex", flexDirection: "column" }}>
                <CardHeader className="pb-2 shrink-0">
                  <CardTitle className="text-lg">미리보기</CardTitle>
                </CardHeader>
                <CardContent className="overflow-y-auto">
                  <p className="text-center text-muted-foreground py-8">파일을 선택하면 미리보기가 표시됩니다</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-8 mt-8 min-w-0 max-w-full justify-center">
          <Button
            onClick={() => {
              if (!assignForm.title.trim()) { toast({ title: "제목을 입력해 주세요.", variant: "destructive" }); return }
              if (contentMode === "single" && !assignForm.assigned_to) { toast({ title: "담당자를 선택해 주세요.", variant: "destructive" }); return }
              if (contentMode === "multi" && subtasks.length === 0) { toast({ title: "공동 업무를 추가해 주세요.", variant: "destructive" }); return }
              if (contentMode === "multi" && subtasks.some((s) => s.assignedToList.length === 0)) { toast({ title: "모든 공동 업무에 담당자를 추가해 주세요.", variant: "destructive" }); return }
              setIsAssignConfirmDialogOpen(true)
            }}
            disabled={isAssigning || !assignForm.title.trim() || (contentMode === "single" && !assignForm.assigned_to) || (contentMode === "multi" && subtasks.length === 0)}
            className="min-w-[120px]"
          >
            {isAssigning ? "등록 중..." : contentMode === "multi" && subtasks.length > 0 ? `등록하기 (${subtasks.length})` : "등록하기"}
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={isAssignConfirmDialogOpen} onOpenChange={setIsAssignConfirmDialogOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {contentMode === "multi" && subtasks.length > 0
                ? `공동 업무 ${subtasks.length}건 할당`
                : assignForm.assigned_to
                  ? `${users.find((u) => u.id === assignForm.assigned_to)?.full_name || assignForm.assigned_to}에게 업무 할당`
                  : "업무 할당 확인"}
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">업무 할당 확인</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <span className="font-medium">중요도:</span>{" "}
              {assignForm.priority === "low" ? "낮음" : assignForm.priority === "medium" ? "보통" : assignForm.priority === "high" ? "높음" : "긴급"}
            </div>
            {assignForm.due_date && (
              <div>
                <span className="font-medium">마감일:</span> {format(assignForm.due_date, "yyyy-MM-dd", { locale: ko })}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAssign}>
              {contentMode === "multi" && subtasks.length > 0 ? `공동 업무 ${subtasks.length}건 등록` : assignForm.assigned_to ? `${users.find((u) => u.id === assignForm.assigned_to)?.full_name || "담당자"}에게 할당` : "업무 할당"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isUserSelectDialogOpen} onOpenChange={setIsUserSelectDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>담당자 추가 (복수 선택 가능)</DialogTitle>
            <DialogDescription>공동 업무에 할당할 담당자를 선택하세요.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">사용자가 없습니다.</p>
              ) : (
                filteredUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      const next = new Set(selectedAssignees)
                      if (next.has(u.id)) next.delete(u.id)
                      else next.add(u.id)
                      setSelectedAssignees(next)
                    }}
                  >
                    <Checkbox
                      checked={selectedAssignees.has(u.id)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedAssignees)
                        if (checked) next.add(u.id)
                        else next.delete(u.id)
                        setSelectedAssignees(next)
                      }}
                    />
                    <div className="flex-1">
                      <span className="font-medium">{u.full_name || u.email}</span>
                      {u.organization && <span className="ml-2 text-sm text-muted-foreground">({u.organization})</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUserSelectDialogOpen(false)}>취소</Button>
            <Button onClick={() => setIsUserSelectDialogOpen(false)}>확인 ({selectedAssignees.size}명)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
