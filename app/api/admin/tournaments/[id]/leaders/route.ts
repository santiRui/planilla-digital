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

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: tournamentId } = await ctx.params

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

    const admin = auth.adminClient

    // 1) Partidos finalizados del torneo
    const { data: matches, error: matchesError } = await admin
      .from("matches")
      .select("id, home_team_id, away_team_id")
      .eq("tournament_id", tournamentId)
      .eq("status", "finalizado")

    if (matchesError) {
      return NextResponse.json({ error: matchesError.message }, { status: 400 })
    }

    const matchIds = (matches ?? []).map((m: any) => m.id)
    if (!matchIds.length) {
      return NextResponse.json({
        topScorers: [],
        topThreePointers: [],
        topAssistants: [],
        topRebounders: [],
        topStealers: [],
        topBlockers: [],
      })
    }

    const teamIds = Array.from(
      new Set(
        (matches ?? []).flatMap((m: any) => [m.home_team_id, m.away_team_id]).filter((id: string | null) => Boolean(id)),
      ),
    ) as string[]

    // 2) Stats de jugadores para esos partidos
    // Primero intentamos usar la tabla nueva de planilla. Si no hay datos
    // (por ejemplo, partidos antiguos con estadísticas ficticias creadas en
    // la tabla vieja), hacemos fallback a match_player_stats.
    let statsRows: any[] = []

    const { data: rowsPlanilla, error: statsPlanillaError } = await admin
      .from("match_player_stats_planilla")
      .select(
        "match_id, team_id, player_id, minutes, points, t1_made, t1_att, t2_made, t2_att, t3_made, t3_att, rebounds, assists, steals, blocks_committed",
      )
      .in("match_id", matchIds)

    if (statsPlanillaError) {
      return NextResponse.json({ error: statsPlanillaError.message }, { status: 400 })
    }

    if (rowsPlanilla && rowsPlanilla.length > 0) {
      statsRows = rowsPlanilla as any[]
    } else {
      const { data: rowsLegacy, error: statsLegacyError } = await admin
        .from("match_player_stats")
        .select(
          "match_id, team_id, player_id, minutes, points, t1_made, t1_att, t2_made, t2_att, t3_made, t3_att, rebounds, assists, steals, blocks_committed",
        )
        .in("match_id", matchIds)

      if (statsLegacyError) {
        return NextResponse.json({ error: statsLegacyError.message }, { status: 400 })
      }

      if (rowsLegacy && rowsLegacy.length > 0) {
        statsRows = rowsLegacy as any[]
      }
    }

    if (!statsRows || statsRows.length === 0) {
      return NextResponse.json({
        topScorers: [],
        topThreePointers: [],
        topAssistants: [],
        topRebounders: [],
        topStealers: [],
        topBlockers: [],
      })
    }

    // 3) Datos de jugadores y equipos
    const [{ data: players, error: playersError }, { data: teams, error: teamsError }] = await Promise.all([
      admin
        .from("players")
        .select("id, team_id, first_name, last_name, jersey_number")
        .in("team_id", teamIds),
      admin.from("teams").select("id, name"),
    ])

    if (playersError) {
      return NextResponse.json({ error: playersError.message }, { status: 400 })
    }
    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 400 })
    }

    const playerById = new Map<string, any>()
    for (const p of players ?? []) {
      playerById.set(p.id, p)
    }

    const teamById = new Map<string, any>()
    for (const t of teams ?? []) {
      teamById.set(t.id, t)
    }

    type Agg = {
      playerId: string
      teamId: string
      games: number
      points: number
      t3Made: number
      t3Att: number
      assists: number
      rebounds: number
      steals: number
      blocks: number
    }

    const aggByPlayer = new Map<string, Agg>()

    for (const row of statsRows as any[]) {
      const key = `${row.player_id}|${row.team_id}`
      const current = aggByPlayer.get(key) ?? {
        playerId: row.player_id,
        teamId: row.team_id,
        games: 0,
        points: 0,
        t3Made: 0,
        t3Att: 0,
        assists: 0,
        rebounds: 0,
        steals: 0,
        blocks: 0,
      }

      current.games += 1
      current.points += row.points ?? 0
      current.t3Made += row.t3_made ?? 0
      current.t3Att += row.t3_att ?? 0
      current.assists += row.assists ?? 0
      current.rebounds += row.rebounds ?? 0
      current.steals += row.steals ?? 0
      current.blocks += row.blocks_committed ?? 0

      aggByPlayer.set(key, current)
    }

    const asArray = Array.from(aggByPlayer.values()).map((agg) => {
      const player = playerById.get(agg.playerId)
      const team = teamById.get(agg.teamId)
      return {
        playerId: agg.playerId,
        teamId: agg.teamId,
        games: agg.games,
        points: agg.points,
        t3Made: agg.t3Made,
        t3Att: agg.t3Att,
        assists: agg.assists,
        rebounds: agg.rebounds,
        steals: agg.steals,
        blocks: agg.blocks,
        jerseyNumber: player?.jersey_number ?? null,
        firstName: player?.first_name ?? "",
        lastName: player?.last_name ?? "",
        teamName: team?.name ?? "",
      }
    })

    const limit = 20

    const topScorers = [...asArray]
      .sort((a, b) => b.points - a.points || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topThreePointers = [...asArray]
      .sort((a, b) => b.t3Made - a.t3Made || (b.t3Att || 0) - (a.t3Att || 0))
      .slice(0, limit)

    const topAssistants = [...asArray]
      .sort((a, b) => b.assists - a.assists || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topRebounders = [...asArray]
      .sort((a, b) => b.rebounds - a.rebounds || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topStealers = [...asArray]
      .sort((a, b) => b.steals - a.steals || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topBlockers = [...asArray]
      .sort((a, b) => b.blocks - a.blocks || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    return NextResponse.json({ topScorers, topThreePointers, topAssistants, topRebounders, topStealers, topBlockers })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/tournaments/[id]/leaders failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
