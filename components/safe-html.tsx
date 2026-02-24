"use client"

import { sanitizeHtml } from "@/lib/utils/sanitize"
import { useEffect, useState } from "react"

interface SafeHtmlProps {
  html: string | null | undefined
  className?: string
  style?: React.CSSProperties
}

/**
 * XSS 방어를 위한 안전한 HTML 렌더링 컴포넌트
 * DOMPurify를 사용하여 HTML을 sanitize합니다.
 */
export function SafeHtml({ html, className, style }: SafeHtmlProps) {
  const [sanitizedHtml, setSanitizedHtml] = useState<string>("")

  useEffect(() => {
    setSanitizedHtml(sanitizeHtml(html))
  }, [html])

  return (
    <div
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
}
