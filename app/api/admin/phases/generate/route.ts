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

    if (m.home_score > m.away_score) {
      home.won += 1
      away.lost += 1
    } else {
      away.won += 1
      home.lost += 1
    }
  }

  const list = Array.from(rows.values())
  for (const r of list) {
    r.points = r.won * 2
  }

  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
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
      .select("category_id")
      .eq("id", tournamentId)
      .maybeSingle()

    if (tournamentError) {
      return NextResponse.json({ error: tournamentError.message }, { status: 400 })
    }

    const categoryId = (tournament as any)?.category_id as string | null
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
      .select("home_team_id, away_team_id, home_score, away_score, phase, zone_code")
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
      const n = requested % 2 === 0 ? requested : requested - 1

      if (n < 2) {
        return NextResponse.json({ error: "No hay suficientes equipos clasificados" }, { status: 400 })
      }

      qualified = standings.slice(0, n)
    }

    const n = qualified.length % 2 === 0 ? qualified.length : qualified.length - 1
    qualified = qualified.slice(0, n)
    const matchups: Array<{ home: string; away: string }> = []
    const half = qualified.length / 2

    for (let i = 0; i < half; i++) {
      matchups.push({ home: qualified[i]!.teamId, away: qualified[qualified.length - 1 - i]!.teamId })
    }

    const phase: Phase = hasConfig ? phaseFromQualified(teamsToQualify) : ((parsed.data.phase ?? "cuartos") as Phase)
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

    const seriesRows = matchups.map((m, idx) => ({
      tournament_id: tournamentId,
      phase,
      series_index: idx + 1,
      home_team_id: m.home,
      away_team_id: m.away,
      best_of: bestOf,
      winner_team_id: null,
      tiebreak_applied: null,
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
      for (let game = 1; game <= bestOf; game += 1) {
        const isEven = game % 2 === 0
        const homeTeamId = isEven ? s.away_team_id : s.home_team_id
        const awayTeamId = isEven ? s.home_team_id : s.away_team_id
        rows.push({
          tournament_id: tournamentId,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          round: 1,
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
