import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft, FileText, MessageSquare } from "lucide-react"
import { redirect } from "next/navigation"
import { SafeHtml } from "@/components/safe-html"
import { getCurrentUser } from "@/lib/auth"
import { query, queryOne } from "@/lib/db/mysql"
import { extractFileName } from "@/lib/utils/fileKeyHelpers"

function parseFileKeys(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((k): k is string => typeof k === "string")
  if (typeof val === "string") {
    try {
      const arr = JSON.parse(val)
      return Array.isArray(arr) ? arr.filter((k: unknown): k is string => typeof k === "string") : []
    } catch {
      return []
    }
  }
  return []
}

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getCurrentUser()
  if (!me) redirect("/auth/login")
  if (me.role !== "admin" && me.role !== "staff") redirect("/admin")

  const task = await queryOne<any>(
    `
      SELECT
        ta.id,
        ta.title,
        ta.description,
        ta.content,
        ta.file_keys,
        ta.comment_file_keys,
        ta.completed_at,
        ta.assigned_by,
        ta.assigned_to,
        COALESCE(r.report_html, ta.report_html) as report_html,
        r.staff_comments,
        r.client_comments,
        p_by.full_name as assigned_by_name,
        p_by.email as assigned_by_email,
        p_to.full_name as assigned_to_name,
        p_to.email as assigned_to_email
      FROM task_assignments ta
      LEFT JOIN reports r ON r.case_id = ta.id
      LEFT JOIN profiles p_by ON ta.assigned_by = p_by.id
      LEFT JOIN profiles p_to ON ta.assigned_to = p_to.id
      WHERE ta.id = ?
        AND ta.status = 'completed'
      LIMIT 1
    `,
    [id],
  )

  if (!task) {
    redirect("/admin/reports")
  }

  const subtasks = await query<any>(
    `
      SELECT
        ts.id,
        ts.subtitle,
        ts.content,
        ts.assigned_to,
        ts.created_at,
        p.full_name as assigned_to_name,
        p.email as assigned_to_email
      FROM task_subtasks ts
      LEFT JOIN profiles p ON ts.assigned_to = p.id
      WHERE ts.task_id = ?
      ORDER BY ts.subtitle ASC, ts.created_at ASC, ts.id ASC
    `,
    [id],
  )

  let comments: Array<{ id: string; content: string; created_at: string; full_name: string | null }> = []
  try {
    const rows = await query<any>(
      `SELECT c.id, c.content, c.created_at, p.full_name
       FROM task_comments c
       LEFT JOIN profiles p ON c.user_id = p.id
       WHERE c.task_id = ?
       ORDER BY c.created_at ASC`,
      [id],
    )
    comments = rows || []
  } catch {
    // task_comments 테이블 없을 수 있음
  }

  const fileKeys = parseFileKeys(task.file_keys)
  const commentFileKeys = parseFileKeys(task.comment_file_keys)

  const requesterName = task.assigned_by_name || task.assigned_by_email || "요청자"
  const isMultiAssign = Array.isArray(subtasks) && subtasks.length > 0

  type SubtitleGroup = { subtitle: string; requesterBlock: any | null; assigneeBlocks: any[] }
  const subtitleGroups: SubtitleGroup[] = isMultiAssign
    ? (() => {
        const bySubtitle = new Map<string, any[]>()
        for (const st of subtasks) {
          const key = st.subtitle ?? ""
          if (!bySubtitle.has(key)) bySubtitle.set(key, [])
          bySubtitle.get(key)!.push(st)
        }
        const groups: SubtitleGroup[] = []
        for (const [subtitle, list] of bySubtitle.entries()) {
          const requesterBlock = list.find((st: any) => st.assigned_to === task.assigned_by) ?? null
          const assigneeBlocks = list.filter((st: any) => st.assigned_to !== task.assigned_by)
          groups.push({ subtitle, requesterBlock, assigneeBlocks })
        }
        return groups.sort((a, b) => (a.subtitle || "").localeCompare(b.subtitle || ""))
      })()
    : []

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center gap-2">
        <Button variant="ghost" asChild>
          <Link href="/admin/reports">
            <ArrowLeft className="mr-2 h-4 w-4" />
            목록으로
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/reports/${id}`}>리포트 폼 작성</Link>
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Report 상세</CardTitle>
          <CardDescription>
            업무: {task.title}
            {task.completed_at && (
              <span className="ml-2 text-muted-foreground">
                완료: {new Date(task.completed_at).toLocaleDateString("ko-KR")}
              </span>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      {!isMultiAssign && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">{requesterName} 내용</CardTitle>
            </CardHeader>
            <CardContent>
              {task.description && String(task.description).trim() ? (
                <div className="text-sm text-muted-foreground whitespace-pre-wrap rounded-md bg-muted/50 p-3">
                  {String(task.description)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">내용 없음</p>
              )}
            </CardContent>
          </Card>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">담당자 내용</CardTitle>
            </CardHeader>
            <CardContent>
              {task.content && String(task.content).trim() ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <SafeHtml html={String(task.content)} className="prose prose-sm max-w-none dark:prose-invert" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">내용 없음</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {isMultiAssign &&
        subtitleGroups.map((group) => (
          <div key={group.subtitle} className="mb-6 space-y-4">
            <h3 className="text-base font-semibold text-muted-foreground border-b pb-1">
              부제: {group.subtitle || "(없음)"}
            </h3>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{requesterName} 내용</CardTitle>
              </CardHeader>
              <CardContent>
                {group.requesterBlock?.content && String(group.requesterBlock.content).trim() ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <SafeHtml
                      html={String(group.requesterBlock.content)}
                      className="prose prose-sm max-w-none dark:prose-invert"
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">내용 없음</p>
                )}
              </CardContent>
            </Card>
            {group.assigneeBlocks.map((st: any) => (
              <Card key={st.id}>
                <CardHeader>
                  <CardTitle className="text-lg">
                    담당자: {st.assigned_to_name || st.assigned_to_email || "담당자"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {st.content && String(st.content).trim() ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <SafeHtml html={String(st.content)} className="prose prose-sm max-w-none dark:prose-invert" />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">내용 없음</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ))}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            첨부파일
          </CardTitle>
          <CardDescription>
            요청자 첨부 {fileKeys.length}개 · 담당자 등록 {commentFileKeys.length}개
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fileKeys.length === 0 && commentFileKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">첨부파일 없음</p>
          ) : (
            <ul className="space-y-2">
              {fileKeys.length > 0 && (
                <li className="text-sm font-medium text-muted-foreground">요청자 첨부</li>
              )}
              {fileKeys.map((key: string, i: number) => (
                <li key={`f-${i}`}>
                  <Link
                    href={`/api/storage/download?key=${encodeURIComponent(key)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {extractFileName(key, `파일 ${i + 1}`)}
                  </Link>
                </li>
              ))}
              {commentFileKeys.length > 0 && (
                <li className="text-sm font-medium text-muted-foreground mt-3">담당자 등록</li>
              )}
              {commentFileKeys.map((key: string, i: number) => (
                <li key={`c-${i}`}>
                  <Link
                    href={`/api/storage/download?key=${encodeURIComponent(key)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {extractFileName(key, `파일 ${i + 1}`)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            댓글
          </CardTitle>
        </CardHeader>
        <CardContent>
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">댓글 없음</p>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="border-l-2 border-muted pl-3 py-1">
                  <p className="text-xs text-muted-foreground">
                    {c.full_name || "알 수 없음"} · {new Date(c.created_at).toLocaleString("ko-KR")}
                  </p>
                  <p className="text-sm whitespace-pre-wrap mt-0.5">{c.content}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
