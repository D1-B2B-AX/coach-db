import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { deleteFile } from '@/lib/storage'

type RouteParams = { params: Promise<{ id: string }> }

export const runtime = 'nodejs'

// DELETE /api/documents/:id — delete a document (storage + DB)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

  // Delete DB record first, then R2 (if R2 fails, file is orphaned but DB is consistent)
  await prisma.coachDocument.delete({
    where: { id },
  })

  await deleteFile(document.fileUrl)

  return new NextResponse(null, { status: 204 })
}
