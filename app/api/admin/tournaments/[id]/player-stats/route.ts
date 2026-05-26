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

type PlayerMatchStatRow = {
  matchId: string
  teamId: string
  playerId: string
  source: "planilla" | "legacy"
  minutes: number | string | null
  points: number | null
  t1Made: number | null
  t1Att: number | null
  t2Made: number | null
  t2Att: number | null
  t3Made: number | null
  t3Att: number | null
  rebounds: number | null
  assists: number | null
  steals: number | null
  turnovers: number | null
  blocksCommitted: number | null
  blocksReceived: number | null
  foulsCommitted: number | null
  foulsReceived: number | null
  rating: number | null
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

    const url = new URL(req.url)
    const teamId = url.searchParams.get("teamId")?.trim() || ""
    const playerId = url.searchParams.get("playerId")?.trim() || ""

    if (!teamId) {
      return NextResponse.json({ error: "Falta teamId" }, { status: 400 })
    }
    if (!playerId) {
      return NextResponse.json({ error: "Falta playerId" }, { status: 400 })
    }

    const { data: matches, error: matchesError } = await admin
      .from("matches")
      .select(
        "id, tournament_id, home_team_id, away_team_id, round, phase, status, scheduled_at, started_at, finished_at, home_score, away_score",
      )
      .eq("tournament_id", tournamentId)
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .order("scheduled_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })

    if (matchesError) {
      return NextResponse.json({ error: matchesError.message }, { status: 400 })
    }

    const matchIds = (matches ?? []).map((m: any) => String(m.id)).filter(Boolean)
    if (matchIds.length === 0) {
      return NextResponse.json({ rows: [], matches: [] })
    }

    const teamIds = Array.from(
      new Set(
        (matches ?? [])
          .flatMap((m: any) => [m.home_team_id, m.away_team_id])
          .filter((id: any) => Boolean(id))
          .map((id: any) => String(id)),
      ),
    )

    const [{ data: teams, error: teamsError }, planillaRes, legacyRes] = await Promise.all([
      admin.from("teams").select("id, name").in("id", teamIds.length ? teamIds : ["__none__"]),
      admin
        .from("match_player_stats_planilla")
        .select(
          "match_id, team_id, player_id, minutes, points, t1_made, t1_att, t2_made, t2_att, t3_made, t3_att, rebounds, assists, steals, turnovers, blocks_committed, blocks_received, fouls_committed, fouls_received, rating",
        )
        .in("match_id", matchIds)
        .eq("player_id", playerId),
      admin
        .from("match_player_stats")
        .select(
          "match_id, team_id, player_id, minutes, points, t1_made, t1_att, t2_made, t2_att, t3_made, t3_att, rebounds, assists, steals, turnovers, blocks_committed, blocks_received, fouls_committed, fouls_received, rating",
        )
        .in("match_id", matchIds)
        .eq("player_id", playerId),
    ])

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 400 })
    }

    if (planillaRes.error) {
      return NextResponse.json({ error: planillaRes.error.message }, { status: 400 })
    }
    if (legacyRes.error) {
      return NextResponse.json({ error: legacyRes.error.message }, { status: 400 })
    }

    const teamById = new Map<string, { id: string; name: string }>()
    for (const t of (teams ?? []) as any[]) {
      teamById.set(String(t.id), { id: String(t.id), name: String(t.name ?? "") })
    }

    const planillaByMatch = new Map<string, any>()
    for (const r of (planillaRes.data ?? []) as any[]) {
      planillaByMatch.set(String(r.match_id), r)
    }

    const legacyByMatch = new Map<string, any>()
    for (const r of (legacyRes.data ?? []) as any[]) {
      legacyByMatch.set(String(r.match_id), r)
    }

    const rows: PlayerMatchStatRow[] = []

    for (const m of (matches ?? []) as any[]) {
      const matchId = String(m.id)
      const planillaRow = planillaByMatch.get(matchId)
      const legacyRow = legacyByMatch.get(matchId)
      const row = planillaRow ?? legacyRow
      if (!row) continue

      rows.push({
        matchId,
        teamId: String(row.team_id ?? ""),
        playerId: String(row.player_id ?? ""),
        source: planillaRow ? "planilla" : "legacy",
        minutes: row.minutes ?? null,
        points: row.points ?? null,
        t1Made: row.t1_made ?? null,
        t1Att: row.t1_att ?? null,
        t2Made: row.t2_made ?? null,
        t2Att: row.t2_att ?? null,
        t3Made: row.t3_made ?? null,
        t3Att: row.t3_att ?? null,
        rebounds: row.rebounds ?? null,
        assists: row.assists ?? null,
        steals: row.steals ?? null,
        turnovers: row.turnovers ?? null,
        blocksCommitted: row.blocks_committed ?? null,
        blocksReceived: row.blocks_received ?? null,
        foulsCommitted: row.fouls_committed ?? null,
        foulsReceived: row.fouls_received ?? null,
        rating: row.rating ?? null,
      })
    }

    const matchesOut = (matches ?? []).map((m: any) => {
      const homeTeamId = String(m.home_team_id ?? "")
      const awayTeamId = String(m.away_team_id ?? "")
      return {
        id: String(m.id),
        round: m.round ?? null,
        phase: m.phase ?? null,
        status: m.status ?? null,
        scheduledAt: m.scheduled_at ?? null,
        startedAt: m.started_at ?? null,
        finishedAt: m.finished_at ?? null,
        homeTeamId,
        awayTeamId,
        homeTeamName: teamById.get(homeTeamId)?.name ?? "Local",
        awayTeamName: teamById.get(awayTeamId)?.name ?? "Visitante",
        homeScore: m.home_score ?? null,
        awayScore: m.away_score ?? null,
      }
    })

    return NextResponse.json({ rows, matches: matchesOut })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/tournaments/[id]/player-stats failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
