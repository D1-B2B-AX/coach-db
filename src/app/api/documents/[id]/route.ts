import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { deleteFile, getKeyFromUrl } from '@/lib/r2'

type RouteParams = { params: Promise<{ id: string }> }

// DELETE /api/documents/:id — delete a document (R2 + DB)
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

  // Delete file from R2
  const key = getKeyFromUrl(document.fileUrl)
  await deleteFile(key)

  // Delete DB record
  await prisma.coachDocument.delete({
    where: { id },
  })

  return new NextResponse(null, { status: 204 })
}
