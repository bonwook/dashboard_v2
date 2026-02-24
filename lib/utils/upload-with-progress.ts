export type UploadProgress = {
  percent: number
  loaded: number
  total: number
}

type UploadWithProgressOptions = {
  url: string
  formData: FormData
  withCredentials?: boolean
  onProgress?: (p: UploadProgress) => void
  method?: "POST" | "PUT"
}

export async function uploadWithProgress<T = any>({
  url,
  formData,
  withCredentials = true,
  onProgress,
  method = "POST",
}: UploadWithProgressOptions): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url, true)
    xhr.withCredentials = withCredentials

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return
      const percent = Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100)))
      onProgress?.({ percent, loaded: evt.loaded, total: evt.total })
    }

    xhr.onload = () => {
      const contentType = xhr.getResponseHeader("content-type") || ""
      const isJson = contentType.includes("application/json")
      let data: any = null
      try {
        data = isJson ? JSON.parse(xhr.responseText || "null") : xhr.responseText
      } catch {
        data = xhr.responseText
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T)
        return
      }

      const message =
        (data && typeof data === "object" && "error" in data && (data as any).error) ||
        `업로드 실패 (HTTP ${xhr.status})`
      reject(new Error(message))
    }

    xhr.onerror = () => reject(new Error("네트워크 오류로 업로드에 실패했습니다."))
    xhr.onabort = () => reject(new Error("업로드가 취소되었습니다."))

    try {
      xhr.send(formData)
    } catch (e: any) {
      reject(new Error(e?.message || "업로드에 실패했습니다."))
    }
  })
}

