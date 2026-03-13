import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const updateJerseySchema = z.object({
  playerId: z.string().min(1),
  jerseyNumber: z.number().int().min(0).max(999),
})

async function assertMesaJerseyRole(accessToken: string, matchId: string) {
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

  const role = (callerProfile?.role as string | undefined) ?? ""
  if (role === "admin") {
    return { ok: true as const, adminClient, callerId, role }
  }

  if (role !== "oficial_mesa" && role !== "arbitro") {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  // Solo oficial de mesa asignado al partido puede modificar dorsales
  const { data: assignment, error: assignmentError } = await adminClient
    .from("match_official_assignments")
    .select("id")
    .eq("match_id", matchId)
    .eq("user_id", callerId)
    .eq("role", "oficial_mesa")
    .maybeSingle()

  if (assignmentError) {
    return { ok: false as const, status: 400, error: assignmentError.message }
  }

  if (!assignment) {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  return { ok: true as const, adminClient, callerId, role }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: matchId } = await ctx.params

    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertMesaJerseyRole(accessToken, matchId)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => null)
    const parsed = updateJerseySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { playerId, jerseyNumber } = parsed.data

    const { data: matchRow, error: matchError } = await auth.adminClient
      .from("matches")
      .select("home_team_id, away_team_id")
      .eq("id", matchId)
      .maybeSingle()

    if (matchError || !matchRow) {
      return NextResponse.json({ error: matchError?.message ?? "Partido no encontrado" }, { status: 400 })
    }

    const { data: playerRow, error: playerError } = await auth.adminClient
      .from("players")
      .select("id, team_id")
      .eq("id", playerId)
      .maybeSingle()

    if (playerError || !playerRow) {
      return NextResponse.json({ error: playerError?.message ?? "Jugador no encontrado" }, { status: 400 })
    }

    const teamId = (playerRow as any).team_id as string | null
    const homeTeamId = (matchRow as any).home_team_id as string | null
    const awayTeamId = (matchRow as any).away_team_id as string | null

    if (!teamId || (teamId !== homeTeamId && teamId !== awayTeamId)) {
      return NextResponse.json({ error: "Jugador no pertenece a este partido" }, { status: 400 })
    }

    const { error: updateError } = await auth.adminClient
      .from("players")
      .update({ jersey_number: jerseyNumber })
      .eq("id", playerId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/mesa/matches/[id]/jerseys failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
