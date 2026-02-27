"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { useToast } from "@/hooks/use-toast"
import { TaskS3BucketCard } from "@/components/task-s3-bucket-card"
import type { Task, S3UpdateRow } from "@/lib/types"

type Profile = { id: string; full_name: string | null; email: string }

interface BatchRequestModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedRowIds: Set<string>
  tasks: Task[]
  s3Updates: S3UpdateRow[]
  onSuccess: () => void
}

export function BatchRequestModal({
  open,
  onOpenChange,
  selectedRowIds,
  tasks,
  s3Updates,
  onSuccess,
}: BatchRequestModalProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [step, setStep] = useState<"choice" | "new_task" | "attach">("choice")
  const [title, setTitle] = useState("")
  const [assignedTo, setAssignedTo] = useState("")
  const [priority, setPriority] = useState("medium")
  const [attachTaskId, setAttachTaskId] = useState("")
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { s3Ids, taskIds } = useMemo(() => {
    const s3: string[] = []
    const task: string[] = []
    selectedRowIds.forEach((id) => {
      if (id.startsWith("s3-")) s3.push(id.replace(/^s3-/, ""))
      else if (id.startsWith("task-")) task.push(id.replace(/^task-/, ""))
    })
    return { s3Ids: s3, taskIds: task }
  }, [selectedRowIds])

  const selectedS3Updates = useMemo(
    () => s3Updates.filter((u) => s3Ids.includes(String(u.id))),
    [s3Updates, s3Ids]
  )

  const canNewTask = s3Ids.length >= 1
  const canAttach = s3Ids.length >= 1 && tasks.length >= 1

  useEffect(() => {
    if (!open) return
    setStep("choice")
    setTitle("")
    setAssignedTo("")
    setPriority("medium")
    setAttachTaskId("")
  }, [open])

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
        body: JSON.stringify({
          title: title.trim(),
          assignedTo,
          priority,
          s3_update_ids: s3Ids,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || "업무 등록 실패")
      }
      toast({ title: "등록됨", description: data.message ?? "업무가 등록되었습니다." })
      onSuccess()
      onOpenChange(false)
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
      if (!res.ok) {
        throw new Error(data.error || "S3 연결 실패")
      }
      toast({ title: "연결됨", description: data.message ?? "S3가 업무에 연결되었습니다." })
      onSuccess()
      onOpenChange(false)
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

  const attachTaskOptions = useMemo(() => {
    const inProgress = tasks.filter((t) => t.status !== "completed")
    return taskIds.length > 0
      ? inProgress.filter((t) => taskIds.includes(t.id))
      : inProgress
  }, [tasks, taskIds])

  useEffect(() => {
    if (step !== "attach") return
    if (attachTaskOptions.length === 0) return
    const firstId = attachTaskOptions[0].id
    setAttachTaskId((prev) => (attachTaskOptions.some((t) => t.id === prev) ? prev : firstId))
  }, [step, attachTaskOptions])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>일괄 요청</DialogTitle>
          <DialogDescription>
            S3 {s3Ids.length}건, 업무 {taskIds.length}건 선택됨
          </DialogDescription>
        </DialogHeader>

        {selectedS3Updates.length > 0 && (
          <TaskS3BucketCard taskTitle="" s3Updates={selectedS3Updates} />
        )}

        {step === "choice" && (
          <div className="flex flex-col gap-3 py-2">
            {canNewTask && (
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  onOpenChange(false)
                  router.push(`/admin/analytics?from=worklist&s3Ids=${s3Ids.join(",")}`)
                }}
              >
                새 업무로 요청
              </Button>
            )}
            {canAttach && (
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setStep("attach")}
              >
                기존 업무에 붙이기
              </Button>
            )}
            {!canNewTask && !canAttach && (
              <p className="text-sm text-muted-foreground">
                S3를 1건 이상 선택하면 새 업무로 요청하거나, 업무를 선택한 뒤 기존 업무에 작업을 붙일 수 있습니다.
              </p>
            )}
          </div>
        )}

        {step === "new_task" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>제목</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="업무 제목"
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
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("choice")}>
                뒤로
              </Button>
              <Button onClick={handleNewTaskSubmit} disabled={submitting}>
                {submitting ? "등록 중..." : "등록"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "attach" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              선택한 S3 {s3Ids.length}건을 아래 업무에 연결합니다.
            </p>
            <div className="space-y-2">
              <Label>대상 업무</Label>
              <Select
                value={attachTaskId}
                onValueChange={setAttachTaskId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="업무 선택" />
                </SelectTrigger>
                <SelectContent>
                  {attachTaskOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title} {t.assigned_to_name ? `(${t.assigned_to_name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("choice")}>
                뒤로
              </Button>
              <Button onClick={handleAttachSubmit} disabled={submitting}>
                {submitting ? "연결 중..." : "연결"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "choice" && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
