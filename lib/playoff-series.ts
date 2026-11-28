export const SERIES_RESOLVED_REASON = "serie_definida"

type FinishedGame = {
  status: string
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
}

export function seriesResult(
  series: { home_team_id: string; away_team_id: string; best_of: number },
  games: readonly FinishedGame[],
) {
  const { home_team_id: homeId, away_team_id: awayId, best_of: bestOf } = series
  if (!Number.isInteger(bestOf) || bestOf < 1) throw new Error("El mejor de la serie no es valido.")

  let homeWins = 0
  let awayWins = 0
  let diff = 0
  let finishedGames = 0

  for (const game of games) {
    if (game.status !== "finalizado") continue
    if (game.home_score == null || game.away_score == null) continue
    if (![homeId, awayId].includes(game.home_team_id) || ![homeId, awayId].includes(game.away_team_id)) {
      throw new Error("Un partido finalizado no pertenece a los equipos de la serie.")
    }
    if (game.home_score === game.away_score) {
      throw new Error("Un partido de playoffs finalizado no puede terminar empatado.")
    }
    finishedGames++
    const homeScore = game.home_team_id === homeId ? game.home_score : game.away_score
    const awayScore = game.home_team_id === homeId ? game.away_score : game.home_score
    diff += homeScore - awayScore
    if (homeScore > awayScore) homeWins++
    else awayWins++
  }

  const needed = Math.floor(bestOf / 2) + 1
  const winner = homeWins >= needed ? homeId : awayWins >= needed ? awayId : null
  return { homeWins, awayWins, diff, finishedGames, winner, allPlayed: finishedGames >= bestOf }
}

export function normalNextMatchups(
  phase: "cuartos" | "semifinal",
  series: readonly { series_index: number; winner_team_id: string | null }[],
  existingIndices: ReadonlySet<number>,
) {
  const winners = new Map(series.map((row) => [row.series_index, row.winner_team_id]))
  const pairs = phase === "cuartos" && series.length === 4
    ? [[1, 4, 1], [2, 3, 2]]
    : phase === "semifinal" && series.length === 2 ? [[1, 2, 1]] : []
  return pairs.flatMap(([left, right, index]) => {
    if (existingIndices.has(index)) return []
    const home = winners.get(left)
    const away = winners.get(right)
    return home && away ? [{ index, home, away }] : []
  })
}

export function normalOpeningSeries(teamIds: readonly string[], slots: 2 | 4 | 8) {
  if (new Set(teamIds).size !== teamIds.length ||
      teamIds.length > slots || teamIds.length <= slots / 2) {
    throw new Error(`Se necesitan entre ${slots / 2 + 1} y ${slots} equipos para esta fase.`)
  }
  return Array.from({ length: slots / 2 }, (_, index) => {
    const home = teamIds[index]!
    const away = teamIds[slots - index - 1] ?? null
    return { home, away, winnerPreset: away ? null : home, seriesIndex: index + 1 }
  })
}
