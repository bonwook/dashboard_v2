"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Activity, RefreshCw, Search, Trash2, Plus, CheckCircle2 } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Fragment } from "react"
import { useToast } from "@/hooks/use-toast"
import { UploadSection } from "./components/UploadSection"
import { BatchRequestModal } from "./components/BatchRequestModal"
import { isTaskExpired, getDaysOverdue } from "@/lib/utils/taskHelpers"
import { parseFlexibleDate } from "@/lib/utils/dateHelpers"
import type { Task, S3UpdateRow } from "@/lib/types"

/**
 * Study/Series 식별용 태그만 사용 (PatientName, PatientID 등 PII 제외).
 * route.ts importantTags 중: StudyDate, StudyTime, Modality, SequenceName, SeriesDescription,
 * InstanceNumber, TemporalPositionIdentifier, StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID
 */
const STUDY_SERIES_METADATA_KEYS: { label: string; keys: string[] }[] = [
  { label: "Study 일자", keys: ["Study Date", "StudyDate"] },
  { label: "Study 시간", keys: ["Study Time", "StudyTime"] },
  { label: "Modality", keys: ["Modality", "modality"] },
  { label: "Series 설명", keys: ["Series Description", "SeriesDescription"] },
  { label: "Sequence", keys: ["Sequence Name", "SequenceName"] },
  { label: "Instance", keys: ["Instance Number", "InstanceNumber"] },
  { label: "Phase", keys: ["Temporal Position Identifier", "TemporalPositionIdentifier", "Phase"] },
  { label: "Study UID", keys: ["Study Instance UID", "StudyInstanceUID"] },
  { label: "Series UID", keys: ["Series Instance UID", "SeriesInstanceUID"] },
  { label: "SOP UID", keys: ["SOP Instance UID", "SOPInstanceUID"] },
  { label: "dimensions", keys: ["dimensions"] },
]

/** s3_updates.metadata(JSON)를 리스트용 한 줄 문자열로 표시 (Study/Series 식별용 태그만) */
function formatS3Metadata(metadata: S3UpdateRow["metadata"]): string {
  if (metadata == null) return ""
  const obj = typeof metadata === "string" ? (() => { try { return JSON.parse(metadata) } catch { return null } })() : metadata
  //metadata가 string이면 "{ "color": "red", "size": 10 }" 이런 형태이므로, 객체를 사용할 수 없어서 JSON.parse를하고
  //그렇지 않으면 metadata = { "color": "red", "size": 10 } 이 형태이므로 이걸 반환해서 obj로 사용하겠다.
  if (!obj || typeof obj !== "object") return ""
  const rec = obj as Record<string, unknown>
  if (typeof rec.summary === "string" && rec.summary.trim()) return rec.summary.trim()
  const get = (keys: string[]) => {
    for (const k of keys) {
      const v = rec[k]
      if (v != null && String(v).trim()) return String(v).trim()
    }
    return null
  }
  const parts: string[] = []
  for (const { keys } of STUDY_SERIES_METADATA_KEYS) {
    if (keys[0] === "dimensions") {
      const dims = rec.dimensions
      if (Array.isArray(dims) && dims.length) parts.push((dims as number[]).join("×"))
      continue
    }
    const v = get(keys)
    if (v) parts.push(v)
  }
  if (parts.length) return parts.join(" | ")
  return Object.entries(rec)
    .filter(([k]) => k !== "summary" && !["Patient Name", "PatientID", "PatientName"].includes(k) && rec[k] != null)
    .slice(0, 8)
    .map(([, v]) => (Array.isArray(v) ? (v as number[]).join("×") : String(v)))
    .join(" | ") || ""
}

export default function WorklistPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([])
  const [s3Updates, setS3Updates] = useState<S3UpdateRow[]>([])
  const [filteredS3Updates, setFilteredS3Updates] = useState<S3UpdateRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [bucketFilter, setBucketFilter] = useState<string>("all")
  const [me, setMe] = useState<{ id: string; role?: string } | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [batchRequestOpen, setBatchRequestOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const toggleRowSelection = useCallback((id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    const loadMe = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (res.ok) {
          const data = await res.json()
          setMe(data)
        }
      } catch {
        // ignore
      }
    }
    loadMe()
  }, [])

  const handleRefresh = () => {
    setSearchQuery("")
    setBucketFilter("all")
    loadTasks()
  }

  const loadTasks = async () => {
    setIsLoading(true)
    try {
      const [tasksRes, s3Res] = await Promise.all([
        fetch("/api/tasks/all", { credentials: "include" }),
        fetch("/api/s3-updates", { credentials: "include" }),
      ])

      if (tasksRes.ok) {
        const tasksData = await tasksRes.json()
        setTasks(tasksData.tasks || [])
      } else {
        setTasks([])
        const errBody = await tasksRes.json().catch(() => ({}))
        const message = errBody.error || `작업 목록 조회 실패 (${tasksRes.status})`
        toast({
          title: "작업 목록을 불러올 수 없습니다",
          description: message,
          variant: "destructive",
        })
      }

      if (s3Res.ok) {
        const s3Data = await s3Res.json()
        setS3Updates(s3Data.s3Updates || [])
      } else {
        setS3Updates([])
      }
    } catch (error) {
      console.error("Failed to load tasks:", error)
      setTasks([])
      setS3Updates([])
      toast({
        title: "로딩 중 오류",
        description: error instanceof Error ? error.message : "작업 목록을 불러오는 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // s3_updates 버킷: bucket_name만 사용
  const getBucketName = useCallback((row: S3UpdateRow) => (row.bucket_name ?? "").trim(), [])

  // S3 필터 옵션: s3_updates.bucket_name 기준으로만
  const uniqueBuckets = useMemo(() => {
    const fromS3 = s3Updates.map(getBucketName).filter(Boolean)
    const names = [...new Set(fromS3)] as string[]
    return names.sort((a, b) => a.localeCompare(b))
  }, [s3Updates, getBucketName])

  // 버킷별 task_id 집합 (s3_updates.bucket_name 기준, 필터링용)
  const taskIdsByBucket = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const row of s3Updates) {
      const bucket = getBucketName(row)
      if (!bucket || !row.task_id) continue
      if (!map.has(bucket)) map.set(bucket, new Set())
      map.get(bucket)!.add(String(row.task_id))
    }
    return map
  }, [s3Updates, getBucketName])

  // S3에서 온 업무인지 (s3_updates.task_id로 연결된 task id 집합)
  const taskIdsFromS3 = useMemo(() => {
    const set = new Set<string>()
    for (const row of s3Updates) {
      if (row.task_id) set.add(String(row.task_id))
    }
    return set
  }, [s3Updates])

  const filterTasks = useCallback(() => {
    let filtered = [...tasks]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          task.assigned_by_name?.toLowerCase().includes(query) ||
          task.assigned_by_email?.toLowerCase().includes(query) ||
          task.assigned_to_name?.toLowerCase().includes(query) ||
          task.assigned_to_email?.toLowerCase().includes(query)
      )
    }


    // S3 필터: s3_updates.bucket_name 기준. "s3_only" = S3에서 온 태스크만, 특정 버킷 = 해당 bucket_name으로 연결된 태스크만
    if (bucketFilter === "s3_only") {
      filtered = filtered.filter((task) => taskIdsFromS3.has(task.id))
    } else if (bucketFilter !== "all") {
      const key = bucketFilter.trim()
      const taskIdsForBucket = taskIdsByBucket.get(key)
      filtered = filtered.filter((task) => taskIdsForBucket?.has(task.id))
    }

    setFilteredTasks(filtered)

    // s3_updates: bucket_name·검색어로 필터
    let s3Filtered = [...s3Updates]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      s3Filtered = s3Filtered.filter(
        (row) =>
          (row.file_name || "").toLowerCase().includes(q) ||
          (row.s3_key || "").toLowerCase().includes(q) ||
          (row.bucket_name || "").toLowerCase().includes(q)
      )
    }
    if (bucketFilter !== "all") {
      const key = bucketFilter.trim()
      if (key === "s3_only") {
        // s3_only는 task 필터에서만 사용, s3 목록은 전부 유지
      } else {
        s3Filtered = s3Filtered.filter((row) => getBucketName(row) === key)
      }
    }
    setFilteredS3Updates(s3Filtered)
  }, [tasks, s3Updates, searchQuery, bucketFilter, getBucketName, taskIdsByBucket, taskIdsFromS3])

  useEffect(() => {
    loadTasks()
  }, [])

  // 케이스 상세에서 요청자 내용 수정 시 해당 task 반영
  useEffect(() => {
    const handler = async (e: Event) => {
      const { taskId } = (e as CustomEvent<{ taskId: string }>).detail
      try {
        const res = await fetch(`/api/tasks/${taskId}`, { credentials: "include" })
        if (!res.ok) return
        const data = await res.json()
        const updated = data.task
        if (!updated) return
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t))
        )
      } catch {
        // 무시
      }
    }
    window.addEventListener("task-content-updated", handler)
    return () => window.removeEventListener("task-content-updated", handler)
  }, [])

  // 목록 새로고침은 초기 로드와 업로드 완료(UploadSection onSuccess) 시에만 수행

  // Dashboard에서 넘어오는 query 적용: q
  useEffect(() => {
    const q = searchParams.get("q")
    if (q !== null) setSearchQuery(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    filterTasks()
  }, [filterTasks])

  // 진행 항목 먼저, 완료된 테스크는 맨 아래로
  const filteredInProgress = useMemo(() => filteredTasks.filter((t) => t.status !== "completed"), [filteredTasks])
  const filteredCompleted = useMemo(() => filteredTasks.filter((t) => t.status === "completed"), [filteredTasks])

  type WorklistEntry =
    | { type: "s3"; s3: S3UpdateRow }
    | { type: "task_with_s3_group"; task: Task; s3List: S3UpdateRow[] }
    | { type: "task"; task: Task }
  const worklistEntries = useMemo((): WorklistEntry[] => {
    const entries: WorklistEntry[] = []
    const s3ByTaskId = new Map<string, S3UpdateRow[]>()
    const unassignedS3: S3UpdateRow[] = []

    for (const s3 of filteredS3Updates) {
      const tid = s3.task_id ? String(s3.task_id) : null
      if (tid) {
        if (!s3ByTaskId.has(tid)) s3ByTaskId.set(tid, [])
        s3ByTaskId.get(tid)!.push(s3)
      } else {
        unassignedS3.push(s3)
      }
    }

    const taskIdsWithS3 = new Set(s3ByTaskId.keys())
    for (const s3 of unassignedS3) {
      entries.push({ type: "s3", s3 })
    }
    for (const task of filteredInProgress) {
      const s3List = s3ByTaskId.get(task.id)
      if (s3List && s3List.length > 0) {
        entries.push({ type: "task_with_s3_group", task, s3List })
      } else if (!taskIdsWithS3.has(task.id)) {
        entries.push({ type: "task", task })
      }
    }
    return entries
  }, [filteredS3Updates, filteredInProgress])

  const completedEntries: WorklistEntry[] = useMemo(
    () => filteredCompleted.map((task) => ({ type: "task" as const, task })),
    [filteredCompleted]
  )

  const s3UnassignedCount = useMemo(
    () => filteredS3Updates.filter((s) => !s.task_id).length,
    [filteredS3Updates]
  )

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation() // 행 클릭 이벤트 방지
    
    if (!confirm("이 작업을 삭제하시겠습니까? 할당받은 모든 사용자의 작업도 삭제됩니다.")) {
      return
    }

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const message = body.error || "작업 삭제에 실패했습니다"
        toast({
          title: "삭제 실패",
          description: message,
          variant: "destructive",
        })
        return
      }

      toast({
        title: "작업이 삭제되었습니다",
        description: "작업이 성공적으로 삭제되었습니다.",
      })

      // 목록 새로고침
      await loadTasks()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "작업 삭제 중 오류가 발생했습니다."
      toast({
        title: "삭제 실패",
        description: message,
        variant: "destructive",
      })
    }
  }

  const handleDeleteS3Update = async (s3UpdateId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm("이 S3 업무를 삭제하시겠습니까? 목록에서 제거됩니다.")) return
    try {
      const response = await fetch(`/api/s3-updates/${s3UpdateId}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const message = body.error || "S3 업무 삭제에 실패했습니다"
        toast({ title: "삭제 실패", description: message, variant: "destructive" })
        return
      }
      toast({ title: "S3 업무가 삭제되었습니다", description: "목록에서 제거되었습니다." })
      await loadTasks()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "S3 업무 삭제 중 오류가 발생했습니다."
      toast({ title: "삭제 실패", description: message, variant: "destructive" })
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <Badge className="bg-red-500 text-white">긴급</Badge>
      case "high":
        return <Badge className="bg-orange-500 text-white">높음</Badge>
      case "medium":
        return <Badge className="bg-yellow-500 text-white">보통</Badge>
      case "low":
        return <Badge className="bg-blue-500 text-white">낮음</Badge>
      default:
        return <Badge>{priority}</Badge>
    }
  }

  const formatDate = (dateString: string) => {
    const date = parseFlexibleDate(dateString)
    if (!date) return "-"
    const yy = String(date.getFullYear()).slice(-2)
    const mm = String(date.getMonth() + 1).padStart(2, "0")
    const dd = String(date.getDate()).padStart(2, "0")
    const hh = String(date.getHours()).padStart(2, "0")
    const min = String(date.getMinutes()).padStart(2, "0")
    return `${yy}.${mm}.${dd} ${hh}:${min}`
  }

  const formatDateOnly = (dateString: string) => {
    const date = parseFlexibleDate(dateString)
    if (!date) return "-"
    const yy = String(date.getFullYear()).slice(-2)
    const mm = String(date.getMonth() + 1).padStart(2, "0")
    const dd = String(date.getDate()).padStart(2, "0")
    return `${yy}.${mm}.${dd}`
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Datalist</h1>
          <p className="text-muted-foreground">업로드와 모든 작업 목록을 한 곳에서 확인하고 관리하세요</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <UploadSection
            onSuccess={loadTasks}
            onUploadStart={() => {
              setUploadLoading(true)
              setUploadProgress(0)
            }}
            onProgress={setUploadProgress}
            onUploadEnd={() => {
              setUploadLoading(false)
              setUploadProgress(0)
            }}
          />
          <Button asChild size="default" className="shrink-0">
            <Link href="/admin/analytics?from=worklist">
              <Plus className="mr-2 h-4 w-4" />
              업무 추가
            </Link>
          </Button>
        </div>
      </div>

      {uploadLoading && (
        <div className="mb-4 rounded-lg border bg-muted/30 px-6 py-3 space-y-1.5">
          <Progress value={uploadProgress} className="h-2" />
          <p className="text-xs text-muted-foreground">업로드 중 {uploadProgress}%</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>전체 작업</CardTitle>
          <CardDescription>
            진행 중 {worklistEntries.length}개
            {completedEntries.length > 0 && ` · 완료 ${completedEntries.length}개`}
            {s3UnassignedCount > 0 && ` (S3 미할당 ${s3UnassignedCount}건)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="제목, 담당자, 요청자, 파일명..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <Select value={bucketFilter} onValueChange={setBucketFilter}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder="S3" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="s3_only">S3만 보기</SelectItem>
                    {uniqueBuckets.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleRefresh} variant="outline" size="icon" className="h-9 w-9 shrink-0" disabled={isLoading} aria-label="새로고침" title="새로고침">
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-muted-foreground">로딩 중...</div>
                </div>
              ) : worklistEntries.length === 0 && completedEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Activity className="mb-4 h-12 w-12 text-muted-foreground/50" />
                  <p className="text-muted-foreground">작업이 없습니다. 업로드하거나 업무를 추가해 보세요.</p>
                </div>
              ) : (
                <>
                <div className="overflow-x-auto">
                  <Table className="w-full table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 shrink-0 px-2" />
                        <TableHead className="w-[30%] min-w-[200px] max-w-[380px]">제목</TableHead>
                        <TableHead className="w-[70px] shrink-0 text-center">할당</TableHead>
                        <TableHead className="w-[11%] min-w-[80px]">요청자</TableHead>
                        <TableHead className="w-[11%] min-w-[80px]">담당자</TableHead>
                        <TableHead className="w-[90px] shrink-0 text-center">생성일</TableHead>
                        <TableHead className="w-[72px] shrink-0 text-center">우선순위</TableHead>
                        <TableHead className="w-[90px] shrink-0 text-center">마감일</TableHead>
                        <TableHead className="w-[80px] shrink-0" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {worklistEntries.map((entry) => {
                        if (entry.type === "s3") {
                          const row = entry.s3
                          return (
                            <TableRow
                              key={`s3-${row.id}`}
                              className="cursor-pointer hover:bg-accent/50 bg-amber-500/5 border-l-4 border-l-amber-500/50 border-t border-t-amber-500/20"
                              onClick={() => router.push(`/admin/cases/s3-update/${row.id}`)}
                            >
                              <TableCell className="w-10 px-2 align-top" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedRowIds.has(`s3-${row.id}`)}
                                  onCheckedChange={() => toggleRowSelection(`s3-${row.id}`)}
                                  aria-label={`${row.file_name} 선택`}
                                />
                              </TableCell>
                              <TableCell className="font-medium align-top py-2 min-w-0">
                                <div className="text-sm truncate" title={row.file_name}>{row.file_name}</div>
                                {row.metadata != null && formatS3Metadata(row.metadata) && (
                                  <div className="text-[0.65rem] leading-tight text-muted-foreground mt-0.5 max-w-full line-clamp-2" title={formatS3Metadata(row.metadata)}>
                                    {formatS3Metadata(row.metadata)}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge className="bg-amber-500/10 text-amber-600 font-normal">미할당</Badge>
                              </TableCell>
                              <TableCell className="min-w-0 truncate" title={getBucketName(row) || "-"}>{getBucketName(row) || "-"}</TableCell>
                              <TableCell className="min-w-0 truncate">미지정</TableCell>
                              <TableCell className="text-sm text-muted-foreground shrink-0 whitespace-nowrap text-center">
                                {formatDate(row.upload_time || row.created_at)}
                              </TableCell>
                              <TableCell className="min-w-0 text-center shrink-0">-</TableCell>
                              <TableCell className="text-sm text-muted-foreground shrink-0 whitespace-nowrap text-center">-</TableCell>
                              <TableCell className="w-[80px] text-right" onClick={(e) => e.stopPropagation()}>
                                {(me?.role === "staff") && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => handleDeleteS3Update(String(row.id), e)}
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    title="S3 업무 삭제"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        }
                        if (entry.type === "task_with_s3_group") {
                          const { task, s3List } = entry
                          const expired = isTaskExpired(task)
                          return (
                            <Fragment key={`group-${task.id}`}>
                              <TableRow
                                className={`cursor-pointer hover:bg-accent/50 bg-emerald-500/6 border-l-4 border-l-emerald-500/50 ${expired ? "bg-red-500/5" : ""}`}
                                onClick={() => router.push(`/admin/cases/${task.id}`)}
                              >
                                <TableCell className="w-10 px-2" />
                                <TableCell className="font-medium py-2 min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="truncate" title={task.title}>{task.title}</span>
                                    <Badge variant="secondary" className="font-normal text-xs shrink-0">
                                      S3 {s3List.length}건
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge className="bg-emerald-500/15 text-emerald-700 font-normal border border-emerald-500/40">할당</Badge>
                                </TableCell>
                                <TableCell className="min-w-0 truncate" title={task.assigned_by_name || task.assigned_by_email || ""}>{task.assigned_by_name || task.assigned_by_email || "Unknown"}</TableCell>
                                <TableCell className="min-w-0 truncate" title={task.assigned_to_name || task.assigned_to_email || ""}>{task.assigned_to_name || task.assigned_to_email || "Unknown"}</TableCell>
                                <TableCell className="text-sm text-muted-foreground shrink-0 whitespace-nowrap text-center">{formatDate(task.created_at)}</TableCell>
                                <TableCell className="shrink-0 text-center">{getPriorityBadge(task.priority)}</TableCell>
                                <TableCell className={`text-sm shrink-0 whitespace-nowrap text-center ${expired ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                                  {task.due_date ? (
                                    <>
                                      {formatDateOnly(task.due_date)}
                                      {(() => {
                                        const daysOverdue = getDaysOverdue(task)
                                        return daysOverdue > 0 ? <span className="text-red-600 font-medium ml-1">+{daysOverdue}</span> : null
                                      })()}
                                    </>
                                  ) : "-"}
                                </TableCell>
                                <TableCell className="w-[80px] text-right" onClick={(e) => e.stopPropagation()}>
                                  {(me?.id === task.assigned_by || me?.role === "staff") && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => handleDeleteTask(task.id, e)}
                                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      title="작업 삭제"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                              {s3List.map((row) => (
                                <TableRow
                                  key={`s3-${row.id}`}
                                  className="cursor-pointer hover:bg-accent/30 bg-emerald-500/5 border-l-4 border-l-emerald-500/30"
                                  onClick={() => router.push(`/admin/cases/s3-update/${row.id}`)}
                                >
                                  <TableCell className="w-10 px-2" />
                                  <TableCell className="font-medium pl-8 align-top py-1.5 text-sm text-muted-foreground min-w-0">
                                    <span className="font-mono text-emerald-600/80 mr-2 shrink-0" aria-hidden>└</span>
                                    <span className="truncate inline-block max-w-full align-bottom" title={row.file_name}>{row.file_name}</span>
                                  </TableCell>
                                  <TableCell colSpan={6} className="py-1.5" />
                                  <TableCell className="w-[80px] py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                                    {(me?.role === "staff") && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => handleDeleteS3Update(String(row.id), e)}
                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        title="S3 업무 삭제"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </Fragment>
                          )
                        }
                        const task = entry.task
                        const expired = isTaskExpired(task)
                        return (
<TableRow
                          key={task.id}
                            className={`cursor-pointer hover:bg-accent/50 border-l-4 border-l-border ${expired ? "bg-red-500/5" : ""}`}
                            onClick={() => router.push(`/admin/cases/${task.id}`)}
                          >
                            <TableCell className="w-10 px-2" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedRowIds.has(`task-${task.id}`)}
                                onCheckedChange={() => toggleRowSelection(`task-${task.id}`)}
                                aria-label={`${task.title} 선택`}
                              />
                            </TableCell>
                            <TableCell className="font-medium min-w-0">
                              <span className="truncate block" title={task.title}>{task.title}</span>
                            </TableCell>
                            <TableCell className="text-center shrink-0">
                              <Badge className="bg-emerald-500/15 text-emerald-700 font-normal border border-emerald-500/40">할당</Badge>
                            </TableCell>
                            <TableCell className="min-w-0 truncate" title={task.assigned_by_name || task.assigned_by_email || ""}>{task.assigned_by_name || task.assigned_by_email || "Unknown"}</TableCell>
                            <TableCell className="min-w-0 truncate" title={task.assigned_to_name || task.assigned_to_email || ""}>{task.assigned_to_name || task.assigned_to_email || "Unknown"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground shrink-0 whitespace-nowrap text-center">{formatDate(task.created_at)}</TableCell>
                            <TableCell className="shrink-0 text-center">{getPriorityBadge(task.priority)}</TableCell>
                            <TableCell className={`text-sm shrink-0 whitespace-nowrap text-center ${expired ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                              {task.due_date ? (
                                <>
                                  {formatDateOnly(task.due_date)}
                                  {(() => {
                                    const daysOverdue = getDaysOverdue(task)
                                    return daysOverdue > 0 ? <span className="text-red-600 font-medium ml-1">+{daysOverdue}</span> : null
                                  })()}
                                </>
                              ) : "-"}
                            </TableCell>
                            <TableCell className="w-[80px] text-right" onClick={(e) => e.stopPropagation()}>
                              {(me?.id === task.assigned_by || me?.role === "staff") && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => handleDeleteTask(task.id, e)}
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="작업 삭제"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {/* 완료된 테스크: 맨 아래 */}
                      {completedEntries.length > 0 && (
                        <>
                          <TableRow className="bg-slate-100/80 dark:bg-slate-800/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/50 border-l-4 border-l-slate-400 dark:border-l-slate-500 [&>td]:bg-slate-100/80 dark:[&>td]:bg-slate-800/50">
                            <TableCell colSpan={9} className="font-medium text-slate-600 dark:text-slate-400 py-2.5 text-center w-full min-w-0">
                              — 완료된 작업 ({completedEntries.length}건) —
                            </TableCell>
                          </TableRow>
                          {completedEntries.map((entry) => {
                            if (entry.type !== "task") return null
                            const task = entry.task
                            return (
                              <TableRow
                                key={task.id}
                                className="cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-800/40 border-l-4 border-l-slate-400 dark:border-l-slate-500 [&>td]:bg-slate-50/60 dark:[&>td]:bg-slate-800/30"
                                onClick={() => router.push(`/admin/cases/${task.id}`)}
                              >
                                <TableCell className="w-10 px-2 text-center">
                                  <CheckCircle2 className="h-5 w-5 text-slate-500 dark:text-slate-400 mx-auto" aria-label="완료" />
                                </TableCell>
                                <TableCell className="font-medium text-center min-w-0 truncate" title={task.title}>{task.title}</TableCell>
                                <TableCell className="text-center">
                                  <Badge className="bg-emerald-500/15 text-emerald-700 font-normal border border-emerald-500/40">할당</Badge>
                                </TableCell>
                                <TableCell className="text-center min-w-0 truncate">{task.assigned_by_name || task.assigned_by_email || "Unknown"}</TableCell>
                                <TableCell className="text-center min-w-0 truncate">{task.assigned_to_name || task.assigned_to_email || "Unknown"}</TableCell>
                                <TableCell className="text-sm text-muted-foreground text-center shrink-0 whitespace-nowrap">{formatDate(task.created_at)}</TableCell>
                                <TableCell className="text-center shrink-0">{getPriorityBadge(task.priority)}</TableCell>
                                <TableCell className="text-sm text-muted-foreground text-center shrink-0 whitespace-nowrap">{task.due_date ? formatDateOnly(task.due_date) : "-"}</TableCell>
                                <TableCell className="w-[80px] text-center" />
                              </TableRow>
                            )
                          })}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
                </>
              )}
            </CardContent>
          </Card>

          {selectedRowIds.size > 0 && (
            <div className="flex justify-center items-center gap-4 py-6">
              <span className="text-sm text-muted-foreground">선택 {selectedRowIds.size}건</span>
              <Button
                variant="default"
                size="lg"
                className="cursor-pointer"
                onClick={() => setBatchRequestOpen(true)}
              >
                요청
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="cursor-pointer"
                onClick={() => setSelectedRowIds(new Set())}
              >
                취소
              </Button>
            </div>
          )}

          <BatchRequestModal
            open={batchRequestOpen}
            onOpenChange={setBatchRequestOpen}
            selectedRowIds={selectedRowIds}
            tasks={filteredInProgress}
            onSuccess={() => {
              setSelectedRowIds(new Set())
              loadTasks()
            }}
          />

    </div>
  )
}
