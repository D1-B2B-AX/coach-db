import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { normalizeWorkTypeString } from '../src/lib/work-type'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

function cleanSelfNote(raw: string | null): string | null {
  if (!raw) return null
  const cleaned = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\[(희망 교육 형태|교육 경력|기타 요청)\]/.test(line))
    .filter((line) => !/^시급 이력:/.test(line))
    .join('\n')
    .trim()
  return cleaned || null
}

async function main() {
  const coaches = await prisma.coach.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, workType: true, selfNote: true },
  })

  let workTypeUpdated = 0
  let selfNoteUpdated = 0
  let bothUpdated = 0

  for (const coach of coaches) {
    const normalizedWorkType = normalizeWorkTypeString(coach.workType)
    const cleanedSelfNote = cleanSelfNote(coach.selfNote)

    const workTypeChanged = normalizedWorkType !== (coach.workType ?? null)
    const selfNoteChanged = cleanedSelfNote !== (coach.selfNote ?? null)
    if (!workTypeChanged && !selfNoteChanged) continue

    await prisma.coach.update({
      where: { id: coach.id },
      data: {
        ...(workTypeChanged ? { workType: normalizedWorkType } : {}),
        ...(selfNoteChanged ? { selfNote: cleanedSelfNote } : {}),
      },
    })

    if (workTypeChanged) workTypeUpdated++
    if (selfNoteChanged) selfNoteUpdated++
    if (workTypeChanged && selfNoteChanged) bothUpdated++
    console.log(`✓ ${coach.name}${workTypeChanged ? ' [workType]' : ''}${selfNoteChanged ? ' [selfNote]' : ''}`)
  }

  console.log(`\n완료: workType ${workTypeUpdated}명, selfNote ${selfNoteUpdated}명 (동시 ${bothUpdated}명)`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
