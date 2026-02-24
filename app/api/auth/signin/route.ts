import { type NextRequest, NextResponse } from "next/server"
import { getUserByEmail, verifyPassword, generateToken } from "@/lib/db/auth"
import { cookies } from "next/headers"
import { authRateLimiter } from "@/lib/middleware/rate-limit"
import { writeAuditLog } from "@/lib/db/audit"

export async function POST(request: NextRequest) {
  try {
    // Rate Limiting 체크
    const rateLimit = await authRateLimiter(request)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { 
          status: 429,
          headers: {
            "X-RateLimit-Limit": "10",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": new Date(rateLimit.resetTime).toISOString(),
          },
        }
      )
    }

    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    // Find user
    const user = await getUserByEmail(email)
    if (!user) {
      await writeAuditLog({
        request,
        userId: null,
        action: "auth.signin_failed",
        details: { email, reason: "user_not_found" },
      })
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    // Verify password
    // Do not log passwords or hashes for security
    const isValid = await verifyPassword(password, user.password_hash)

    if (!isValid) {
      await writeAuditLog({
        request,
        userId: user.id,
        action: "auth.signin_failed",
        details: { email: user.email, reason: "invalid_password" },
      })
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    // Generate token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      organization: user.organization,
    })

    // Set cookie
    const cookieStore = await cookies()
    // Only use secure cookies if explicitly set to true or if using HTTPS
    // In EC2, if not using HTTPS, set secure to false
    const isSecure = process.env.COOKIE_SECURE === "true" ||
      (process.env.NODE_ENV === "production" && request.url.startsWith("https://"))

    cookieStore.set("auth-token", token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "auth.signin",
      details: { email: user.email, role: user.role },
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        organization: user.organization,
      },
    }, {
      headers: {
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": rateLimit.remaining.toString(),
        "X-RateLimit-Reset": new Date(rateLimit.resetTime).toISOString(),
      },
    })
  } catch (error: unknown) {
    console.error("Signin error:", error)
    return NextResponse.json({ error: "Failed to sign in" }, { status: 500 })
  }
}
