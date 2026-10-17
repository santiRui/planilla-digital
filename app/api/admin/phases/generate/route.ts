import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const generatePhaseSchema = z.object({
  tournamentId: z.string().min(1),
  phase: z.enum(["playoff", "cuartos", "semifinal", "final"]).optional(),
  teamsToQualify: z.number().int().min(2).max(16).optional(),
})

type Phase = "cuartos" | "semifinal" | "final"
type TiebreakMode = "olimpico_sorteo" | "olimpico_sin_sorteo" | "labas"

type StandingRow = {
  teamId: string
  played: number
  won: number
  lost: number
  np: number
  pointsFor: number
  pointsAgainst: number
  points: number
}

type MatchLite = {
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  phase?: string | null
  zone_code?: string | null
  status?: string | null
  status_reason?: string | null
}

function phaseFromQualified(qualifiedTeams: number): Phase {
  if (qualifiedTeams === 8) return "cuartos"
  if (qualifiedTeams === 4) return "semifinal"
  return "final"
}

function bestOfForPhase(phase: Phase, config: any): number {
  if (phase === "cuartos") return Number(config.best_of_cuartos ?? 1)
  if (phase === "semifinal") return Number(config.best_of_semifinal ?? 1)
  return Number(config.best_of_final ?? 1)
}

async function assertAdmin(accessToken: string) {
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

  if (callerProfile?.role !== "admin") {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  return { ok: true as const, adminClient }
}

function computeStandings(teamIds: string[], matches: MatchLite[]): StandingRow[] {
  const rows = new Map<string, StandingRow>()
  for (const id of teamIds) {
    rows.set(id, {
      teamId: id,
      played: 0,
      won: 0,
      lost: 0,
      np: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      points: 0,
    })
  }

  for (const m of matches) {
    // Solo consideramos partidos finalizados con ambos scores cargados
    if ((m as any).status !== "finalizado") continue
    if (m.home_score == null || m.away_score == null) continue
    if (!rows.has(m.home_team_id) || !rows.has(m.away_team_id)) continue

    const home = rows.get(m.home_team_id)!
    const away = rows.get(m.away_team_id)!

    home.played += 1
    away.played += 1

    home.pointsFor += m.home_score
    home.pointsAgainst += m.away_score

    away.pointsFor += m.away_score
    away.pointsAgainst += m.home_score

    const reason = (m.status_reason ?? "").toString()
    const isNoShow = reason.startsWith("no_presentacion:")
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

  // Helper: diferencia de puntos en enfrentamientos directos entre dos equipos
  const headToHeadDiff = (teamA: string, teamB: string) => {
    let diffA = 0
    let games = 0
    for (const m of matches) {
      if ((m.phase ?? null) !== "fase_regular") continue
      if ((m as any).status !== "finalizado") continue
      const involvesA = m.home_team_id === teamA || m.away_team_id === teamA
      const involvesB = m.home_team_id === teamB || m.away_team_id === teamB
      if (!involvesA || !involvesB) continue

      const aIsHome = m.home_team_id === teamA
      const homeScore = m.home_score ?? 0
      const awayScore = m.away_score ?? 0
      const aScore = aIsHome ? homeScore : awayScore
      const bScore = aIsHome ? awayScore : homeScore

      diffA += aScore - bScore
      games += 1
    }
    return { diffA, games }
  }

  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points

    // Regla NP: el que no tiene NP va arriba si el otro sí tiene.
    const aHasNp = a.np > 0
    const bHasNp = b.np > 0
    if (aHasNp !== bHasNp) {
      return aHasNp ? 1 : -1
    }

    // Confrontación mutua como siguiente criterio
    const { diffA, games } = headToHeadDiff(a.teamId, b.teamId)
    if (games > 0 && diffA !== 0) {
      return diffA > 0 ? -1 : 1
    }

    // Si siguen empatados, diferencia general y luego puntos a favor
    const aDiff = a.pointsFor - a.pointsAgainst
    const bDiff = b.pointsFor - b.pointsAgainst
    if (bDiff !== aDiff) return bDiff - aDiff
    return b.pointsFor - a.pointsFor
  })

  return list
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertAdmin(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => null)
    const parsed = generatePhaseSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { tournamentId } = parsed.data

    const { data: tournament, error: tournamentError } = await auth.adminClient
      .from("tournaments")
      .select("category_id, format")
      .eq("id", tournamentId)
      .maybeSingle()

    if (tournamentError) {
      return NextResponse.json({ error: tournamentError.message }, { status: 400 })
    }

    const categoryId = (tournament as any)?.category_id as string | null
    const format = ((tournament as any)?.format as string | null) ?? "normal"
    if (!categoryId) {
      return NextResponse.json({ error: "El torneo no tiene categoría asignada" }, { status: 400 })
    }

    const { data: teamRows, error: teamsError } = await auth.adminClient
      .from("team_categories")
      .select("team_id")
      .eq("category_id", categoryId)
      .order("created_at", { ascending: true })

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 400 })
    }

    const teamIds = (teamRows ?? []).map((t: any) => t.team_id as string)
    if (teamIds.length < 2) {
      return NextResponse.json({ error: "Se necesitan al menos 2 equipos" }, { status: 400 })
    }

    const { data: finalMatches, error: matchesError } = await auth.adminClient
      .from("matches")
      .select("home_team_id, away_team_id, home_score, away_score, phase, zone_code, status, status_reason")
      .eq("tournament_id", tournamentId)
      .eq("status", "finalizado")

    if (matchesError) {
      return NextResponse.json({ error: matchesError.message }, { status: 400 })
    }

    const regularMatches = ((finalMatches ?? []) as MatchLite[]).filter((m) => m.phase === "fase_regular")

    const { data: zoneRows, error: zonesError } = await auth.adminClient
      .from("tournament_team_zones")
      .select("team_id, zone_code")
      .eq("tournament_id", tournamentId)

    if (zonesError) {
      return NextResponse.json({ error: zonesError.message }, { status: 400 })
    }

    const zonesMap = new Map<string, string>()
    for (const r of (zoneRows ?? []) as any[]) {
      if (r?.team_id && r?.zone_code) zonesMap.set(String(r.team_id), String(r.zone_code))
    }

    const distinctZones = Array.from(new Set(Array.from(zonesMap.values()))).sort((a, b) => a.localeCompare(b))

    // Formato especial "Juegos Olímpicos": dos pasos
    if (format === "juegos_olimpicos") {
      if (distinctZones.length !== 2) {
        return NextResponse.json(
          { error: `El formato Juegos Olímpicos requiere exactamente 2 zonas en fase regular (hay ${distinctZones.length}).` },
          { status: 400 },
        )
      }

      // ¿Ya existe fase de Ganadores/Perdedores?
      const { data: gpAllMatches, error: gpAllError } = await auth.adminClient
        .from("matches")
        .select("id, home_team_id, away_team_id, home_score, away_score, status, zone_code, phase")
        .eq("tournament_id", tournamentId)
        .eq("phase", "fase_regular")
        .in("zone_code", ["G", "P"])

      if (gpAllError) {
        return NextResponse.json({ error: gpAllError.message }, { status: 400 })
      }

      const hasGpPhase = (gpAllMatches ?? []).length > 0

      // Paso 1: no existe G/P todavía -> generamos Zonas de Ganadores y Perdedores
      if (!hasGpPhase) {
        const [zoneA, zoneB] = distinctZones

        const zoneATeams = teamIds.filter((id) => zonesMap.get(id) === zoneA)
        const zoneBTeams = teamIds.filter((id) => zonesMap.get(id) === zoneB)

        const zoneAMatches = regularMatches.filter((m) => (m.zone_code ?? null) === zoneA)
        const zoneBMatches = regularMatches.filter((m) => (m.zone_code ?? null) === zoneB)

        const standingsA = computeStandings(zoneATeams, zoneAMatches)
        const standingsB = computeStandings(zoneBTeams, zoneBMatches)

        if (standingsA.length < 1 || standingsB.length < 1) {
          return NextResponse.json(
            { error: "El formato Juegos Olímpicos requiere al menos 1 equipo por zona para formar Ganadores/Perdedores." },
            { status: 400 },
          )
        }

        // Cantidad total a Zona Ganadores: usamos qualified_teams de la config si existe,
        // si no, por defecto 6 (3 y 3 como antes).
        const { data: joCfg, error: joCfgError } = await auth.adminClient
          .from("tournament_playoff_config")
          .select("qualified_teams")
          .eq("tournament_id", tournamentId)
          .maybeSingle()

        if (joCfgError) {
          return NextResponse.json({ error: joCfgError.message }, { status: 400 })
        }

        const totalGanadores = Math.max(1, Number((joCfg as any)?.qualified_teams ?? 6))

        // Reparto entre zonas A y B según par/impar
        let fromA = Math.floor(totalGanadores / 2)
        let fromB = Math.floor(totalGanadores / 2)

        if (totalGanadores % 2 === 1) {
          // cupo extra: se lo lleva el siguiente mejor clasificado entre A y B
          const nextA = standingsA[fromA]
          const nextB = standingsB[fromB]

          if (nextA && nextB) {
            // comparamos según el mismo ordenamiento ya aplicado (standings ordenado por computeStandings)
            // como standings ya están ordenados, simplemente vemos cuál de los dos está "más arriba" en su tabla
            // normalizamos usando índice: menor índice = mejor posición
            const idxA = fromA
            const idxB = fromB
            if (idxA === idxB) {
              // Si ambos son, por ejemplo, segundos, comparamos sus stats manualmente
              const diffA = nextA.pointsFor - nextA.pointsAgainst
              const diffB = nextB.pointsFor - nextB.pointsAgainst
              if (nextA.points > nextB.points || (nextA.points === nextB.points && diffA >= diffB)) {
                fromA += 1
              } else {
                fromB += 1
              }
            } else if (idxA < idxB) {
              fromA += 1
            } else {
              fromB += 1
            }
          } else if (nextA) {
            fromA += 1
          } else if (nextB) {
            fromB += 1
          }
        }

        fromA = Math.min(fromA, standingsA.length)
        fromB = Math.min(fromB, standingsB.length)

        const winnersA = standingsA.slice(0, fromA).map((r) => r.teamId)
        const winnersB = standingsB.slice(0, fromB).map((r) => r.teamId)
        const losersA = standingsA
          .filter((r) => !winnersA.includes(r.teamId))
          .map((r) => r.teamId)
        const losersB = standingsB
          .filter((r) => !winnersB.includes(r.teamId))
          .map((r) => r.teamId)

        type Pair = { home: string; away: string }
        const makeCrossPairs = (fromA: string[], fromB: string[]): Pair[] => {
          const pairs: Pair[] = []
          for (const a of fromA) {
            for (const b of fromB) {
              if (a && b && a !== b) {
                pairs.push({ home: a, away: b })
              }
            }
          }
          return pairs
        }

        const winnerPairs = makeCrossPairs(winnersA, winnersB)
        const loserPairs = makeCrossPairs(losersA, losersB)

        const buildRowsForZone = (zoneCode: string, pairs: Pair[]) => {
          return pairs.map((p, idx) => ({
            tournament_id: tournamentId,
            home_team_id: p.home,
            away_team_id: p.away,
            zone_code: zoneCode,
            // 3 fechas por grupo (cada equipo juega 3 partidos). Distribuimos redondamente.
            round: (idx % 3) + 1,
            phase: "fase_regular",
            status: "programado",
            scheduled_at: null,
            venue_id: null,
            court_id: null,
            home_score: null,
            away_score: null,
          }))
        }

        const insertRows = [
          ...buildRowsForZone("G", winnerPairs),
          ...buildRowsForZone("P", loserPairs),
        ]

        if (insertRows.length === 0) {
          return NextResponse.json({ error: "No hay cruces para generar en Ganadores/Perdedores." }, { status: 400 })
        }

        const { data: inserted, error: insertError } = await auth.adminClient
          .from("matches")
          .insert(insertRows)
          .select(
            "id, tournament_id, home_team_id, away_team_id, round, phase, status, scheduled_at, venue_id, court_id, home_score, away_score, zone_code, created_at",
          )
          .order("round", { ascending: true })
          .order("created_at", { ascending: true })

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 400 })
        }

        return NextResponse.json({ matches: inserted ?? [] })
      }

      // Paso 2: ya existe G/P y queremos generar playoffs de 8 equipos (5 de G + 3 de P)
      const unfinishedGp = (gpAllMatches ?? []).filter(
        (m) => m.status !== "finalizado" || m.home_score == null || m.away_score == null,
      )

      if (unfinishedGp.length > 0) {
        return NextResponse.json(
          { error: "Todavía hay partidos de Zonas Ganadores/Perdedores sin finalizar." },
          { status: 400 },
        )
      }

      const gTeamIds = Array.from(
        new Set(
          (gpAllMatches ?? [])
            .filter((m) => m.zone_code === "G")
            .flatMap((m) => [String(m.home_team_id), String(m.away_team_id)]),
        ),
      )
      const pTeamIds = Array.from(
        new Set(
          (gpAllMatches ?? [])
            .filter((m) => m.zone_code === "P")
            .flatMap((m) => [String(m.home_team_id), String(m.away_team_id)]),
        ),
      )

      if (gTeamIds.length < 5 || pTeamIds.length < 3) {
        return NextResponse.json(
          { error: "No hay suficientes equipos en Zonas Ganadores/Perdedores para generar playoffs (se esperan 6 y 6)." },
          { status: 400 },
        )
      }

      const standingsG = computeStandings(gTeamIds, regularMatches)
      const standingsP = computeStandings(pTeamIds, regularMatches)

      if (standingsG.length < 5 || standingsP.length < 3) {
        return NextResponse.json(
          { error: "No hay suficientes equipos clasificados en G/P para generar playoffs (5 de G y 3 de P)." },
          { status: 400 },
        )
      }

      const top5G = standingsG.slice(0, 5)
      const top3P = standingsP.slice(0, 3)

      const g1 = top5G[0]!.teamId
      const g2 = top5G[1]!.teamId
      const g3 = top5G[2]!.teamId
      const g4 = top5G[3]!.teamId
      const g5 = top5G[4]!.teamId
      const p1 = top3P[0]!.teamId
      const p2 = top3P[1]!.teamId
      const p3 = top3P[2]!.teamId

      // Config de playoffs para best_of (cuartos) y modo desempate
      const { data: joConfig, error: joConfigError } = await auth.adminClient
        .from("tournament_playoff_config")
        .select("qualified_teams, best_of_cuartos, best_of_semifinal, best_of_final, tiebreak_mode")
        .eq("tournament_id", tournamentId)
        .maybeSingle()

      if (joConfigError) {
        return NextResponse.json({ error: joConfigError.message }, { status: 400 })
      }

      const bestOfCuartos = joConfig ? bestOfForPhase("cuartos", joConfig) : 1

      // Armar los 4 cruces de cuartos según formato Juegos Olímpicos
      const joMatchups: Array<{ home: string; away: string; seriesIndex: number }> = []

      // 1° G vs 3° P
      joMatchups.push({ home: g1, away: p3, seriesIndex: 1 })
      // 2° G vs 2° P
      joMatchups.push({ home: g2, away: p2, seriesIndex: 2 })
      // 3° G vs 1° P
      joMatchups.push({ home: g3, away: p1, seriesIndex: 3 })
      // 4° G vs 5° G
      joMatchups.push({ home: g4, away: g5, seriesIndex: 4 })

      // Borrar cuartos existentes antes de recrearlos
      const { error: delMatches } = await auth.adminClient
        .from("matches")
        .delete()
        .eq("tournament_id", tournamentId)
        .eq("phase", "cuartos")

      if (delMatches) {
        return NextResponse.json({ error: delMatches.message }, { status: 400 })
      }

      const { error: delSeries } = await auth.adminClient
        .from("playoff_series")
        .delete()
        .eq("tournament_id", tournamentId)
        .eq("phase", "cuartos")

      if (delSeries) {
        return NextResponse.json({ error: delSeries.message }, { status: 400 })
      }

      const seriesRows = joMatchups.map((m) => ({
        tournament_id: tournamentId,
        phase: "cuartos" as Phase,
        series_index: m.seriesIndex,
        home_team_id: m.home,
        away_team_id: m.away,
        best_of: bestOfCuartos,
        winner_team_id: null,
        tiebreak_applied: null,
        random_winner_team_id: null,
      }))

      const { data: insertedJoSeries, error: insertJoSeriesError } = await auth.adminClient
        .from("playoff_series")
        .insert(seriesRows)
        .select("id, series_index, home_team_id, away_team_id")
        .order("series_index", { ascending: true })

      if (insertJoSeriesError) {
        return NextResponse.json({ error: insertJoSeriesError.message }, { status: 400 })
      }

      const seriesList = (insertedJoSeries ?? []) as Array<{
        id: string
        series_index: number
        home_team_id: string
        away_team_id: string
      }>

      const joInsertRows = seriesList.flatMap((s) => {
        const rows = [] as any[]
        for (let game = 1; game <= bestOfCuartos; game += 1) {
          const isEven = game % 2 === 0
          const homeTeamId = isEven ? s.away_team_id : s.home_team_id
          const awayTeamId = isEven ? s.home_team_id : s.away_team_id
          rows.push({
            tournament_id: tournamentId,
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            round: game,
            phase: "cuartos" as Phase,
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

      const { data: insertedJoMatches, error: insertJoMatchesError } = await auth.adminClient
        .from("matches")
        .insert(joInsertRows)
        .select(
          "id, tournament_id, home_team_id, away_team_id, round, phase, status, scheduled_at, venue_id, court_id, home_score, away_score, playoff_series_id, series_game_number, created_at",
        )
        .order("created_at", { ascending: true })

      if (insertJoMatchesError) {
        return NextResponse.json({ error: insertJoMatchesError.message }, { status: 400 })
      }

      return NextResponse.json({ matches: insertedJoMatches ?? [] })
    }

    const { data: config, error: configError } = await auth.adminClient
      .from("tournament_playoff_config")
      .select("qualified_teams, best_of_cuartos, best_of_semifinal, best_of_final, tiebreak_mode")
      .eq("tournament_id", tournamentId)
      .maybeSingle()

    if (configError) {
      return NextResponse.json({ error: configError.message }, { status: 400 })
    }

    const hasConfig = Boolean(config)
    const teamsToQualify = hasConfig ? Number((config as any).qualified_teams) : Number(parsed.data.teamsToQualify ?? 0)

    const zonesCount = distinctZones.length

    let qualified: StandingRow[] = []
    if (zonesCount >= 2) {
      if (!hasConfig) {
        return NextResponse.json(
          { error: "Para clasificar por zonas necesitás configurar playoffs (qualified_teams)" },
          { status: 400 },
        )
      }

      if (teamsToQualify % zonesCount !== 0) {
        return NextResponse.json(
          { error: `qualified_teams (${teamsToQualify}) debe ser divisible por la cantidad de zonas (${zonesCount})` },
          { status: 400 },
        )
      }

      const perZone = teamsToQualify / zonesCount

      const standingsByZone = distinctZones.map((z) => {
        const zoneTeamIds = teamIds.filter((id) => zonesMap.get(id) === z)
        const zoneMatches = regularMatches.filter((m) => (m.zone_code ?? null) === z)
        return computeStandings(zoneTeamIds, zoneMatches).slice(0, perZone)
      })

      for (let i = 0; i < perZone; i += 1) {
        for (let zi = 0; zi < standingsByZone.length; zi += 1) {
          const row = standingsByZone[zi]?.[i]
          if (row) qualified.push(row)
        }
      }
    } else {
      const standings = computeStandings(teamIds, regularMatches)

      const requested = Math.min(teamsToQualify, standings.length)
      if (requested < 2) {
        return NextResponse.json({ error: "No hay suficientes equipos clasificados" }, { status: 400 })
      }

      qualified = standings.slice(0, requested)
    }

    const phase: Phase = hasConfig ? phaseFromQualified(teamsToQualify) : ((parsed.data.phase ?? "cuartos") as Phase)

    // Aplicar "libres": si hay menos equipos reales que cupos configurados.
    // Caso especial: cuartos con 8 plazas pero menos de 8 equipos reales
    // (por ejemplo, 7 equipos para 8 cupos). En ese escenario queremos
    // mantener siempre 4 cruces numerados 1..4, donde:
    //  - Cuarto 1: semilla 1 vs Libre (winner_team_id = semilla 1 desde el inicio)
    //  - Cuarto 2: semilla 2 vs semilla 7
    //  - Cuarto 3: semilla 3 vs semilla 6
    //  - Cuarto 4: semilla 4 vs semilla 5
    // Así las semifinales pueden armarse como
    //  Semi 1 = ganador Cuarto 1 vs ganador Cuarto 4
    //  Semi 2 = ganador Cuarto 2 vs ganador Cuarto 3.

    const total = qualified.length
    const initialByes = Math.max(0, teamsToQualify - total)
    const byes = Math.min(initialByes, total)

    const matchups: Array<{ home: string; away: string | null; winnerPreset?: string | null; seriesIndex: number }> = []

    if (phase === "cuartos" && teamsToQualify === 8 && byes > 0 && total >= 4) {
      const seeds = qualified.map((q) => q.teamId)

      // Serie 1: semilla 1 recibe bye (vs Libre). Ganador predefinido.
      const topSeed = seeds[0]!
      matchups.push({ home: topSeed, away: null, winnerPreset: topSeed, seriesIndex: 1 })

      const s2 = seeds[1]
      const s3 = seeds[2]
      const s4 = seeds[3]
      const s5 = seeds[4]
      const s6 = seeds[5]
      const s7 = seeds[6]

      // Cuarto 2: 2 vs 7
      if (s2 && s7) {
        matchups.push({ home: s2, away: s7, winnerPreset: null, seriesIndex: 2 })
      }

      // Cuarto 3: 3 vs 6
      if (s3 && s6) {
        matchups.push({ home: s3, away: s6, winnerPreset: null, seriesIndex: 3 })
      }

      // Cuarto 4: 4 vs 5
      if (s4 && s5) {
        matchups.push({ home: s4, away: s5, winnerPreset: null, seriesIndex: 4 })
      }
    } else {
      // Comportamiento genérico: distribuimos los byes al principio y
      // emparejamos sólo a los equipos activos por 1º vs último, etc.
      const active = qualified.slice(byes)
      const n = active.length % 2 === 0 ? active.length : active.length - 1
      const half = n / 2

      for (let i = 0; i < half; i++) {
        matchups.push({
          home: active[i]!.teamId,
          away: active[n - 1 - i]!.teamId,
          winnerPreset: null,
          seriesIndex: i + 1,
        })
      }
    }

    const bestOf = hasConfig ? bestOfForPhase(phase, config) : 1

    const { error: deleteMatchesError } = await auth.adminClient
      .from("matches")
      .delete()
      .eq("tournament_id", tournamentId)
      .eq("phase", phase)

    if (deleteMatchesError) {
      return NextResponse.json({ error: deleteMatchesError.message }, { status: 400 })
    }

    const { error: deleteSeriesError } = await auth.adminClient
      .from("playoff_series")
      .delete()
      .eq("tournament_id", tournamentId)
      .eq("phase", phase)

    if (deleteSeriesError) {
      return NextResponse.json({ error: deleteSeriesError.message }, { status: 400 })
    }

    const seriesRows = matchups.map((m) => ({
      tournament_id: tournamentId,
      phase,
      series_index: m.seriesIndex,
      home_team_id: m.home,
      // away_team_id es NOT NULL, así que para el bye usamos el mismo equipo
      // en home y away. Esto ya es válido porque quitamos la constraint
      // playoff_series_distinct_teams.
      away_team_id: m.away ?? m.home,
      best_of: bestOf,
      winner_team_id: m.winnerPreset ?? null,
      tiebreak_applied: m.winnerPreset ? "bye" : null,
      random_winner_team_id: null,
    }))

    const { data: insertedSeries, error: insertSeriesError } = await auth.adminClient
      .from("playoff_series")
      .insert(seriesRows)
      .select("id, series_index, home_team_id, away_team_id")
      .order("series_index", { ascending: true })

    if (insertSeriesError) {
      return NextResponse.json({ error: insertSeriesError.message }, { status: 400 })
    }

    const seriesList = (insertedSeries ?? []) as Array<{
      id: string
      series_index: number
      home_team_id: string
      away_team_id: string
    }>

    const insertRows = seriesList.flatMap((s) => {
      const rows = [] as any[]

      // Para la serie con bye (Libre), codificada como home_team_id === away_team_id
      // y con winner_team_id ya seteado, no generamos partidos reales.
      if (s.home_team_id === s.away_team_id) {
        return rows
      }

      for (let game = 1; game <= bestOf; game += 1) {
        const isEven = game % 2 === 0
        const homeTeamId = isEven ? s.away_team_id : s.home_team_id
        const awayTeamId = isEven ? s.home_team_id : s.away_team_id
        rows.push({
          tournament_id: tournamentId,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          // Usamos series_game_number como round para que en el fixture público
          // se agrupen como "Fecha 1", "Fecha 2", etc. dentro de la fase.
          round: game,
          phase,
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

    const { data: inserted, error: insertError } = await auth.adminClient
      .from("matches")
      .insert(insertRows)
      .select(
        "id, tournament_id, home_team_id, away_team_id, round, phase, status, scheduled_at, venue_id, court_id, home_score, away_score, playoff_series_id, series_game_number, created_at",
      )
      .order("created_at", { ascending: true })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 })
    }

    return NextResponse.json({ matches: inserted ?? [] })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/phases/generate failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
