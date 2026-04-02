import { NextResponse } from 'next/server'
import { requireManager } from '@/lib/api-auth'

export async function GET() {
  const auth = await requireManager()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    id: auth.manager.id,
    email: auth.manager.email,
    name: auth.manager.name,
    role: auth.manager.role,
  })
}
