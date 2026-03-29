import { NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

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

export async function GET(req: Request) {
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

    const { searchParams } = new URL(req.url)
    const tournamentId = searchParams.get("tournamentId")
    const categoryId = searchParams.get("categoryId")

    let resolvedTournamentId: string | null = tournamentId
    if (!resolvedTournamentId && categoryId) {
      const { data: catRow, error: catError } = await auth.adminClient
        .from("categories_old")
        .select("tournament_id")
        .eq("id", categoryId)
        .maybeSingle()

      if (catError) {
        return NextResponse.json({ error: catError.message }, { status: 400 })
      }

      resolvedTournamentId = (catRow as any)?.tournament_id ?? null
    }

    let q = auth.adminClient
      .from("matches")
      .select(
        "id, tournament_id, home_team_id, away_team_id, round, phase, status, scheduled_at, venue_id, court_id, home_score, away_score, live_home_score, live_away_score, live_period, live_game_time, zone_code, status_reason, playoff_series_id, series_game_number, created_at, started_at, finished_at, match_official_assignments(user_id, role)",
      )
      .order("round", { ascending: true })
      .order("created_at", { ascending: true })

    if (resolvedTournamentId) {
      q = q.eq("tournament_id", resolvedTournamentId)
    }

    const { data, error } = await q

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const matches = (data ?? []) as any[]

    // Para partidos finalizados, recalculamos el score a partir de las
    // estadísticas de la planilla (match_player_stats_planilla), para que
    // siempre coincida con los puntos sumados por jugador y haya una única
    // fuente de verdad.
    const finishedMatchIds = matches
      .filter((m) => m?.status === "finalizado" && m?.id)
      .map((m) => String(m.id))

    let matchesWithPlanillaScores = matches

    if (finishedMatchIds.length > 0) {
      let statsRows: any[] = []

      const { data: rowsPlanilla, error: statsPlanillaError } = await auth.adminClient
        .from("match_player_stats_planilla")
        .select("match_id, team_id, points")
        .in("match_id", finishedMatchIds)

      if (statsPlanillaError) {
        return NextResponse.json({ error: statsPlanillaError.message }, { status: 400 })
      }

      if (rowsPlanilla && rowsPlanilla.length > 0) {
        statsRows = rowsPlanilla as any[]
      } else {
        const { data: rowsLegacy, error: statsLegacyError } = await auth.adminClient
          .from("match_player_stats")
          .select("match_id, team_id, points")
          .in("match_id", finishedMatchIds)

        if (statsLegacyError) {
          return NextResponse.json({ error: statsLegacyError.message }, { status: 400 })
        }

        if (rowsLegacy && rowsLegacy.length > 0) {
          statsRows = rowsLegacy as any[]
        }
      }

      if (Array.isArray(statsRows) && statsRows.length > 0) {
        const totalsByMatch: Record<string, Record<string, number>> = {}

        for (const row of statsRows as any[]) {
          const matchId = String(row.match_id)
          const teamId = String(row.team_id)
          const pts = typeof row.points === "number" ? row.points : 0
          if (!totalsByMatch[matchId]) totalsByMatch[matchId] = {}
          totalsByMatch[matchId][teamId] = (totalsByMatch[matchId][teamId] ?? 0) + pts
        }

        matchesWithPlanillaScores = matches.map((m) => {
          const matchId = String(m.id)
          const totalsForMatch = totalsByMatch[matchId]
          if (m.status !== "finalizado" || !totalsForMatch) return m

          const homePts = totalsForMatch[String(m.home_team_id)]
          const awayPts = totalsForMatch[String(m.away_team_id)]

          if (typeof homePts !== "number" && typeof awayPts !== "number") return m

          return {
            ...m,
            home_score: typeof homePts === "number" ? homePts : m.home_score,
            away_score: typeof awayPts === "number" ? awayPts : m.away_score,
          }
        })
      }
    }

    return NextResponse.json({ matches: matchesWithPlanillaScores })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/matches failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
