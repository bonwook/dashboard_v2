import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { v4 as uuidv4 } from "uuid"
import { query, queryOne } from "./mysql"

// JWT_SECRET을 지연 평가로 가져오기 (빌드 시점 오류 방지)
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required")
  }
  return secret
}

export interface AuthUser {
  id: string
  email: string
  role: "admin" | "client" | "staff"
  full_name: string | null
  organization: string | null
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Do not log passwords or hashes for security
  return bcrypt.compare(password, hash)
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: "7d" },
  )
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any
    return {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      full_name: null,
      organization: null,
    }
  } catch {
    return null
  }
}

export async function createUser(
  email: string,
  password: string,
  fullName?: string,
  organization?: string,
  role: "admin" | "client" | "staff" = "client",
): Promise<AuthUser> {
  const id = uuidv4()
  const passwordHash = await hashPassword(password)

  await query(
    `INSERT INTO profiles (id, email, password_hash, full_name, organization, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [id, email, passwordHash, fullName || null, organization || null, role],
  )

  return {
    id,
    email,
    role,
    full_name: fullName || null,
    organization: organization || null,
  }
}

/** 기존 password_hash로 사용자 생성 (Staff 승인 등) */
export async function createUserWithHash(
  email: string,
  passwordHash: string,
  fullName?: string,
  organization?: string,
  role: "admin" | "client" | "staff" = "client",
): Promise<AuthUser> {
  const id = uuidv4()
  await query(
    `INSERT INTO profiles (id, email, password_hash, full_name, organization, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [id, email, passwordHash, fullName || null, organization || null, role],
  )
  return {
    id,
    email,
    role,
    full_name: fullName || null,
    organization: organization || null,
  }
}

export async function getUserByEmail(email: string): Promise<(AuthUser & { password_hash: string }) | null> {
  return queryOne<AuthUser & { password_hash: string }>(
    "SELECT id, email, password_hash, full_name, organization, role FROM profiles WHERE email = ?",
    [email],
  )
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  return queryOne<AuthUser>("SELECT id, email, full_name, organization, role FROM profiles WHERE id = ?", [id])
}
