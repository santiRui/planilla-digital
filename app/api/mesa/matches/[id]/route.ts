import { NextResponse } from "next/server"
import { z } from "zod"
import crypto from "crypto"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const updateResultSchema = z.object({
  status: z.enum(["programado", "en_juego", "finalizado", "suspendido", "demorado"]).optional(),
  homeScore: z.number().int().min(0).optional(),
  awayScore: z.number().int().min(0).optional(),
  statusReason: z.string().max(500).optional(),
})

type Phase = "cuartos" | "semifinal" | "final"

type TiebreakMode = "olimpico_sorteo" | "olimpico_sin_sorteo" | "labas"

type MatchRow = {
  id: string
  tournament_id: string
  phase: string
  status: string
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  playoff_series_id: string | null
  series_game_number: number | null
}

type SeriesRow = {
  id: string
  tournament_id: string
  phase: Phase
  series_index: number
  home_team_id: string
  away_team_id: string
  best_of: number
  winner_team_id: string | null
  tiebreak_applied: string | null
  random_winner_team_id: string | null
}

async function assertMesaRole(accessToken: string, matchId: string) {
  const adminClient = createSupabaseAdminClient()
  const userClient = createSupabaseServerClient(accessToken)

  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false as const, status: 401, error: "No autorizado" }
  }

  const callerId = userData.user.id

  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .maybeSingle()

  if (callerProfileError) {
    return { ok: false as const, status: 400, error: callerProfileError.message }
  }

  const role = (callerProfile?.role as string | undefined) ?? ""
  if (role === "admin") {
    return { ok: true as const, adminClient, callerId, role }
  }

  if (role !== "arbitro" && role !== "oficial_mesa") {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  return { ok: true as const, adminClient, callerId, role }
}

async function assertAssignedToMatch(
  adminClient: ReturnType<typeof createSupabaseAdminClient>,
  matchId: string,
  userId: string,
  role: "arbitro" | "oficial_mesa",
) {
  const { data: assignment, error: assignmentError } = await adminClient
    .from("match_official_assignments")
    .select("id")
    .eq("match_id", matchId)
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle()

  if (assignmentError) {
    return { ok: false as const, status: 400, error: assignmentError.message }
  }

  if (!assignment) {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  return { ok: true as const }
}

function nextPhaseFromCurrent(phase: Phase): Phase | null {
  if (phase === "cuartos") return "semifinal"
  if (phase === "semifinal") return "final"
  return null
}

function isPhaseValue(phase: string): phase is Phase {
  return phase === "cuartos" || phase === "semifinal" || phase === "final"
}

type MatchLite = {
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  status_reason?: string | null
}

type StandingRow = {
  teamId: string
  played: number
  won: number
  lost: number
  pointsFor: number
  pointsAgainst: number
  points: number
  np: number
}

function computeStandings(teamIds: string[], finalMatches: MatchLite[]): StandingRow[] {
  const rows = new Map<string, StandingRow>()
  for (const id of teamIds) {
    rows.set(id, {
      teamId: id,
      played: 0,
      won: 0,
      lost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      points: 0,
      np: 0,
    })
  }

  for (const m of finalMatches) {
    if (!rows.has(m.home_team_id) || !rows.has(m.away_team_id)) continue
    if (m.home_score == null || m.away_score == null) continue

    const home = rows.get(m.home_team_id)!
    const away = rows.get(m.away_team_id)!

    home.played += 1
    away.played += 1

    home.pointsFor += m.home_score
    home.pointsAgainst += m.away_score

    away.pointsFor += m.away_score
    away.pointsAgainst += m.home_score

    const reason = ((m as any).status_reason as string | null | undefined) ?? null
    const isNoShow = !!reason && reason.startsWith("no_presentacion:")
    const absent = isNoShow ? (reason.split(":")[1] as "home" | "away" | undefined) : undefined

    const homeAbsent = isNoShow && absent === "home"
    const awayAbsent = isNoShow && absent === "away"

    if (m.home_score > m.away_score) {
      home.won += 1
      home.points += 2
      if (awayAbsent) {
        away.np += 1
      } else {
        away.lost += 1
        away.points += 1
      }
    } else {
      away.won += 1
      away.points += 2
      if (homeAbsent) {
        home.np += 1
      } else {
        home.lost += 1
        home.points += 1
      }
    }
  }

  const list = Array.from(rows.values())

  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (a.np !== b.np) return a.np - b.np
    const aDiff = a.pointsFor - a.pointsAgainst
    const bDiff = b.pointsFor - b.pointsAgainst
    if (bDiff !== aDiff) return bDiff - aDiff
    return b.pointsFor - a.pointsFor
  })

  return list
}

async function resolveSeriesAndMaybeAdvance(adminClient: ReturnType<typeof createSupabaseAdminClient>, match: MatchRow) {
  if (!match.playoff_series_id) return
  if (!isPhaseValue(match.phase)) return
  if (match.status !== "finalizado") return

  const seriesId = match.playoff_series_id

  const { data: series, error: seriesError } = await adminClient
    .from("playoff_series")
    .select(
      "id, tournament_id, phase, series_index, home_team_id, away_team_id, best_of, winner_team_id, tiebreak_applied, random_winner_team_id",
    )
    .eq("id", seriesId)
    .single()

  if (seriesError || !series) return

  if ((series as any).winner_team_id) {
    await maybeAdvancePhase(adminClient, series as any)
    return
  }

  const { data: seriesMatches, error: seriesMatchesError } = await adminClient
    .from("matches")
    .select("home_team_id, away_team_id, home_score, away_score, status")
    .eq("playoff_series_id", seriesId)
    .order("series_game_number", { ascending: true })

  if (seriesMatchesError) return

  const bestOf = Number((series as any).best_of)
  const finals = (seriesMatches ?? []).filter((m: any) => m.status === "finalizado") as Array<{
    home_team_id: string
    away_team_id: string
    home_score: number | null
    away_score: number | null
  }>

  const homeTeamId = (series as any).home_team_id as string
  const awayTeamId = (series as any).away_team_id as string

  let homeWins = 0
  let awayWins = 0
  let diff = 0

  for (const m of finals) {
    if (m.home_score == null || m.away_score == null) continue

    const homeIsHome = m.home_team_id === homeTeamId
    const scoreHome = homeIsHome ? m.home_score : m.away_score
    const scoreAway = homeIsHome ? m.away_score : m.home_score

    diff += scoreHome - scoreAway

    if (scoreHome > scoreAway) homeWins += 1
    else awayWins += 1
  }

  const needed = Math.floor(bestOf / 2) + 1

  let winner: string | null = null
  let tiebreakApplied: string | null = null
  let randomWinnerToPersist: string | null = null

  if (homeWins >= needed) {
    winner = homeTeamId
    tiebreakApplied = "wins"
  } else if (awayWins >= needed) {
    winner = awayTeamId
    tiebreakApplied = "wins"
  } else if (finals.length === bestOf && bestOf % 2 === 0) {
    if (diff !== 0) {
      winner = diff > 0 ? homeTeamId : awayTeamId
      tiebreakApplied = "diff_series"
    } else {
      const { data: config } = await adminClient
        .from("tournament_playoff_config")
        .select("tiebreak_mode")
        .eq("tournament_id", (series as any).tournament_id)
        .maybeSingle()

      const mode = (config as any)?.tiebreak_mode as TiebreakMode | undefined

      const { data: regularMatches } = await adminClient
        .from("matches")
        .select("home_team_id, away_team_id, home_score, away_score")
        .eq("tournament_id", (series as any).tournament_id)
        .eq("phase", "fase_regular")
        .eq("status", "finalizado")

      const regular = (regularMatches ?? []) as MatchLite[]

      const avgPoints = (teamId: string) => {
        let pf = 0
        let games = 0
        for (const m of regular) {
          if (m.home_score == null || m.away_score == null) continue
          if (m.home_team_id === teamId) {
            pf += m.home_score
            games += 1
          } else if (m.away_team_id === teamId) {
            pf += m.away_score
            games += 1
          }
        }
        return games > 0 ? pf / games : 0
      }

      const avgHome = avgPoints(homeTeamId)
      const avgAway = avgPoints(awayTeamId)

      const seedWinner = async () => {
        const { data: teamRows } = await adminClient
          .from("team_categories")
          .select("team_id")
          .eq("category_id", (await adminClient.from("tournaments").select("category_id").eq("id", (series as any).tournament_id).single()).data?.category_id)

        const teamIds = Array.from(new Set((teamRows ?? []).map((r: any) => r.team_id).filter(Boolean))) as string[]
        const standings = computeStandings(teamIds, regular)
        const pos = new Map<string, number>()
        standings.forEach((s, idx) => pos.set(s.teamId, idx + 1))
        const pHome = pos.get(homeTeamId) ?? 9999
        const pAway = pos.get(awayTeamId) ?? 9999
        return pHome <= pAway ? homeTeamId : awayTeamId
      }

      if (mode === "labas") {
        winner = await seedWinner()
        tiebreakApplied = "seed_table"
      } else {
        if (avgHome !== avgAway) {
          winner = avgHome > avgAway ? homeTeamId : awayTeamId
          tiebreakApplied = "avg_regular"
        } else if (mode === "olimpico_sin_sorteo") {
          winner = await seedWinner()
          tiebreakApplied = "seed_table"
        } else {
          const persisted = (series as any).random_winner_team_id as string | null
          if (persisted) {
            winner = persisted
            tiebreakApplied = "random_persisted"
          } else {
            winner = crypto.randomInt(0, 2) === 0 ? homeTeamId : awayTeamId
            randomWinnerToPersist = winner
            tiebreakApplied = "random"
          }
        }
      }
    }
  }

  if (!winner) return

  const update: any = {
    winner_team_id: winner,
    tiebreak_applied: tiebreakApplied,
  }

  if (randomWinnerToPersist) {
    update.random_winner_team_id = randomWinnerToPersist
  }

  const { error: updateSeriesError } = await adminClient.from("playoff_series").update(update).eq("id", seriesId)
  if (updateSeriesError) return

  await maybeAdvancePhase(adminClient, {
    ...(series as any),
    winner_team_id: winner,
  })
}

async function maybeAdvancePhase(adminClient: ReturnType<typeof createSupabaseAdminClient>, series: SeriesRow) {
  const phase = series.phase
  const next = nextPhaseFromCurrent(phase)
  if (!next) return

  const { data: allSeries, error: allSeriesError } = await adminClient
    .from("playoff_series")
    .select("id, series_index, winner_team_id")
    .eq("tournament_id", series.tournament_id)
    .eq("phase", phase)
    .order("series_index", { ascending: true })

  if (allSeriesError) return

  const list = (allSeries ?? []) as Array<{ series_index: number; winner_team_id: string | null }>
  if (list.length === 0) return
  
  // Para cuartos -> semifinales queremos permitir avanzar por lado de llave:
  // se genera la semifinal 1 (ganador serie 1 vs ganador serie 4) cuando
  // ambas series tienen ganador, aunque las series 2 y 3 sigan en juego, y
  // viceversa para la semifinal 2 (ganador serie 2 vs ganador serie 3).
  // Para otras transiciones (por ejemplo semifinal -> final) seguimos
  // requiriendo que todas las series de la fase actual tengan ganador.

  const { data: existingNext } = await adminClient
    .from("playoff_series")
    .select("id, series_index")
    .eq("tournament_id", series.tournament_id)
    .eq("phase", next)

  const existingNextIndices = new Set<number>((existingNext ?? []).map((r: any) => Number(r.series_index)))

  const { data: config } = await adminClient
    .from("tournament_playoff_config")
    .select("best_of_cuartos, best_of_semifinal, best_of_final")
    .eq("tournament_id", series.tournament_id)
    .maybeSingle()

  const bestOf =
    next === "cuartos"
      ? Number((config as any)?.best_of_cuartos ?? 1)
      : next === "semifinal"
        ? Number((config as any)?.best_of_semifinal ?? 1)
        : Number((config as any)?.best_of_final ?? 1)

  const nextMatchups: Array<{ home: string; away: string; index: number }> = []

  if (phase === "cuartos" && next === "semifinal") {
    // Para cuartos podemos tener 2 o 4 series.
    const byIndex = new Map<number, string>()
    for (const s of list) {
      if (s.winner_team_id) {
        byIndex.set(Number(s.series_index), s.winner_team_id)
      }
    }

    const indices = Array.from(byIndex.keys()).sort((a, b) => a - b)

    if (indices.length === 2) {
      // Caso 2 series: semifinal única entre serie 1 y 2.
      const i1 = indices[0]
      const i2 = indices[1]
      const w1 = byIndex.get(i1)!
      const w2 = byIndex.get(i2)!
      if (w1 && w2 && !existingNextIndices.has(1)) {
        nextMatchups.push({ home: w1, away: w2, index: 1 })
      }
    } else if (indices.length === 3) {
      // Caso especial: 3 series de cuartos + 1 equipo libre (semilla 1).
      // - Semifinal 1: ganador serie 1 vs ganador serie 2 (lado "2-3").
      // - Semifinal 2: semilla 1 (bye) vs ganador serie 3 (lado "1-4/5").

      const w1 = byIndex.get(1)
      const w2 = byIndex.get(2)
      const w3 = byIndex.get(3)

      // Semifinal entre ganadores de series 1 y 2 (no depende de la serie 3).
      if (w1 && w2 && !existingNextIndices.has(1)) {
        nextMatchups.push({ home: w1, away: w2, index: 1 })
      }

      // Para armar la otra semifinal necesitamos conocer al equipo libre (semilla 1).
      if (w3 && !existingNextIndices.has(2)) {
        // Calculamos la tabla de fase regular y tomamos la primera posición
        // como semilla 1 (equipo que quedó "Libre" en cuartos).
        const { data: tournamentRow } = await adminClient
          .from("tournaments")
          .select("category_id")
          .eq("id", series.tournament_id)
          .maybeSingle()

        const categoryId = (tournamentRow as any)?.category_id as string | null

        let topSeedId: string | null = null

        if (categoryId) {
          const { data: teamRows } = await adminClient
            .from("team_categories")
            .select("team_id")
            .eq("category_id", categoryId)

          const teamIds = Array.from(new Set((teamRows ?? []).map((r: any) => r.team_id).filter(Boolean))) as string[]

          const { data: regularMatches } = await adminClient
            .from("matches")
            .select("home_team_id, away_team_id, home_score, away_score, status_reason")
            .eq("tournament_id", series.tournament_id)
            .eq("phase", "fase_regular")
            .eq("status", "finalizado")

          const regular = (regularMatches ?? []) as MatchLite[]
          const standings = computeStandings(teamIds, regular)
          if (standings.length > 0) {
            topSeedId = standings[0]!.teamId
          }
        }

        if (topSeedId) {
          nextMatchups.push({ home: topSeedId, away: w3, index: 2 })
        }
      }
    } else {
      // Caso clásico 4 series (u otro número par >=4): semifinal 1 = 1 vs último,
      // semifinal 2 = 2 vs anteúltimo, etc.
      const sortedIndices = indices.slice().sort((a, b) => a - b)
      const half = Math.floor(sortedIndices.length / 2)
      for (let i = 0; i < half; i += 1) {
        const left = sortedIndices[i]
        const right = sortedIndices[sortedIndices.length - 1 - i]
        const wLeft = byIndex.get(left)
        const wRight = byIndex.get(right)
        const targetIndex = i + 1
        if (wLeft && wRight && !existingNextIndices.has(targetIndex)) {
          nextMatchups.push({ home: wLeft, away: wRight, index: targetIndex })
        }
      }
    }
  } else {
    // Comportamiento genérico: solo avanzamos si TODAS las series
    // tienen ganador (por ejemplo, para semifinal -> final).
    if (list.some((s) => !s.winner_team_id)) return

    const winners = list.map((s) => s.winner_team_id!).filter(Boolean)
    const half = winners.length / 2
    for (let i = 0; i < half; i += 1) {
      const idx = i + 1
      if (existingNextIndices.has(idx)) continue
      nextMatchups.push({ home: winners[i]!, away: winners[winners.length - 1 - i]!, index: idx })
    }
  }

  if (nextMatchups.length === 0) return

  const seriesRows = nextMatchups.map((m) => ({
    tournament_id: series.tournament_id,
    phase: next,
    series_index: m.index,
    home_team_id: m.home,
    away_team_id: m.away,
    best_of: bestOf,
    winner_team_id: null,
    tiebreak_applied: null,
    random_winner_team_id: null,
  }))

  const { data: insertedSeries, error: insertSeriesError } = await adminClient
    .from("playoff_series")
    .insert(seriesRows)
    .select("id, series_index, home_team_id, away_team_id")
    .order("series_index", { ascending: true })

  if (insertSeriesError) return

  const seriesList = (insertedSeries ?? []) as Array<{
    id: string
    series_index: number
    home_team_id: string
    away_team_id: string
  }>

  const matchesToInsert = seriesList.flatMap((s) => {
    const rows: any[] = []
    for (let game = 1; game <= bestOf; game += 1) {
      const isEven = game % 2 === 0
      const homeTeamId = isEven ? s.away_team_id : s.home_team_id
      const awayTeamId = isEven ? s.home_team_id : s.away_team_id
      rows.push({
        tournament_id: series.tournament_id,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        round: 1,
        phase: next,
        status: "programado",
        scheduled_at: null,
        venue_id: null,
        court_id: null,
        home_score: null,
        away_score: null,
        playoff_series_id: s.id,
        series_game_number: game,
      })
    }
    return rows
  })

  await adminClient.from("matches").insert(matchesToInsert)
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params

    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertMesaRole(accessToken, id)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => null)
    const parsed = updateResultSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { data: existing, error: existingError } = await auth.adminClient
      .from("matches")
      .select(
        "id, tournament_id, phase, status, home_team_id, away_team_id, home_score, away_score, playoff_series_id, series_game_number, started_at, finished_at",
      )
      .eq("id", id)
      .single()

    if (existingError || !existing) {
      return NextResponse.json({ error: existingError?.message ?? "Partido no encontrado" }, { status: 404 })
    }

    const update: any = {}
    if (parsed.data.status) update.status = parsed.data.status
    if (parsed.data.homeScore !== undefined) update.home_score = parsed.data.homeScore
    if (parsed.data.awayScore !== undefined) update.away_score = parsed.data.awayScore
    if (parsed.data.statusReason !== undefined) update.status_reason = parsed.data.statusReason

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ match: existing })
    }

    const requestedStatus = parsed.data.status
    const nextHomeScore = parsed.data.homeScore
    const nextAwayScore = parsed.data.awayScore

    // Para partidos finalizados, el resultado oficial (matches.home_score/away_score)
    // debe coincidir con los puntos sumados por jugador en match_player_stats_planilla.
    // Si existen estadísticas para el partido, priorizamos esos totales por encima
    // del score enviado por la mesa (que puede haberse desincronizado).
    const shouldAlignResultWithPlanillaStats =
      requestedStatus === "finalizado" ||
      (existing.status === "finalizado" &&
        (parsed.data.homeScore !== undefined || parsed.data.awayScore !== undefined || parsed.data.statusReason !== undefined))

    if (shouldAlignResultWithPlanillaStats) {
      const { data: statsRows, error: statsError } = await auth.adminClient
        .from("match_player_stats_planilla")
        .select("team_id, points")
        .eq("match_id", id)

      if (!statsError && Array.isArray(statsRows) && statsRows.length > 0) {
        let homePts = 0
        let awayPts = 0
        for (const row of statsRows as any[]) {
          const teamId = String(row.team_id)
          const pts = typeof row.points === "number" ? row.points : 0
          if (teamId === String(existing.home_team_id)) homePts += pts
          if (teamId === String(existing.away_team_id)) awayPts += pts
        }

        update.home_score = homePts
        update.away_score = awayPts
      }
    }

    if (auth.role !== "admin") {
      if (requestedStatus === "en_juego") {
        if (auth.role !== "arbitro") {
          return NextResponse.json({ error: "Prohibido" }, { status: 403 })
        }

        const ok = await assertAssignedToMatch(auth.adminClient, id, auth.callerId, "arbitro")
        if (!ok.ok) {
          return NextResponse.json({ error: ok.error }, { status: ok.status })
        }
      } else if (
        requestedStatus === "finalizado" ||
        requestedStatus === "suspendido" ||
        requestedStatus === "demorado" ||
        nextHomeScore != null ||
        nextAwayScore != null
      ) {
        const okMesa = await assertAssignedToMatch(auth.adminClient, id, auth.callerId, "oficial_mesa")
        if (!okMesa.ok) {
          return NextResponse.json({ error: okMesa.error }, { status: okMesa.status })
        }
      }
    }

    // Si se está marcando como finalizado, registramos hora de finalización si aún no existe.
    if (requestedStatus === "finalizado" && !existing.finished_at) {
      update.finished_at = new Date().toISOString()
    }

    const { data: updated, error: updateError } = await auth.adminClient
      .from("matches")
      .update(update)
      .eq("id", id)
      .select(
        "id, tournament_id, phase, status, home_team_id, away_team_id, home_score, away_score, playoff_series_id, series_game_number, started_at, finished_at",
      )
      .single()

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "No se pudo actualizar" }, { status: 400 })
    }

    if (auth.role === "admin" || auth.role === "oficial_mesa") {
      await resolveSeriesAndMaybeAdvance(auth.adminClient, updated as any)
    }

    return NextResponse.json({ match: updated })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("PATCH /api/mesa/matches/[id] failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
