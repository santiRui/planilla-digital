export type ZoneStanding = {
  teamId: string
  points: number
  pointsFor: number
  pointsAgainst: number
}

export type ZoneMatch = {
  homeTeamId: string
  awayTeamId: string
  homeScore?: number | null
  awayScore?: number | null
  status: string
}

export function sortOlympicStandings<T extends ZoneStanding>(rows: readonly T[], matches: readonly ZoneMatch[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points
    let directDiff = 0
    let played = 0
    for (const match of matches) {
      if (match.status !== "finalizado" || match.homeScore == null || match.awayScore == null) continue
      if (!((match.homeTeamId === a.teamId && match.awayTeamId === b.teamId) ||
        (match.homeTeamId === b.teamId && match.awayTeamId === a.teamId))) continue
      directDiff += match.homeTeamId === a.teamId
        ? match.homeScore - match.awayScore
        : match.awayScore - match.homeScore
      played++
    }
    if (played && directDiff) return directDiff > 0 ? -1 : 1
    const diff = (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
    return diff || b.pointsFor - a.pointsFor || a.teamId.localeCompare(b.teamId)
  })
}

export function splitOlympicZones<T extends ZoneStanding>(
  zones: readonly (readonly T[])[],
  totalWinners: number,
  matches: readonly ZoneMatch[],
): { winners: T[]; losers: T[]; perZone: number[] } {
  if (zones.length !== 2 || !Number.isInteger(totalWinners) || totalWinners < 1 ||
      totalWinners >= zones[0]!.length + zones[1]!.length) {
    throw new Error("La clasificación requiere dos zonas y deja equipos en ambas fases.")
  }
  const sorted = zones.map((zone) => sortOlympicStandings(zone, matches))
  const base = Math.floor(totalWinners / 2)
  if (sorted.some((zone) => zone.length < base)) throw new Error("No hay suficientes equipos en cada zona.")
  const perZone = [base, base]
  if (totalWinners % 2) {
    const candidates = sorted.map((zone) => zone[base])
    if (!candidates[0] && !candidates[1]) throw new Error("No hay equipo para el cupo adicional.")
    const best = !candidates[1] ? 0 : !candidates[0] ? 1 :
      sortOlympicStandings([candidates[0], candidates[1]], matches)[0] === candidates[0] ? 0 : 1
    perZone[best]!++
  }
  const winners = sorted.flatMap((zone, i) => zone.slice(0, perZone[i]))
  const losers = sorted.flatMap((zone, i) => zone.slice(perZone[i]))
  return {
    winners: sortOlympicStandings(winners, matches),
    losers: sortOlympicStandings(losers, matches),
    perZone,
  }
}

export function selectOlympicPlayoffTeams<T extends ZoneStanding>(
  winners: readonly T[],
  losers: readonly T[],
  fromWinners: number,
  fromLosers: number,
): T[] {
  const total = fromWinners + fromLosers
  if (!Number.isInteger(fromWinners) || !Number.isInteger(fromLosers) ||
      fromWinners < 0 || fromLosers < 0 || fromWinners > winners.length ||
      fromLosers > losers.length || total < 2 || total > 16) {
    throw new Error("Elegí entre 2 y 16 clasificados sin superar los equipos disponibles en cada zona.")
  }
  return [...winners.slice(0, fromWinners), ...losers.slice(0, fromLosers)]
}

export function matchPairKey(home: string, away: string): string {
  return [home, away].sort().join(":")
}

export function unplayedCrossZonePairs(
  aIds: readonly string[],
  bIds: readonly string[],
  playedPairs: ReadonlySet<string>,
): { home: string; away: string; round: number }[] {
  const rounds = Math.max(aIds.length, bIds.length)
  return aIds.flatMap((home, i) =>
    bIds.flatMap((away, j) =>
      home !== away && !playedPairs.has(matchPairKey(home, away))
        ? [{ home, away, round: ((i + j) % rounds) + 1 }]
        : [],
    ),
  )
}
