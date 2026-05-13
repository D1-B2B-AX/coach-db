import fs from 'fs/promises'
import type { Dirent } from 'fs'
import path from 'path'

const DEFAULT_STORAGE_ROOT =
  process.env.NODE_ENV === 'production'
    ? '/data'
    : path.join(process.cwd(), '.local-storage')

const STORAGE_ROOT = path.resolve(process.env.LOCAL_STORAGE_ROOT || DEFAULT_STORAGE_ROOT)

export type StoredFileListItem = {
  key: string
  lastModified?: Date
}

function normalizeKey(key: string): string {
  const normalized = path.posix.normalize(key.replaceAll('\\', '/')).replace(/^\/+/, '')
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Invalid storage key: ${key}`)
  }
  return normalized
}

function resolveStoragePath(key: string): string {
  const normalized = normalizeKey(key)
  const resolved = path.resolve(STORAGE_ROOT, normalized)
  if (resolved !== STORAGE_ROOT && !resolved.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error(`Invalid storage key: ${key}`)
  }
  return resolved
}

function sanitizeSegment(value: string): string {
  const sanitized = value
    .normalize('NFC')
    .replace(/[\\/\0-\x1F\x7F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return sanitized || 'file'
}

export function buildStorageKey(...segments: string[]): string {
  return segments.map(sanitizeSegment).join('/')
}

export function isExternalFileUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

export function isLocalStorageKey(value: string): boolean {
  return Boolean(value) && !isExternalFileUrl(value) && !value.startsWith('/api/')
}

export function getDocumentDownloadUrl(documentId: string): string {
  return `/api/documents/${documentId}/download`
}

export function getClientFileUrl(document: { id: string }): string {
  return getDocumentDownloadUrl(document.id)
}

export async function uploadFile(key: string, body: Buffer, _contentType: string): Promise<string> {
  const normalized = normalizeKey(key)
  const filePath = resolveStoragePath(normalized)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, body)
  return normalized
}

export async function readFile(key: string): Promise<Buffer> {
  return fs.readFile(resolveStoragePath(key))
}

export async function statFile(key: string) {
  return fs.stat(resolveStoragePath(key))
}

export async function deleteFile(key: string): Promise<void> {
  if (!isLocalStorageKey(key)) return

  try {
    await fs.unlink(resolveStoragePath(key))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

export async function listFiles(prefix: string): Promise<StoredFileListItem[]> {
  const normalizedPrefix = normalizeKey(prefix)
  const rootPath = resolveStoragePath(normalizedPrefix)
  const files: StoredFileListItem[] = []

  async function walk(currentPath: string, currentKey: string) {
    let entries: Dirent<string>[]
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true, encoding: 'utf8' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }

    for (const entry of entries) {
      const childPath = path.join(currentPath, entry.name)
      const childKey = path.posix.join(currentKey, entry.name)
      if (entry.isDirectory()) {
        await walk(childPath, childKey)
      } else if (entry.isFile()) {
        const stat = await fs.stat(childPath)
        files.push({ key: childKey, lastModified: stat.mtime })
      }
    }
  }

  await walk(rootPath, normalizedPrefix)
  return files
}

export function getContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  const types: Record<string, string> = {
    '.csv': 'text/csv; charset=utf-8',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  return types[ext] || 'application/octet-stream'
}
