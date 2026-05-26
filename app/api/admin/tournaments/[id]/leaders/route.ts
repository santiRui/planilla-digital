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

    const url = new URL(req.url)
    const debugPlayerId = url.searchParams.get("debugPlayerId")?.trim() || ""

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertAdmin(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const admin = auth.adminClient

    const { data: leaderRows, error: leadersError } = await admin
      .from("tournament_player_leaders")
      .select(
        "tournament_id, player_id, games, points, rebounds, assists, steals, blocks, fouls_received, players(id, team_id, first_name, last_name, jersey_number)",
      )
      .eq("tournament_id", tournamentId)

    if (leadersError) {
      return NextResponse.json({ error: leadersError.message }, { status: 400 })
    }

    const teamIds = Array.from(
      new Set((leaderRows ?? []).map((r: any) => String(r.players?.team_id ?? "")).filter(Boolean)),
    ) as string[]

    const { data: teams, error: teamsError } = await admin
      .from("teams")
      .select("id, name")
      .in("id", teamIds.length ? teamIds : ["__none__"])

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 400 })
    }

    const teamById = new Map<string, string>()
    for (const t of (teams ?? []) as any[]) {
      teamById.set(String(t.id), String(t.name ?? ""))
    }

    const asArray = (leaderRows ?? []).map((r: any) => ({
      playerId: String(r.player_id),
      games: Number(r.games ?? 0),
      points: Number(r.points ?? 0),
      rebounds: Number(r.rebounds ?? 0),
      assists: Number(r.assists ?? 0),
      steals: Number(r.steals ?? 0),
      blocks: Number(r.blocks ?? 0),
      foulsReceived: Number(r.fouls_received ?? 0),
      jerseyNumber: (r.players?.jersey_number as number | null) ?? null,
      firstName: String(r.players?.first_name ?? ""),
      lastName: String(r.players?.last_name ?? ""),
      teamName: teamById.get(String(r.players?.team_id ?? "")) ?? "",
    }))

    if (debugPlayerId) {
      const row = asArray.find((r) => r.playerId === debugPlayerId) ?? null
      return NextResponse.json({ tournamentId, debugPlayerId, row })
    }

    const limit = 10

    const topScorers = [...asArray]
      .sort((a, b) => b.points - a.points || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topRebounders = [...asArray]
      .sort((a, b) => b.rebounds - a.rebounds || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topAssistants = [...asArray]
      .sort((a, b) => b.assists - a.assists || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topStealers = [...asArray]
      .sort((a, b) => b.steals - a.steals || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topBlockers = [...asArray]
      .sort((a, b) => b.blocks - a.blocks || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topFoulsReceived = [...asArray]
      .sort((a, b) => b.foulsReceived - a.foulsReceived || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    return NextResponse.json({ topScorers, topRebounders, topAssistants, topStealers, topBlockers, topFoulsReceived })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/tournaments/[id]/leaders failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
