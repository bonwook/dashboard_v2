"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** /admin/file-upload → Datalist(업로드 UI 포함)로 리다이렉트 */
export default function FileUploadPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/admin/cases")
  }, [router])
  return null
}
