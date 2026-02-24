import { v4 as uuidv4 } from "uuid"
import { query, queryOne } from "./mysql"

const TABLE_NAME = "staff_signup_requests"

export interface StaffSignupRequestRow {
  id: string
  email: string
  password_hash: string
  full_name: string | null
  organization: string | null
  created_at: Date
}

export async function ensureStaffSignupRequestsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS staff_signup_requests (
      id CHAR(36) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(255),
      organization VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

export async function createStaffSignupRequest(
  email: string,
  passwordHash: string,
  fullName?: string,
  organization?: string,
): Promise<void> {
  const id = uuidv4()
  await query(
    `INSERT INTO ${TABLE_NAME} (id, email, password_hash, full_name, organization)
     VALUES (?, ?, ?, ?, ?)`,
    [id, email, passwordHash, fullName || null, organization || null],
  )
}

export async function getPendingStaffSignupCount(): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${TABLE_NAME}`,
  )
  return row?.count ?? 0
}

export async function getPendingStaffSignupRequests(): Promise<
  { id: string; email: string; full_name: string | null; organization: string | null; created_at: Date }[]
> {
  const rows = await query<StaffSignupRequestRow>(
    `SELECT id, email, full_name, organization, created_at FROM ${TABLE_NAME} ORDER BY created_at DESC`,
  )
  return rows
}

export async function getStaffSignupRequestById(
  id: string,
): Promise<(StaffSignupRequestRow & { created_at: Date }) | null> {
  return queryOne<StaffSignupRequestRow & { created_at: Date }>(
    `SELECT id, email, password_hash, full_name, organization, created_at FROM ${TABLE_NAME} WHERE id = ?`,
    [id],
  )
}

export async function deleteStaffSignupRequestById(id: string): Promise<void> {
  await query(`DELETE FROM ${TABLE_NAME} WHERE id = ?`, [id])
}
