import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { getContentType, isExternalFileUrl, isLocalStorageKey, readFile, statFile } from '@/lib/storage'

type RouteParams = { params: Promise<{ id: string }> }

export const runtime = 'nodejs'

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const document = await prisma.coachDocument.findUnique({
    where: { id },
  })

  if (!document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (isExternalFileUrl(document.fileUrl)) {
    return NextResponse.redirect(document.fileUrl)
  }
  if (!isLocalStorageKey(document.fileUrl)) {
    return NextResponse.json({ error: 'Document is not stored locally' }, { status: 404 })
  }

  let buffer: Buffer
  let size: number | undefined
  try {
    const [content, stat] = await Promise.all([
      readFile(document.fileUrl),
      statFile(document.fileUrl),
    ])
    buffer = content
    size = stat.size
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    throw error
  }

  const encodedFileName = encodeURIComponent(document.fileName)
  return new NextResponse(new Blob([new Uint8Array(buffer)]), {
    headers: {
      'Content-Type': getContentType(document.fileName),
      'Content-Length': String(size ?? buffer.byteLength),
      'Content-Disposition': `inline; filename*=UTF-8''${encodedFileName}`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
