/**
 * localStorage 접근이 차단된 환경(iframe, 사생활 보호 설정 등)에서
 * "Access to storage is not allowed from this context" 오류를 방지하기 위한 래퍼.
 * 접근 불가 시 예외를 던지지 않고 무시하거나 null/void를 반환합니다.
 */

function hasWindowAndStorage(): boolean {
  try {
    if (typeof window === "undefined") return false
    const storage = window.localStorage
    if (!storage) return false
    const k = "__safe_storage_check__"
    storage.setItem(k, "1")
    storage.removeItem(k)
    return true
  } catch {
    return false
  }
}

let storageAvailable: boolean | null = null

function isStorageAvailable(): boolean {
  try {
    if (storageAvailable === null) {
      storageAvailable = hasWindowAndStorage()
    }
    return storageAvailable === true
  } catch {
    storageAvailable = false
    return false
  }
}

function safeGetItem(key: string): string | null {
  try {
    if (!isStorageAvailable()) return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (!isStorageAvailable()) return
    window.localStorage.setItem(key, value)
  } catch {
    // 접근 불가 시 무시
  }
}

function safeRemoveItem(key: string): void {
  try {
    if (!isStorageAvailable()) return
    window.localStorage.removeItem(key)
  } catch {
    // 접근 불가 시 무시
  }
}

function safeKeysWithPrefix(prefix: string): string[] {
  try {
    if (!isStorageAvailable()) return []
    const keys: string[] = []
    const storage = window.localStorage
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && key.startsWith(prefix)) keys.push(key)
    }
    return keys
  } catch {
    return []
  }
}

export const safeStorage = {
  getItem: safeGetItem,
  setItem: safeSetItem,
  removeItem: safeRemoveItem,
  keysWithPrefix: safeKeysWithPrefix,
}
