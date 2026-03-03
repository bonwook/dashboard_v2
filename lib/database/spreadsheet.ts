import { query, queryOne } from "./mysql"
import { randomUUID } from "crypto"

export interface SpreadsheetFolder {
  id: string
  parent_id: string | null
  name: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface SpreadsheetFile {
  id: string
  folder_id: string | null
  name: string
  headers: string[]
  created_by: string
  created_at: string
  updated_at: string
}

// ── Folder operations ──────────────────────────────────────────────────────

export async function getAllFolders(): Promise<SpreadsheetFolder[]> {
  return query<SpreadsheetFolder>(
    "SELECT * FROM spreadsheet_folders ORDER BY parent_id, name"
  )
}

export async function createFolder(
  parentId: string | null,
  name: string,
  createdBy: string
): Promise<SpreadsheetFolder> {
  const id = randomUUID()
  await query(
    "INSERT INTO spreadsheet_folders (id, parent_id, name, created_by) VALUES (?, ?, ?, ?)",
    [id, parentId, name, createdBy]
  )
  return (await queryOne<SpreadsheetFolder>(
    "SELECT * FROM spreadsheet_folders WHERE id = ?",
    [id]
  )) as SpreadsheetFolder
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await query("UPDATE spreadsheet_folders SET name = ? WHERE id = ?", [name, id])
}

export async function deleteFolder(id: string): Promise<void> {
  await query("DELETE FROM spreadsheet_folders WHERE id = ?", [id])
}

// ── File operations ────────────────────────────────────────────────────────

export async function getAllFiles(): Promise<SpreadsheetFile[]> {
  const rows = await query<any>(
    "SELECT * FROM spreadsheet_files ORDER BY folder_id, name"
  )
  return rows.map(parseFile)
}

export async function createFile(
  folderId: string | null,
  name: string,
  createdBy: string
): Promise<SpreadsheetFile> {
  const id = randomUUID()
  await query(
    "INSERT INTO spreadsheet_files (id, folder_id, name, headers, created_by) VALUES (?, ?, ?, ?, ?)",
    [id, folderId, name, JSON.stringify([]), createdBy]
  )
  const file = await queryOne<any>(
    "SELECT * FROM spreadsheet_files WHERE id = ?",
    [id]
  )
  return parseFile(file)
}

export async function renameFile(id: string, name: string): Promise<void> {
  await query("UPDATE spreadsheet_files SET name = ? WHERE id = ?", [name, id])
}

export async function deleteFile(id: string): Promise<void> {
  await query("DELETE FROM spreadsheet_files WHERE id = ?", [id])
}

// ── Data operations ────────────────────────────────────────────────────────

export async function getFileData(fileId: string): Promise<{
  file: SpreadsheetFile | null
  rows: Record<string, string>[]
}> {
  const file = await queryOne<any>(
    "SELECT * FROM spreadsheet_files WHERE id = ?",
    [fileId]
  )
  if (!file) return { file: null, rows: [] }

  const rowRecords = await query<any>(
    "SELECT row_data FROM spreadsheet_rows WHERE file_id = ? ORDER BY row_index",
    [fileId]
  )

  return {
    file: parseFile(file),
    rows: rowRecords.map((r: any) =>
      typeof r.row_data === "string" ? JSON.parse(r.row_data) : r.row_data
    ),
  }
}

export async function saveFileData(
  fileId: string,
  headers: string[],
  rows: Record<string, string>[]
): Promise<void> {
  await query("UPDATE spreadsheet_files SET headers = ? WHERE id = ?", [
    JSON.stringify(headers),
    fileId,
  ])

  await query("DELETE FROM spreadsheet_rows WHERE file_id = ?", [fileId])

  if (rows.length > 0) {
    const placeholders = rows.map(() => "(?, ?, ?, ?)").join(", ")
    const values: any[] = []
    rows.forEach((row, i) => values.push(randomUUID(), fileId, i, JSON.stringify(row)))
    await query(
      `INSERT INTO spreadsheet_rows (id, file_id, row_index, row_data) VALUES ${placeholders}`,
      values
    )
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseFile(row: any): SpreadsheetFile {
  return {
    ...row,
    headers:
      row.headers
        ? typeof row.headers === "string"
          ? JSON.parse(row.headers)
          : row.headers
        : [],
  }
}
