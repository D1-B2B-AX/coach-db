export interface AvailableCoach {
  id: string
  name: string
  currentMonthAssignments: number
}

export interface ExistingAssignment {
  trackName: string
  coachId: string
  isAuto: boolean
}

export interface AssignmentResult {
  trackName: string
  coachId: string
}

const DEFAULT_MAX_PER_TRACK = 2

export function autoAssignForDate(
  trackNames: string[],
  availableCoaches: AvailableCoach[],
  existingAssignments: ExistingAssignment[],
  maxPerTrack: number = DEFAULT_MAX_PER_TRACK,
): AssignmentResult[] {
  const pool = new Map<string, AvailableCoach>()
  for (const coach of availableCoaches) {
    pool.set(coach.id, coach)
  }

  // Track how many slots are already filled per track
  const filledPerTrack = new Map<string, number>()
  for (const tn of trackNames) {
    filledPerTrack.set(tn, 0)
  }

  // Preserve manual assignments; remove those coaches from pool
  for (const ea of existingAssignments) {
    if (!ea.isAuto) {
      pool.delete(ea.coachId)
    }
    // Count all existing assignments toward filled slots
    const current = filledPerTrack.get(ea.trackName) ?? 0
    filledPerTrack.set(ea.trackName, current + 1)
  }

  // Also remove coaches who already have any assignment for this date (auto or manual)
  const assignedCoachIds = existingAssignments.map((ea) => ea.coachId)
  for (const id of assignedCoachIds) {
    pool.delete(id)
  }

  // Build candidate lists per track (all remaining pool coaches qualify for any track)
  const candidatesPerTrack = new Map<string, Set<string>>()
  for (const tn of trackNames) {
    candidatesPerTrack.set(tn, new Set(Array.from(pool.keys())))
  }

  // Sort tracks: fewest candidates first, then alphabetical
  const sortedTracks = [...trackNames].sort((a, b) => {
    const ca = candidatesPerTrack.get(a)!.size
    const cb = candidatesPerTrack.get(b)!.size
    if (ca !== cb) return ca - cb
    return a.localeCompare(b)
  })

  const results: AssignmentResult[] = []

  for (const track of sortedTracks) {
    const remaining = maxPerTrack - (filledPerTrack.get(track) ?? 0)
    if (remaining <= 0) continue

    const candidates = Array.from(candidatesPerTrack.get(track)!)
      .map((id) => pool.get(id)!)
      .filter(Boolean)
      .sort((a, b) => {
        if (a.currentMonthAssignments !== b.currentMonthAssignments) {
          return a.currentMonthAssignments - b.currentMonthAssignments
        }
        return a.name.localeCompare(b.name)
      })

    const picked = candidates.slice(0, remaining)

    for (const coach of picked) {
      results.push({ trackName: track, coachId: coach.id })
      // Cross-constraint: remove from pool so coach can't be assigned to another track
      pool.delete(coach.id)
      Array.from(candidatesPerTrack.values()).forEach((cSet) => {
        cSet.delete(coach.id)
      })
    }
  }

  return results
}
