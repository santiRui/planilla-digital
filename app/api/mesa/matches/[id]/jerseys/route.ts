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
    .select("role, is_table_official")
    .eq("id", callerId)
    .maybeSingle()

  if (callerProfileError) {
    return { ok: false as const, status: 400, error: callerProfileError.message }
  }

  const role = (callerProfile?.role as string | undefined) ?? ""
  if (role === "admin") {
    return { ok: true as const, adminClient, callerId, role }
  }

  if (role !== "oficial_mesa" && !(role === "arbitro" && callerProfile?.is_table_official)) {
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

    const { data: updated, error: updateError } = await auth.adminClient
      .from("players")
      .update({ jersey_number: jerseyNumber })
      .eq("id", playerId)
      .eq("team_id", teamId)
      .select("id, jersey_number")
      .single()

    if (updateError || !updated) {
      if (updateError?.code === "23505") {
        return NextResponse.json({ error: "Ese número ya pertenece a otro jugador del equipo" }, { status: 409 })
      }
      return NextResponse.json({ error: updateError?.message ?? "No se pudo actualizar el dorsal" }, { status: 400 })
    }

    return NextResponse.json({ ok: true, jerseyNumber: updated.jersey_number })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/mesa/matches/[id]/jerseys failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
