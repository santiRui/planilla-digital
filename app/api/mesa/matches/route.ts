import { NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

async function assertMesa(accessToken: string) {
  const adminClient = createSupabaseAdminClient()
  const userClient = createSupabaseServerClient(accessToken)

  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false as const, status: 401, error: "No autorizado" }
  }

  const callerId = userData.user.id
  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from("profiles")
    .select("role, full_name")
    .eq("id", callerId)
    .maybeSingle()

  if (callerProfileError) {
    return { ok: false as const, status: 400, error: callerProfileError.message }
  }

  if (callerProfile?.role !== "oficial_mesa") {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  return { ok: true as const, adminClient, callerId, fullName: callerProfile.full_name as string }
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertMesa(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { data: assignmentRows, error: assignmentError } = await auth.adminClient
      .from("match_official_assignments")
      .select("match_id")
      .eq("user_id", auth.callerId)
      .eq("role", "oficial_mesa")

    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 400 })
    }

    const matchIds = Array.from(new Set((assignmentRows ?? []).map((r: any) => r.match_id).filter(Boolean))) as string[]

    if (matchIds.length === 0) {
      return NextResponse.json({ matches: [], profile: { fullName: auth.fullName } })
    }

    const { data: matches, error: matchesError } = await auth.adminClient
      .from("matches")
      .select(
        "id, tournament_id, home_team_id, away_team_id, round, phase, status, scheduled_at, venue_id, court_id, home_score, away_score, live_home_score, live_away_score, live_period, live_game_time, created_at",
      )
      .in("id", matchIds)

    if (matchesError) {
      return NextResponse.json({ error: matchesError.message }, { status: 400 })
    }

    return NextResponse.json({ matches: matches ?? [], profile: { fullName: auth.fullName } })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/mesa/matches failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
