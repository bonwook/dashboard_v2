"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { X, ShoppingCart, ChevronRight, ArrowLeft, Trash2, FileText } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { Task, S3UpdateRow } from "@/lib/types"

type Profile = { id: string; full_name: string | null; email: string }
type Step = "list" | "new_task" | "attach"

interface CartPanelProps {
  open: boolean
  onClose: () => void
  cartItems: Set<string>
  s3Updates: S3UpdateRow[]
  tasks: Task[]
  onRemoveItem: (id: string) => void
  onClear: () => void
  onSuccess: () => void
}

export function CartPanel({
  open,
  onClose,
  cartItems,
  s3Updates,
  tasks,
  onRemoveItem,
  onClear,
  onSuccess,
}: CartPanelProps) {
  const { toast } = useToast()
  const [step, setStep] = useState<Step>("list")
  const [title, setTitle] = useState("")
  const [assignedTo, setAssignedTo] = useState("")
  const [priority, setPriority] = useState("medium")
  const [attachTaskId, setAttachTaskId] = useState("")
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const s3Ids = useMemo(
    () => [...cartItems].filter((id) => id.startsWith("s3-")).map((id) => id.replace(/^s3-/, "")),
    [cartItems]
  )

  const selectedS3 = useMemo(
    () => s3Updates.filter((u) => s3Ids.includes(String(u.id))),
    [s3Updates, s3Ids]
  )

  const inProgressTasks = useMemo(() => tasks.filter((t) => t.status !== "completed"), [tasks])

  // 패널 닫힐 때 스텝 초기화
  useEffect(() => {
    if (!open) {
      setStep("list")
      setTitle("")
      setAssignedTo("")
      setPriority("medium")
      setAttachTaskId("")
    }
  }, [open])

  // 새 업무 스텝: 담당자 로드
  useEffect(() => {
    if (!open || step !== "new_task") return
    setLoadingProfiles(true)
    fetch("/api/profiles", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data?.profiles) ? data.profiles : []
        setProfiles(list)
        if (list.length && !assignedTo) setAssignedTo(list[0].id)
      })
      .catch(() => setProfiles([]))
      .finally(() => setLoadingProfiles(false))
  }, [open, step])

  // attach 스텝: 첫 번째 업무 자동 선택
  useEffect(() => {
    if (step !== "attach" || inProgressTasks.length === 0) return
    setAttachTaskId((prev) =>
      inProgressTasks.some((t) => t.id === prev) ? prev : inProgressTasks[0].id
    )
  }, [step, inProgressTasks])

  const handleNewTaskSubmit = async () => {
    if (!title.trim()) {
      toast({ title: "제목을 입력하세요", variant: "destructive" })
      return
    }
    if (!assignedTo.trim()) {
      toast({ title: "담당자를 선택하세요", variant: "destructive" })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/storage/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: title.trim(), assignedTo, priority, s3_update_ids: s3Ids }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "업무 등록 실패")
      toast({ title: "등록됨", description: data.message ?? "업무가 등록되었습니다." })
      onSuccess()
      onClose()
    } catch (e) {
      toast({
        title: "실패",
        description: e instanceof Error ? e.message : "업무 등록에 실패했습니다.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleAttachSubmit = async () => {
    if (!attachTaskId.trim()) {
      toast({ title: "업무를 선택하세요", variant: "destructive" })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/tasks/${attachTaskId}/attach-s3`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ s3_update_ids: s3Ids }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "S3 연결 실패")
      toast({ title: "연결됨", description: data.message ?? "S3가 업무에 연결되었습니다." })
      onSuccess()
      onClose()
    } catch (e) {
      toast({
        title: "실패",
        description: e instanceof Error ? e.message : "연결에 실패했습니다.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* 딤 오버레이 */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={onClose}
        />
      )}

      {/* 슬라이드인 패널 */}
      <div
        data-no-rubber
        className={`fixed right-0 top-0 h-full w-96 bg-background border-l shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          {step !== "list" ? (
            <button
              onClick={() => setStep("list")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              뒤로
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <span className="font-semibold">
                장바구니
                {selectedS3.length > 0 && (
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    ({selectedS3.length}건)
                  </span>
                )}
              </span>
            </div>
          )}
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 스텝: 목록 */}
        {step === "list" && (
          <>
            <div className="flex-1 overflow-y-auto">
              {selectedS3.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground px-6 text-center">
                  <ShoppingCart className="h-10 w-10 opacity-30" />
                  <p className="text-sm">
                    미할당 S3 파일을 드래그해서<br />여기에 넣어주세요
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {selectedS3.map((file) => (
                    <li key={file.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 group">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" title={file.file_name}>
                          {file.file_name}
                        </p>
                        {file.bucket_name && (
                          <p className="text-xs text-muted-foreground truncate">{file.bucket_name}</p>
                        )}
                      </div>
                      <button
                        onClick={() => onRemoveItem(`s3-${file.id}`)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive"
                        title="제거"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedS3.length > 0 && (
              <div className="border-t p-4 space-y-2">
                <Button
                  className="w-full"
                  onClick={() => setStep("new_task")}
                >
                  <ChevronRight className="mr-2 h-4 w-4" />
                  새 업무로 요청
                </Button>
                {inProgressTasks.length > 0 && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setStep("attach")}
                  >
                    <ChevronRight className="mr-2 h-4 w-4" />
                    기존 업무에 붙이기
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground hover:text-destructive"
                  onClick={onClear}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  전체 비우기
                </Button>
              </div>
            )}
          </>
        )}

        {/* 스텝: 새 업무 요청 */}
        {step === "new_task" && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              <p className="text-sm text-muted-foreground">
                S3 파일 {selectedS3.length}건으로 새 업무를 생성합니다.
              </p>
              <div className="space-y-2">
                <Label>업무 제목</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="업무 제목을 입력하세요"
                />
              </div>
              <div className="space-y-2">
                <Label>담당자</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo} disabled={loadingProfiles}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingProfiles ? "로딩 중..." : "담당자 선택"} />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email || p.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>우선순위</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">낮음</SelectItem>
                    <SelectItem value="medium">보통</SelectItem>
                    <SelectItem value="high">높음</SelectItem>
                    <SelectItem value="urgent">긴급</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 담은 파일 미리보기 */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">포함 파일</p>
                <ul className="space-y-1 rounded-md border bg-muted/30 px-3 py-2">
                  {selectedS3.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate" title={f.file_name}>{f.file_name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="border-t p-4">
              <Button
                className="w-full"
                onClick={handleNewTaskSubmit}
                disabled={submitting}
              >
                {submitting ? "등록 중..." : "업무 등록"}
              </Button>
            </div>
          </>
        )}

        {/* 스텝: 기존 업무에 붙이기 */}
        {step === "attach" && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              <p className="text-sm text-muted-foreground">
                S3 파일 {selectedS3.length}건을 아래 업무에 연결합니다.
              </p>
              <div className="space-y-2">
                <Label>대상 업무</Label>
                <Select value={attachTaskId} onValueChange={setAttachTaskId}>
                  <SelectTrigger>
                    <SelectValue placeholder="업무 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {inProgressTasks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}
                        {t.assigned_to_name ? ` (${t.assigned_to_name})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 담은 파일 미리보기 */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">포함 파일</p>
                <ul className="space-y-1 rounded-md border bg-muted/30 px-3 py-2">
                  {selectedS3.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate" title={f.file_name}>{f.file_name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="border-t p-4">
              <Button
                className="w-full"
                onClick={handleAttachSubmit}
                disabled={submitting}
              >
                {submitting ? "연결 중..." : "연결하기"}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
