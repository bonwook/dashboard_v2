"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Activity, RefreshCw, Search, Trash2, Plus, CheckCircle2, ChevronDown, ChevronRight, Download, Edit2, Check, X } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Fragment } from "react"
import { useToast } from "@/hooks/use-toast"
import { UploadSection } from "./components/UploadSection"
import Link from "next/link"
import { BatchRequestModal } from "./components/BatchRequestModal"
import { S3InlineDetail } from "./components/S3InlineDetail"
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

/** metadata에서 StudyDate 값 추출 (정렬용) */
function getStudyDateFromMetadata(metadata: S3UpdateRow["metadata"]): string {
  if (metadata == null) return ""
  const obj = typeof metadata === "string" ? (() => { try { return JSON.parse(metadata) } catch { return null } })() : metadata
  if (!obj || typeof obj !== "object") return ""
  const rec = obj as Record<string, unknown>
  for (const k of ["Study Date", "StudyDate"]) {
    const v = rec[k]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return ""
}

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
  /** 인라인 S3 상세 펼침 (row.id) */
  const [expandedS3DetailId, setExpandedS3DetailId] = useState<number | null>(null)
  /** task_with_s3_group 하위 파일 행 펼침 여부 (task.id → expanded) */
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  /** S3 업무 제목 편집 상태 */
  const [editingS3Id, setEditingS3Id] = useState<number | null>(null)
  const [editingS3Title, setEditingS3Title] = useState("")
  /** Task 메모 편집 상태 */
  const [editingTaskNoteId, setEditingTaskNoteId] = useState<string | null>(null)
  const [editingTaskNote, setEditingTaskNote] = useState("")
  /** S3 메모 편집 상태 */
  const [editingS3NoteId, setEditingS3NoteId] = useState<number | null>(null)
  const [editingS3Note, setEditingS3Note] = useState("")
  /** 고무밴드로 시각적으로 선택된 행 */
  const [rubberSelectedIds, setRubberSelectedIds] = useState<Set<string>>(new Set())
  const [batchRequestOpen, setBatchRequestOpen] = useState(false)
  const [modalItems, setModalItems] = useState<Set<string>>(new Set())
  /** 커스텀 드래그: 마우스를 따라다니는 카드 표시용 */
  const [dragCard, setDragCard] = useState<{ x: number; y: number; rows: Set<string>; files: S3UpdateRow[] } | null>(null)
  const [isDragOverBtn, setIsDragOverBtn] = useState(false)
  const dragStateRef = useRef<{ startX: number; startY: number; started: boolean; rows: Set<string>; files: S3UpdateRow[] } | null>(null)
  const dropBtnRef = useRef<HTMLDivElement>(null)
  const batchRequestOpenRef = useRef(false)
  const [rubberBandActive, setRubberBandActive] = useState(false)
  const [rubberBandRect, setRubberBandRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const rubberBandStartRef = useRef<{ x: number; y: number } | null>(null)
  const rubberBandRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

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
    setRubberSelectedIds(new Set())
    setExpandedS3DetailId(null)
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

  // batchRequestOpen 상태를 ref에 동기화 (클로저 문제 방지)
  useEffect(() => {
    batchRequestOpenRef.current = batchRequestOpen
  }, [batchRequestOpen])

  // 전체 페이지 고무밴드: mousedown → drag → mouseup
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      // 모달이 열려 있을 때는 rubber band 비활성화
      if (batchRequestOpenRef.current) return
      const target = e.target as HTMLElement
      // 인터랙티브 요소, 드래그 가능한 행([data-draggable-row]), 기타 예외 영역 제외
      if (target.closest("button, a, input, textarea, select, [role='checkbox'], th, label, [data-no-rubber], [data-draggable-row]")) return
      if (e.button !== 0) return
      e.preventDefault()
      rubberBandStartRef.current = { x: e.clientX, y: e.clientY }
      rubberBandRectRef.current = null
      setRubberBandActive(true)
      setRubberBandRect(null)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  // 커스텀 row 드래그: mousemove/mouseup 전역 등록 (항상 활성)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const ds = dragStateRef.current
      if (!ds) return
      const dx = e.clientX - ds.startX
      const dy = e.clientY - ds.startY
      // 5px 임계값 넘으면 드래그 시작
      if (!ds.started && Math.sqrt(dx * dx + dy * dy) > 5) {
        ds.started = true
        document.body.style.userSelect = "none"
        document.body.style.cursor = "grabbing"
      }
      if (!ds.started) return
      setDragCard({ x: e.clientX, y: e.clientY, rows: ds.rows, files: ds.files })
      // 드롭 버튼 위인지 확인
      const btn = dropBtnRef.current
      if (btn) {
        const r = btn.getBoundingClientRect()
        setIsDragOverBtn(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)
      }
    }
    const onUp = (e: MouseEvent) => {
      const ds = dragStateRef.current
      if (!ds) return
      const wasStarted = ds.started
      if (wasStarted) {
        e.preventDefault()
        const btn = dropBtnRef.current
        if (btn) {
          const r = btn.getBoundingClientRect()
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            setModalItems(new Set(ds.rows))
            setBatchRequestOpen(true)
          }
        }
      }
      dragStateRef.current = null
      setDragCard(null)
      setIsDragOverBtn(false)
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [])

  useEffect(() => {
    if (!rubberBandActive) return
    const onMove = (e: MouseEvent) => {
      const start = rubberBandStartRef.current
      if (!start) return
      const rect = {
        x: Math.min(e.clientX, start.x),
        y: Math.min(e.clientY, start.y),
        w: Math.abs(e.clientX - start.x),
        h: Math.abs(e.clientY - start.y),
      }
      rubberBandRectRef.current = rect
      setRubberBandRect({ ...rect })
    }
    const onUp = () => {
      const rect = rubberBandRectRef.current
      if (rect && (rect.w > 8 || rect.h > 8)) {
        // 드래그 선택: 교차 행만 새로 선택 (기존 선택 대체)
        const selBox = { left: rect.x, right: rect.x + rect.w, top: rect.y, bottom: rect.y + rect.h }
        const rows = document.querySelectorAll<HTMLElement>("[data-selectable-row]")
        const next = new Set<string>()
        rows.forEach((row) => {
          const r = row.getBoundingClientRect()
          if (r.left < selBox.right && r.right > selBox.left && r.top < selBox.bottom && r.bottom > selBox.top) {
            const id = row.getAttribute("data-selectable-row")
            if (id) next.add(id)
          }
        })
        setRubberSelectedIds(next)
      } else {
        // 단순 클릭 (움직임 없음) → 선택 및 버튼 카운트 초기화
        setRubberSelectedIds(new Set())
        setModalItems(new Set())
      }
      rubberBandStartRef.current = null
      rubberBandRectRef.current = null
      setRubberBandActive(false)
      setRubberBandRect(null)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [rubberBandActive])

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
    const sortedUnassignedS3 = [...unassignedS3].sort((a, b) => {
      const da = getStudyDateFromMetadata(a.metadata)
      const db = getStudyDateFromMetadata(b.metadata)
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return db.localeCompare(da)
    })
    for (const s3 of sortedUnassignedS3) {
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

  const handleStartEditS3Title = (s3: S3UpdateRow, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingS3Id(s3.id)
    setEditingS3Title(s3.s3_key || s3.file_name || "")
  }

  const handleCancelEditS3Title = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingS3Id(null)
    setEditingS3Title("")
  }

  const handleSaveS3Title = async (s3Id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!editingS3Title.trim()) {
      toast({ title: "제목을 입력해주세요", variant: "destructive" })
      return
    }
    try {
      const response = await fetch(`/api/s3-updates/${s3Id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_name: editingS3Title.trim() }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const message = body.error || "제목 수정에 실패했습니다"
        toast({ title: "수정 실패", description: message, variant: "destructive" })
        return
      }
      toast({ title: "제목이 수정되었습니다" })
      setEditingS3Id(null)
      setEditingS3Title("")
      await loadTasks()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "제목 수정 중 오류가 발생했습니다."
      toast({ title: "수정 실패", description: message, variant: "destructive" })
    }
  }

  const handleStartEditTaskNote = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingTaskNoteId(task.id)
    setEditingTaskNote(task.note || "")
  }

  const handleCancelEditTaskNote = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingTaskNoteId(null)
    setEditingTaskNote("")
  }

  const handleSaveTaskNote = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: editingTaskNote.trim() || null }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const message = body.error || "메모 수정에 실패했습니다"
        toast({ title: "수정 실패", description: message, variant: "destructive" })
        return
      }
      toast({ title: "메모가 수정되었습니다" })
      setEditingTaskNoteId(null)
      setEditingTaskNote("")
      await loadTasks()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "메모 수정 중 오류가 발생했습니다."
      toast({ title: "수정 실패", description: message, variant: "destructive" })
    }
  }

  const handleStartEditS3Note = (s3: S3UpdateRow, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingS3NoteId(s3.id)
    setEditingS3Note(s3.note || "")
  }

  const handleCancelEditS3Note = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingS3NoteId(null)
    setEditingS3Note("")
  }

  const handleSaveS3Note = async (s3Id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const response = await fetch(`/api/s3-updates/${s3Id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: editingS3Note.trim() || null }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const message = body.error || "메모 수정에 실패했습니다"
        toast({ title: "수정 실패", description: message, variant: "destructive" })
        return
      }
      toast({ title: "메모가 수정되었습니다" })
      setEditingS3NoteId(null)
      setEditingS3Note("")
      await loadTasks()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "메모 수정 중 오류가 발생했습니다."
      toast({ title: "수정 실패", description: message, variant: "destructive" })
    }
  }

  const handleBulkDeleteS3 = async () => {
    const selectedS3Ids = Array.from(rubberSelectedIds)
      .filter((id) => id.startsWith("s3-"))
      .map((id) => id.replace("s3-", ""))

    if (selectedS3Ids.length === 0) {
      toast({ title: "선택된 항목이 없습니다", variant: "destructive" })
      return
    }

    if (!confirm(`선택한 ${selectedS3Ids.length}개의 S3 업무를 삭제하시겠습니까?`)) {
      return
    }

    let successCount = 0
    let failCount = 0

    for (const id of selectedS3Ids) {
      try {
        const response = await fetch(`/api/s3-updates/${id}`, {
          method: "DELETE",
          credentials: "include",
        })
        if (response.ok) {
          successCount++
        } else {
          failCount++
        }
      } catch {
        failCount++
      }
    }

    if (successCount > 0) {
      toast({
        title: `${successCount}개의 S3 업무가 삭제되었습니다`,
        description: failCount > 0 ? `${failCount}개 삭제 실패` : undefined,
      })
      setRubberSelectedIds(new Set())
      await loadTasks()
    } else {
      toast({
        title: "삭제 실패",
        description: "선택한 항목을 삭제할 수 없습니다",
        variant: "destructive",
      })
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
          <p className="text-muted-foreground">업로드와 작업 목록을 한 곳에서 확인하고 관리하세요</p>
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
                {rubberSelectedIds.size > 0 && me?.role === "staff" && (
                  <Button
                    onClick={handleBulkDeleteS3}
                    variant="destructive"
                    size="sm"
                    className="h-9 ml-auto"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    삭제 ({rubberSelectedIds.size})
                  </Button>
                )}
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
                <div className="overflow-x-auto select-none">
                  <Table className="w-full table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 shrink-0 px-2" />
                        <TableHead className="w-[35%]">제목</TableHead>
                        <TableHead className="w-[70px] shrink-0 text-center">할당</TableHead>
                        <TableHead className="w-[13%]">요청자/버킷</TableHead>
                        <TableHead className="w-[13%]">담당자</TableHead>
                        <TableHead className="w-[140px] shrink-0 text-center">생성일 / 마감일</TableHead>
                        <TableHead className="w-[180px] shrink-0 text-center">메모</TableHead>
                        <TableHead className="w-[60px] shrink-0" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {worklistEntries.map((entry) => {
                        if (entry.type === "s3") {
                          const row = entry.s3
                          const isDetailOpen = expandedS3DetailId === row.id
                          return (
                            <Fragment key={`s3-${row.id}`}>
                              <TableRow
                                data-selectable-row={`s3-${row.id}`}
                                data-draggable-row
                                onMouseDown={(e) => {
                                  if (e.button !== 0) return
                                  if ((e.target as HTMLElement).closest("[data-checkbox]")) return
                                  const group = rubberSelectedIds.has(`s3-${row.id}`)
                                    ? new Set(rubberSelectedIds)
                                    : new Set([`s3-${row.id}`])
                                  const files = s3Updates.filter((u) => group.has(`s3-${u.id}`))
                                  dragStateRef.current = { startX: e.clientX, startY: e.clientY, started: false, rows: group, files }
                                }}
                                className={`cursor-grab hover:bg-accent/50 bg-amber-500/5 border-l-4 border-l-amber-500/50 border-t border-t-amber-500/20 ${rubberSelectedIds.has(`s3-${row.id}`) ? "ring-inset ring-1 ring-primary bg-primary/10" : ""}`}
                                onClick={(e) => {
                                  const target = e.target as HTMLElement
                                  // 인터랙티브 요소 클릭 시 상세페이지 열기 차단
                                  if (target.closest("[data-checkbox], button, input, [data-no-detail]")) return
                                  const ds = dragStateRef.current
                                  if (ds?.started) return
                                  setExpandedS3DetailId(isDetailOpen ? null : row.id)
                                }}
                              >
                                <TableCell className="w-10 px-2 align-middle">
                                  <div
                                    data-checkbox
                                    className={`w-4 h-4 rounded-sm border flex items-center justify-center cursor-pointer transition-colors ${rubberSelectedIds.has(`s3-${row.id}`) ? "bg-primary border-primary" : "border-muted-foreground/30 hover:border-primary/60"}`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setRubberSelectedIds((prev) => {
                                        const next = new Set(prev)
                                        if (next.has(`s3-${row.id}`)) next.delete(`s3-${row.id}`)
                                        else next.add(`s3-${row.id}`)
                                        return next
                                      })
                                    }}
                                  >
                                    {rubberSelectedIds.has(`s3-${row.id}`) && <span className="text-primary-foreground text-[10px] leading-none">✓</span>}
                                  </div>
                                </TableCell>
                                <TableCell className="font-medium align-top py-2 min-w-0">
                                  {editingS3Id === row.id ? (
                                    <div className="flex items-center gap-1" data-no-detail>
                                      <Input
                                        value={editingS3Title}
                                        onChange={(e) => setEditingS3Title(e.target.value)}
                                        className="h-7 text-sm"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") handleSaveS3Title(row.id, e as unknown as React.MouseEvent)
                                          if (e.key === "Escape") handleCancelEditS3Title(e as unknown as React.MouseEvent)
                                        }}
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                        onClick={(e) => handleSaveS3Title(row.id, e)}
                                      >
                                        <Check className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                                        onClick={handleCancelEditS3Title}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="group">
                                      <div className="flex items-start gap-1">
                                        <div className="text-sm truncate" title={row.s3_key || row.file_name}>{row.s3_key || row.file_name}</div>
                                        {me?.role === "staff" && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -mt-0.5"
                                            onClick={(e) => handleStartEditS3Title(row, e)}
                                            title="제목 수정"
                                          >
                                            <Edit2 className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </div>
                                      {row.metadata != null && formatS3Metadata(row.metadata) && (
                                        <div className="text-[0.65rem] leading-tight text-muted-foreground mt-0.5 max-w-full line-clamp-2" title={formatS3Metadata(row.metadata)}>
                                          {formatS3Metadata(row.metadata)}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge className="bg-amber-500/10 text-amber-600 font-normal">미할당</Badge>
                                </TableCell>
                                <TableCell className="min-w-0 truncate" title={getBucketName(row) || "-"}>{getBucketName(row) || "-"}</TableCell>
                                <TableCell className="min-w-0 truncate">미지정</TableCell>
                                <TableCell className="w-[140px] text-center">
                                  <div className="text-sm text-muted-foreground">
                                    {formatDateOnly(row.upload_time || row.created_at)} / -
                                  </div>
                                </TableCell>
                                <TableCell className="w-[180px]" onClick={(e) => e.stopPropagation()}>
                                  {editingS3NoteId === row.id ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <Input
                                        value={editingS3Note}
                                        onChange={(e) => setEditingS3Note(e.target.value)}
                                        className="h-7 text-sm"
                                        placeholder="메모..."
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") handleSaveS3Note(row.id, e as unknown as React.MouseEvent)
                                          if (e.key === "Escape") handleCancelEditS3Note(e as unknown as React.MouseEvent)
                                        }}
                                      />
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:bg-green-50 shrink-0" onClick={(e) => handleSaveS3Note(row.id, e)}>
                                        <Check className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-600 hover:bg-gray-50 shrink-0" onClick={handleCancelEditS3Note}>
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="group flex items-center justify-center gap-1 min-w-0">
                                      {me?.role === "staff" && (
                                        <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => handleStartEditS3Note(row, e)} title="메모 수정">
                                          <Edit2 className="h-3 w-3" />
                                        </Button>
                                      )}
                                      <span className="text-sm truncate flex-1" title={row.note || ""}>{row.note || ""}</span>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="w-[60px]" />
                              </TableRow>
                              {isDetailOpen && (
                                <TableRow className="bg-amber-500/5 border-l-4 border-l-amber-500/30">
                                  <TableCell colSpan={8} className="py-0">
                                    <S3InlineDetail row={row} toast={toast} />
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          )
                        }
                        if (entry.type === "task_with_s3_group") {
                          const { task, s3List } = entry
                          const expired = isTaskExpired(task)
                          const isExpanded = expandedGroups.has(task.id)
                          const toggleExpand = (e: React.MouseEvent) => {
                            e.stopPropagation()
                            setExpandedGroups((prev) => {
                              const next = new Set(prev)
                              if (next.has(task.id)) next.delete(task.id)
                              else next.add(task.id)
                              return next
                            })
                          }
                          return (
                            <Fragment key={`group-${task.id}`}>
                              <TableRow
                                className={`cursor-pointer hover:bg-accent/50 bg-emerald-500/6 border-l-4 border-l-emerald-500/50 ${expired ? "bg-red-500/5" : ""}`}
                                onClick={() => router.push(`/admin/cases/${task.id}`)}
                              >
                                <TableCell className="w-10 px-2" onClick={toggleExpand}>
                                  <button
                                    className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted transition-colors text-muted-foreground"
                                    title={isExpanded ? "파일 목록 접기" : "파일 목록 펼치기"}
                                  >
                                    {isExpanded
                                      ? <ChevronDown className="h-4 w-4" />
                                      : <ChevronRight className="h-4 w-4" />}
                                  </button>
                                </TableCell>
                                <TableCell className="font-medium py-2 min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="truncate" title={task.title}>{task.title}</span>
                                    <Badge variant="secondary" className="font-normal text-xs shrink-0">
                                      {s3List[0]?.bucket_name || "S3"} {s3List.length}건
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge className="bg-emerald-500/15 text-emerald-700 font-normal border border-emerald-500/40">할당</Badge>
                                </TableCell>
                                <TableCell className="min-w-0 truncate" title={task.assigned_by_name || task.assigned_by_email || ""}>{task.assigned_by_name || task.assigned_by_email || "Unknown"}</TableCell>
                                <TableCell className="min-w-0 truncate">
                                  {task.assignment_type === "individual"
                                    ? <Badge variant="secondary" className="font-normal text-xs">공동</Badge>
                                    : <span title={task.assigned_to_name || task.assigned_to_email || ""}>{task.assigned_to_name || task.assigned_to_email || "Unknown"}</span>}
                                </TableCell>
                                <TableCell className="w-[140px] text-center">
                                  <div className={`text-sm ${expired ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                                    {formatDateOnly(task.created_at)} / {task.due_date ? (
                                      <>
                                        {formatDateOnly(task.due_date)}
                                        {(() => {
                                          const daysOverdue = getDaysOverdue(task)
                                          return daysOverdue > 0 ? <span className="text-red-600 font-medium ml-1">+{daysOverdue}</span> : null
                                        })()}
                                      </>
                                    ) : "-"}
                                  </div>
                                </TableCell>
                                <TableCell className="w-[180px]" onClick={(e) => e.stopPropagation()}>
                                  {editingTaskNoteId === task.id ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <Input value={editingTaskNote} onChange={(e) => setEditingTaskNote(e.target.value)} className="h-7 text-sm" placeholder="메모..." autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleSaveTaskNote(task.id, e as unknown as React.MouseEvent); if (e.key === "Escape") handleCancelEditTaskNote(e as unknown as React.MouseEvent); }} />
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:bg-green-50 shrink-0" onClick={(e) => handleSaveTaskNote(task.id, e)}><Check className="h-4 w-4" /></Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-600 hover:bg-gray-50 shrink-0" onClick={handleCancelEditTaskNote}><X className="h-4 w-4" /></Button>
                                    </div>
                                  ) : (
                                    <div className="group flex items-center justify-center gap-1 min-w-0">
                                      {me?.role === "staff" && <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => handleStartEditTaskNote(task, e)} title="메모 수정"><Edit2 className="h-3 w-3" /></Button>}
                                      <span className="text-sm truncate flex-1" title={task.note || ""}>{task.note || ""}</span>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="w-[60px] text-right" onClick={(e) => e.stopPropagation()}>
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
                              {isExpanded && s3List.map((row) => {
                                const isSubDetailOpen = expandedS3DetailId === row.id
                                return (
                                  <Fragment key={`s3-${row.id}`}>
                                    <TableRow
                                      className="cursor-pointer hover:bg-accent/30 bg-emerald-500/5 border-l-4 border-l-emerald-500/30"
                                      onClick={() => setExpandedS3DetailId(isSubDetailOpen ? null : row.id)}
                                    >
                                      <TableCell className="w-10 px-2" />
                                      <TableCell className="font-medium pl-8 align-middle py-1.5 text-sm text-muted-foreground min-w-0">
                                        <span className="font-mono text-emerald-600/80 mr-2 shrink-0" aria-hidden>└</span>
                                        <span className="truncate inline-block max-w-full align-middle" title={row.s3_key || row.file_name}>{row.s3_key || row.file_name}</span>
                                      </TableCell>
                                      <TableCell colSpan={6} className="py-1.5" />
                                      <TableCell className="w-[60px]" />
                                    </TableRow>
                                    {isSubDetailOpen && (
                                      <TableRow className="bg-emerald-500/5 border-l-4 border-l-emerald-500/20">
                                        <TableCell colSpan={8} className="py-0">
                                          <S3InlineDetail row={row} toast={toast} />
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </Fragment>
                                )
                              })}
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
                            <TableCell className="w-10 px-2" />
                            <TableCell className="font-medium min-w-0">
                              <span className="truncate block" title={task.title}>{task.title}</span>
                            </TableCell>
                            <TableCell className="text-center shrink-0">
                              <Badge className="bg-emerald-500/15 text-emerald-700 font-normal border border-emerald-500/40">할당</Badge>
                            </TableCell>
                            <TableCell className="min-w-0 truncate" title={task.assigned_by_name || task.assigned_by_email || ""}>{task.assigned_by_name || task.assigned_by_email || "Unknown"}</TableCell>
                            <TableCell className="min-w-0 truncate">
                              {task.assignment_type === "individual"
                                ? <Badge variant="secondary" className="font-normal text-xs">공동</Badge>
                                : <span title={task.assigned_to_name || task.assigned_to_email || ""}>{task.assigned_to_name || task.assigned_to_email || "Unknown"}</span>}
                            </TableCell>
                            <TableCell className="w-[140px] text-center">
                              <div className={`text-sm ${expired ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                                {formatDateOnly(task.created_at)} / {task.due_date ? (
                                  <>
                                    {formatDateOnly(task.due_date)}
                                    {(() => {
                                      const daysOverdue = getDaysOverdue(task)
                                      return daysOverdue > 0 ? <span className="text-red-600 font-medium ml-1">+{daysOverdue}</span> : null
                                    })()}
                                  </>
                                ) : "-"}
                              </div>
                            </TableCell>
                            <TableCell className="w-[180px]" onClick={(e) => e.stopPropagation()}>
                              {editingTaskNoteId === task.id ? (
                                <div className="flex items-center justify-center gap-1">
                                  <Input value={editingTaskNote} onChange={(e) => setEditingTaskNote(e.target.value)} className="h-7 text-sm" placeholder="메모..." autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleSaveTaskNote(task.id, e as unknown as React.MouseEvent); if (e.key === "Escape") handleCancelEditTaskNote(e as unknown as React.MouseEvent); }} />
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:bg-green-50 shrink-0" onClick={(e) => handleSaveTaskNote(task.id, e)}><Check className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-600 hover:bg-gray-50 shrink-0" onClick={handleCancelEditTaskNote}><X className="h-4 w-4" /></Button>
                                </div>
                              ) : (
                                <div className="group flex items-center justify-center gap-1 min-w-0">
                                  {me?.role === "staff" && <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => handleStartEditTaskNote(task, e)} title="메모 수정"><Edit2 className="h-3 w-3" /></Button>}
                                  <span className="text-sm truncate flex-1" title={task.note || ""}>{task.note || ""}</span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="w-[60px] text-right" onClick={(e) => e.stopPropagation()}>
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
                            <TableCell colSpan={8} className="font-medium text-slate-600 dark:text-slate-400 py-2.5 text-center w-full min-w-0">
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
                                <TableCell className="text-center min-w-0 truncate">
                                  {task.assignment_type === "individual"
                                    ? <Badge variant="secondary" className="font-normal text-xs">공동</Badge>
                                    : (task.assigned_to_name || task.assigned_to_email || "Unknown")}
                                </TableCell>
                                <TableCell className="w-[140px] text-center">
                                  <div className="text-sm text-muted-foreground">
                                    {formatDateOnly(task.created_at)} / {task.due_date ? formatDateOnly(task.due_date) : "-"}
                                  </div>
                                </TableCell>
                                <TableCell className="w-[180px] text-sm text-muted-foreground text-center truncate" title={task.note || ""}>{task.note || ""}</TableCell>
                                <TableCell className="w-[60px]" />
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

          {/* 카드 하단 중앙 업무 추가 버튼 */}
          <div className="flex justify-center py-8" data-no-rubber>
            <div ref={dropBtnRef}>
              {(() => {
                // 드래그 중이면 드래그 개수, 아니면 체크박스 선택 개수
                const dragCount = dragCard?.rows.size ?? 0
                const checkboxCount = rubberSelectedIds.size
                const count = dragCount > 0 ? dragCount : checkboxCount
                const hasCount = count > 0
                
                if (isDragOverBtn) {
                  return (
                    <Button
                      size="lg"
                      className="shadow-xl transition-all ring-2 ring-primary ring-offset-2 scale-110 pointer-events-none animate-pulse py-4 px-6 h-auto"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      업무 {count}건 추가
                    </Button>
                  )
                }
                
                // 체크박스로 선택된 항목이 있으면 버튼으로, 없으면 링크로
                if (hasCount) {
                  return (
                    <Button
                      size="lg"
                      className="shadow-lg py-4 px-6 h-auto"
                      onClick={() => {
                        setModalItems(new Set(rubberSelectedIds))
                        setBatchRequestOpen(true)
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      업무 {count}건 추가
                    </Button>
                  )
                }
                
                return (
                  <Button size="lg" asChild className="shadow-lg py-4 px-6 h-auto">
                    <Link href="/admin/analytics?from=worklist">
                      <Plus className="mr-2 h-4 w-4" />
                      업무 추가
                    </Link>
                  </Button>
                )
              })()}
            </div>
          </div>

          <BatchRequestModal
            open={batchRequestOpen}
            onOpenChange={setBatchRequestOpen}
            selectedRowIds={modalItems}
            tasks={filteredInProgress}
            s3Updates={s3Updates}
            onSuccess={() => {
              setModalItems(new Set())
              setRubberSelectedIds(new Set())
              loadTasks()
            }}
          />

      {/* 고무밴드 선택 오버레이 */}
      {rubberBandRect && (rubberBandRect.w > 5 || rubberBandRect.h > 5) && (
        <div
          className="fixed pointer-events-none z-60 border-2 border-primary/70 bg-primary/10 rounded"
          style={{
            left: rubberBandRect.x,
            top: rubberBandRect.y,
            width: rubberBandRect.w,
            height: rubberBandRect.h,
          }}
        />
      )}

      {/* 선택 힌트 — 오른쪽 하단 고정 */}
      {rubberSelectedIds.size > 0 && !dragCard && (
        <div className="fixed bottom-6 right-6 z-40 pointer-events-none">
          <div className="flex items-center gap-2 bg-primary text-primary-foreground text-xs font-medium px-3.5 py-2 rounded-xl shadow-lg">
            <span className="bg-primary-foreground/20 text-primary-foreground font-bold px-2 py-0.5 rounded-full text-[11px]">
              {rubberSelectedIds.size}건
            </span>
            잡고 끌어서 업무 추가 버튼에 놓으세요
          </div>
        </div>
      )}

      {/* 커스텀 드래그 카드 (마우스 따라다니는 플로팅 카드) */}
      {dragCard && (
        <div
          className="fixed pointer-events-none z-9999"
          style={{ left: dragCard.x + 14, top: dragCard.y - 24 }}
        >
          <div
            className="bg-white border-2 rounded-xl px-4 py-3 min-w-[180px] max-w-[260px] transition-none"
            style={{
              borderColor: isDragOverBtn ? "#16a34a" : "#3b82f6",
              boxShadow: isDragOverBtn
                ? "4px 4px 0 #86efac, 8px 8px 0 #bbf7d0, 0 12px 28px rgba(0,0,0,0.18)"
                : "4px 4px 0 #93c5fd, 8px 8px 0 #bfdbfe, 0 12px 28px rgba(0,0,0,0.18)",
              transform: "rotate(-1.5deg)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-white text-xs font-bold px-2.5 py-0.5 rounded-full"
                style={{ background: isDragOverBtn ? "#16a34a" : "#2563eb" }}
              >
                {dragCard.rows.size}건
              </span>
              <span className="text-sm font-semibold" style={{ color: isDragOverBtn ? "#15803d" : "#1d4ed8" }}>
                {isDragOverBtn ? "여기에 놓기" : "드래그 중"}
              </span>
            </div>
            {dragCard.files.slice(0, 4).map((f) => (
              <div key={f.id} className="text-xs text-gray-600 truncate max-w-[220px] py-0.5">
                · {f.file_name}
              </div>
            ))}
            {dragCard.files.length > 4 && (
              <div className="text-xs text-gray-400 mt-1">그 외 {dragCard.files.length - 4}개</div>
            )}
          </div>
        </div>
      )}


    </div>
  )
}
