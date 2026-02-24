import { cookies } from "next/headers"
import { verifyToken as verifyJWT, getUserById, type AuthUser } from "../database/auth"

export { verifyToken } from "../database/auth"

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value

    if (!token) {
      return null
    }

    const decoded = verifyJWT(token)
    if (!decoded) {
      return null
    }

    const user = await getUserById(decoded.id)
    return user
  } catch (error) {
    console.error("[v0] Get current user error:", error)
    return null
  }
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Not authenticated")
  }
  return user
}

export async function requireRole(role: "admin" | "staff" | "client"): Promise<AuthUser> {
  const user = await requireAuth()
  if (user.role !== role && user.role !== "admin") {
    throw new Error("Insufficient permissions")
  }
  return user
}
