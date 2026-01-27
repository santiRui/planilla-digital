import { NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

async function assertRefereeAssigned(accessToken: string, matchId: string) {
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

  if (callerProfile?.role !== "arbitro") {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  const { data: assignment, error: assignmentError } = await adminClient
    .from("match_official_assignments")
    .select("id")
    .eq("match_id", matchId)
    .eq("user_id", callerId)
    .eq("role", "arbitro")
    .maybeSingle()

  if (assignmentError) {
    return { ok: false as const, status: 400, error: assignmentError.message }
  }

  if (!assignment) {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  return { ok: true as const, adminClient }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params

    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertRefereeAssigned(accessToken, id)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { data: current, error: currentError } = await auth.adminClient
      .from("matches")
      .select("id, status, home_score, away_score")
      .eq("id", id)
      .maybeSingle()

    if (currentError || !current) {
      return NextResponse.json({ error: currentError?.message ?? "No se pudo leer el partido" }, { status: 400 })
    }

    if (current.status === "finalizado") {
      return NextResponse.json({ error: "El partido ya está finalizado" }, { status: 400 })
    }

    if (current.status === "en_juego") {
      return NextResponse.json({ ok: true })
    }

    const { error: updateError } = await auth.adminClient
      .from("matches")
      .update({
        status: "en_juego",
        home_score: current.home_score ?? 0,
        away_score: current.away_score ?? 0,
      })
      .eq("id", id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/arbitros/matches/[id]/start failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
