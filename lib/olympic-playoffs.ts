export type KnockoutPhase = "octavos" | "cuartos" | "semifinal" | "final"

export function gamesForKnockoutPhase(phase: KnockoutPhase, bestOf: Record<KnockoutPhase, number>): number {
  const games = bestOf[phase]
  if (!Number.isInteger(games) || games < 1 || games > 9) {
    throw new Error("El mejor de cada fase debe ser un número entero entre 1 y 9.")
  }
  return games
}

export function startingKnockoutPhase(teams: number): KnockoutPhase {
  if (!Number.isInteger(teams) || teams < 2 || teams > 16) {
    throw new Error("Los playoffs requieren entre 2 y 16 equipos.")
  }
  if (teams > 8) return "octavos"
  if (teams > 4) return "cuartos"
  if (teams > 2) return "semifinal"
  return "final"
}

export function seededBracket(teamIds: readonly string[]): Array<{
  index: number
  home: string
  away: string | null
}> {
  startingKnockoutPhase(teamIds.length)
  if (new Set(teamIds).size !== teamIds.length) throw new Error("Hay equipos repetidos en la clasificación.")
  const slots = 2 ** Math.ceil(Math.log2(teamIds.length))
  let seedPositions = [1, 2]
  while (seedPositions.length < slots) {
    const nextSize = seedPositions.length * 2
    seedPositions = seedPositions.flatMap((seed) => [seed, nextSize + 1 - seed])
  }
  const series = []
  for (let i = 0; i < seedPositions.length; i += 2) {
    series.push({
      index: i / 2 + 1,
      home: teamIds[seedPositions[i]! - 1]!,
      away: teamIds[seedPositions[i + 1]! - 1] ?? null,
    })
  }
  return series
}

export function readyNextRound(
  series: readonly { series_index: number; winner_team_id: string | null }[],
): Array<{ index: number; home: string; away: string }> {
  const winners = new Map(series.map((s) => [s.series_index, s.winner_team_id]))
  const next = []
  for (let index = 1; index <= Math.floor(series.length / 2); index++) {
    const home = winners.get(index * 2 - 1)
    const away = winners.get(index * 2)
    if (home && away) next.push({ index, home, away })
  }
  return next
}
