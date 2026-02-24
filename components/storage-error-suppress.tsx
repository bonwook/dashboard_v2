"use client"

import { useEffect } from "react"

/**
 * iframe/사생활 보호 등으로 localStorage 접근이 불가한 환경에서
 * "Access to storage is not allowed from this context"가 Promise로 발생하는 경우
 * 콘솔에 Uncaught (in promise) 로 뜨지 않도록 처리합니다.
 * (next-themes 등 서드파티가 storage를 쓰는 경우 발생)
 */
export function StorageErrorSuppress() {
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const msg = event?.reason?.message ?? String(event?.reason ?? "")
      if (
        typeof msg === "string" &&
        (msg.includes("Access to storage") || msg.includes("storage is not allowed"))
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener("unhandledrejection", handler)
    return () => window.removeEventListener("unhandledrejection", handler)
  }, [])
  return null
}
