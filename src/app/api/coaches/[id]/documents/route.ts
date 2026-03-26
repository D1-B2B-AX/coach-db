import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { uploadFile } from '@/lib/r2'

type RouteParams = { params: Promise<{ id: string }> }

const VALID_FILE_TYPES = ['resume', 'portfolio', 'certificate'] as const
type FileType = (typeof VALID_FILE_TYPES)[number]

// GET /api/coaches/:id/documents — list all documents for a coach
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Verify coach exists
  const coach = await prisma.coach.findUnique({
    where: { id, deletedAt: null },
    select: { id: true },
  })
  if (!coach) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
  }

  const documents = await prisma.coachDocument.findMany({
    where: { coachId: id },
    orderBy: { uploadedAt: 'desc' },
  })

  return NextResponse.json({ documents })
}

// POST /api/coaches/:id/documents — upload a document
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Verify coach exists
  const coach = await prisma.coach.findUnique({
    where: { id, deletedAt: null },
    select: { id: true },
  })
  if (!coach) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  const fileType = formData.get('fileType') as string | null

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  if (!fileType || !VALID_FILE_TYPES.includes(fileType as FileType)) {
    return NextResponse.json(
      { error: `fileType must be one of: ${VALID_FILE_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  // Read file content
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Generate R2 key
  const key = `coaches/${id}/${randomUUID()}-${file.name}`

  // Upload to R2
  const fileUrl = await uploadFile(key, buffer, file.type || 'application/octet-stream')

  // Save metadata in DB
  const document = await prisma.coachDocument.create({
    data: {
      coachId: id,
      fileUrl,
      fileName: file.name,
      fileType: fileType as FileType,
    },
  })

  return NextResponse.json(document, { status: 201 })
}
