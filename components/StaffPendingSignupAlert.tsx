"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Users, X } from "lucide-react"

const POLL_INTERVAL_MS = 30_000

export function StaffPendingSignupAlert() {
  const [pendingCount, setPendingCount] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/pending-staff", {
        credentials: "include",
      })
      if (!res.ok) return
      const data = await res.json()
      setPendingCount(Number(data?.count ?? 0))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchPending()
    const id = setInterval(fetchPending, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchPending])

  if (pendingCount === 0 || dismissed) return null

  return (
    <div
      className="flex items-center justify-between gap-4 px-6 py-3 text-sm font-medium border-b bg-amber-500/15 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100 border-amber-500/30"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Users className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="truncate">
          Staff 가입 요청이 {pendingCount}건 있습니다.
        </span>
        <Link
          href="/admin/users"
          className="shrink-0 underline underline-offset-2 hover:no-underline font-semibold text-amber-800 dark:text-amber-200"
        >
          사용자 관리에서 검토
        </Link>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 p-1 rounded hover:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 transition-colors"
        aria-label="닫기"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
