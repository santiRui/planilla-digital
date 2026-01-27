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
        "id, tournament_id, home_team_id, away_team_id, round, phase, status, scheduled_at, venue_id, court_id, home_score, away_score, zone_code, playoff_series_id, series_game_number, created_at, match_official_assignments(user_id, role)",
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

    return NextResponse.json({ matches: data ?? [] })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/matches failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
