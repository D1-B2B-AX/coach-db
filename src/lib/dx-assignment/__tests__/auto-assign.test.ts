import { describe, it, expect } from 'vitest'
import { autoAssignForDate, AvailableCoach, ExistingAssignment } from '../auto-assign'

function coach(id: string, name: string, assignments = 0): AvailableCoach {
  return { id, name, currentMonthAssignments: assignments }
}

describe('autoAssignForDate', () => {
  it('assigns 2 coaches per track when supply is sufficient', () => {
    const coaches = [coach('1', 'A'), coach('2', 'B'), coach('3', 'C'), coach('4', 'D')]
    const result = autoAssignForDate(['T1', 'T2'], coaches, [])

    expect(result).toHaveLength(4)

    const t1 = result.filter((r) => r.trackName === 'T1')
    const t2 = result.filter((r) => r.trackName === 'T2')
    expect(t1).toHaveLength(2)
    expect(t2).toHaveLength(2)
  })

  it('fills constrained tracks first when supply is short', () => {
    // 3 coaches, 2 tracks => one track gets 2, the other gets 1
    // Both tracks start with 3 candidates each, but after greedy the second gets fewer
    const coaches = [coach('1', 'A'), coach('2', 'B'), coach('3', 'C')]
    const result = autoAssignForDate(['T1', 'T2'], coaches, [])

    expect(result).toHaveLength(3)
    const t1 = result.filter((r) => r.trackName === 'T1')
    const t2 = result.filter((r) => r.trackName === 'T2')
    // One track gets 2, the other gets 1
    expect([t1.length, t2.length].sort()).toEqual([1, 2])
  })

  it('enforces one-track-per-day constraint (cross-application)', () => {
    // 3 coaches, 2 tracks: first track fills 2, those coaches are removed from pool
    // so the second track can only use the remaining 1 coach
    const coaches = [coach('1', 'A'), coach('2', 'B'), coach('3', 'C')]
    const result = autoAssignForDate(['T1', 'T2'], coaches, [])

    expect(result).toHaveLength(3)
    // Each coach appears at most once (one-track-per-day)
    const coachIds = result.map((r) => r.coachId)
    expect(new Set(coachIds).size).toBe(3)

    // Verify no coach is assigned to multiple tracks
    const coachToTracks = new Map<string, string[]>()
    for (const r of result) {
      const tracks = coachToTracks.get(r.coachId) ?? []
      tracks.push(r.trackName)
      coachToTracks.set(r.coachId, tracks)
    }
    for (const [, tracks] of coachToTracks) {
      expect(tracks).toHaveLength(1)
    }
  })

  it('preserves manual assignments and excludes those coaches', () => {
    const coaches = [coach('1', 'A'), coach('2', 'B'), coach('3', 'C')]
    const existing: ExistingAssignment[] = [
      { trackName: 'T1', coachId: '1', isAuto: false },
    ]
    const result = autoAssignForDate(['T1', 'T2'], coaches, existing)

    // Coach 1 is manually assigned to T1 (counts as 1 filled slot)
    // Auto should fill T1 with 1 more, T2 with 2
    // But coach 1 is excluded from pool, so only coaches 2 and 3 remain
    // T1 needs 1 more, T2 needs 2 => total need 3, only 2 available
    expect(result.every((r) => r.coachId !== '1')).toBe(true)

    const t1Auto = result.filter((r) => r.trackName === 'T1')
    const t2Auto = result.filter((r) => r.trackName === 'T2')
    // T1 already has 1, needs 1 more => gets 1 auto
    // T2 needs 2, but only 1 coach left after T1 gets one
    expect(t1Auto).toHaveLength(1)
    expect(t2Auto).toHaveLength(1)
  })

  it('returns empty array when no coaches are available', () => {
    const result = autoAssignForDate(['T1', 'T2'], [], [])
    expect(result).toEqual([])
  })

  it('prefers coaches with fewer monthly assignments', () => {
    const coaches = [
      coach('1', 'A', 2),
      coach('2', 'B', 0),
      coach('3', 'C', 1),
    ]
    const result = autoAssignForDate(['T1'], coaches, [])

    expect(result).toHaveLength(2)
    // Should pick B (0) and C (1) over A (2)
    expect(result.map((r) => r.coachId).sort()).toEqual(['2', '3'])
  })

  it('breaks ties by name in alphabetical order', () => {
    const coaches = [
      coach('1', 'Charlie', 0),
      coach('2', 'Alice', 0),
      coach('3', 'Bob', 0),
    ]
    const result = autoAssignForDate(['T1'], coaches, [], 2)

    expect(result).toHaveLength(2)
    // Alice and Bob should be picked (alphabetical first two)
    expect(result[0].coachId).toBe('2') // Alice
    expect(result[1].coachId).toBe('3') // Bob
  })
})
