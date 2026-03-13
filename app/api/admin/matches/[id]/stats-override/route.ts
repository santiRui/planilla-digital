import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { z } from "zod"

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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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

    const admin = auth.adminClient
    const matchId = params.id

    const { data: matchRow, error: matchErr } = await admin
      .from("matches")
      .select("id, home_team_id, away_team_id, home_score, away_score, status")
      .eq("id", matchId)
      .single()

    if (matchErr || !matchRow) {
      return NextResponse.json({ error: matchErr?.message ?? "Partido no encontrado" }, { status: 404 })
    }

    const { data: teams, error: teamsErr } = await admin
      .from("teams")
      .select("id, name")
      .in("id", [matchRow.home_team_id, matchRow.away_team_id])

    if (teamsErr) {
      return NextResponse.json({ error: teamsErr.message }, { status: 400 })
    }

    const teamById = new Map<string, { id: string; name: string }>()
    for (const t of teams ?? []) teamById.set(t.id, t)

    const { data: statsRows, error: statsErr } = await admin
      .from("match_player_stats")
      .select("match_id, team_id, player_id, minutes, points, t1_made, t1_att, t2_made, t2_att, t3_made, t3_att")
      .eq("match_id", matchId)

    if (statsErr) {
      return NextResponse.json({ error: statsErr.message }, { status: 400 })
    }

    const { data: players, error: playersErr } = await admin
      .from("players")
      .select("id, team_id, first_name, last_name, jersey_number")
      .in("team_id", [matchRow.home_team_id, matchRow.away_team_id])

    if (playersErr) {
      return NextResponse.json({ error: playersErr.message }, { status: 400 })
    }

    const playerById = new Map<string, any>()
    for (const p of players ?? []) playerById.set(p.id, p)

    const stats = (statsRows ?? []).map((row) => {
      const p = playerById.get(row.player_id)
      return {
        matchId: row.match_id,
        teamId: row.team_id,
        playerId: row.player_id,
        minutes: row.minutes,
        points: row.points,
        t1Made: row.t1_made,
        t1Att: row.t1_att,
        t2Made: row.t2_made,
        t2Att: row.t2_att,
        t3Made: row.t3_made,
        t3Att: row.t3_att,
        playerName: p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Jugador" : "Jugador",
        jerseyNumber: p?.jersey_number ?? null,
      }
    })

    return NextResponse.json({
      match: {
        id: matchRow.id,
        homeTeamId: matchRow.home_team_id,
        awayTeamId: matchRow.away_team_id,
        homeScore: matchRow.home_score ?? 0,
        awayScore: matchRow.away_score ?? 0,
        status: matchRow.status,
        homeTeamName: teamById.get(matchRow.home_team_id)?.name ?? "Local",
        awayTeamName: teamById.get(matchRow.away_team_id)?.name ?? "Visitante",
      },
      stats,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/matches/[id]/stats-override failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const saveBodySchema = z.object({
  stats: z.array(
    z.object({
      matchId: z.string(),
      teamId: z.string(),
      playerId: z.string(),
      minutes: z.number().nullable(),
      points: z.number().nullable(),
      t1Made: z.number().nullable(),
      t1Att: z.number().nullable(),
      t2Made: z.number().nullable(),
      t2Att: z.number().nullable(),
      t3Made: z.number().nullable(),
      t3Att: z.number().nullable(),
    }),
  ),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

    const admin = auth.adminClient
    const matchId = params.id

    const json = await req.json().catch(() => null)
    const parsed = saveBodySchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const rows = parsed.data.stats.map((s) => ({
      match_id: matchId,
      team_id: s.teamId,
      player_id: s.playerId,
      minutes: s.minutes,
      points: s.points,
      t1_made: s.t1Made,
      t1_att: s.t1Att,
      t2_made: s.t2Made,
      t2_att: s.t2Att,
      t3_made: s.t3Made,
      t3_att: s.t3Att,
    }))

    const { error: upsertErr } = await admin
      .from("match_player_stats")
      .upsert(rows, { onConflict: "match_id,player_id" })

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, updated: rows.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/matches/[id]/stats-override failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
