// Fetch wrapper with automatic logout on connection errors or authentication failures

import { safeStorage } from "./safeStorage"

/**
 * Automatically logs out user on network errors or authentication failures
 */
async function handleAuthError() {
  try {
    // Clear localStorage (Excel viewer data, etc.) - 접근 불가 환경에서 예외가 나지 않도록 전체 try/catch
    if (typeof window !== "undefined") {
      try {
        safeStorage.removeItem('excelViewer_data')
        safeStorage.removeItem('excelViewer_headers')
        safeStorage.removeItem('excelViewer_fileName')
        safeStorage.removeItem('excelViewer_filters')
        safeStorage.removeItem('excelViewer_sorts')
        safeStorage.removeItem('excelViewer_highlightedCells')
        safeStorage.removeItem('excelViewer_currentPage')
        safeStorage.keysWithPrefix('loginTime_').forEach(key => safeStorage.removeItem(key))
      } catch {
        // Access to storage is not allowed from this context 등 무시
      }
    }

    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {})
  } catch {
    // handleAuthError 자체에서 발생한 오류는 무시 (리다이렉트는 진행)
  } finally {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth/")) {
      window.location.href = "/auth/login"
    }
  }
}

/**
 * Wrapper for fetch that automatically handles authentication errors and network failures
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  try {
    const response = await fetch(input, init)

    // Handle authentication errors (401, 403)
    if (response.status === 401 || response.status === 403) {
      await handleAuthError()
      throw new Error("Authentication failed")
    }

    return response
  } catch (error: any) {
    // Handle network errors (connection lost, timeout, etc.)
    if (
      error instanceof TypeError ||
      error.name === "NetworkError" ||
      error.message?.includes("Failed to fetch") ||
      error.message?.includes("Network request failed") ||
      error.message?.includes("network")
    ) {
      // Only auto-logout on network errors if we're not already on auth pages
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth/")) {
        await handleAuthError()
      }
    }

    throw error
  }
}

