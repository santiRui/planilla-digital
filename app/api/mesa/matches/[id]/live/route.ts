import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const liveUpdateSchema = z.object({
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  period: z.number().int().min(1),
  gameTime: z.number().int().min(0),
})

async function assertMesaLiveRole(accessToken: string, matchId: string) {
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

  // Permitir que cualquier usuario con rol 'oficial_mesa' pueda actualizar
  // el marcador en vivo, aunque no esté asignado explícitamente al partido.
  // Si el rol es distinto, devolvemos un error explícito con el rol leído
  // desde la tabla profiles para poder depurar.
  if (role !== "oficial_mesa") {
    console.warn("/api/mesa/matches/[id]/live: rol no permitido", { callerId, role })
    return {
      ok: false as const,
      status: 403,
      error: `Prohibido (profiles.role = "${role}")`,
    }
  }

  return { ok: true as const, adminClient, callerId, role }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: matchId } = await ctx.params

    const authHeader = req.headers.get("authorization")
    const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = tokenMatch?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertMesaLiveRole(accessToken, matchId)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => null)
    const parsed = liveUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { homeScore, awayScore, period, gameTime } = parsed.data

    const { error: updateError } = await auth.adminClient
      .from("matches")
      .update({
        live_home_score: homeScore,
        live_away_score: awayScore,
        live_period: period,
        live_game_time: Math.floor(gameTime),
        live_updated_at: new Date().toISOString(),
      })
      .eq("id", matchId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/mesa/matches/[id]/live failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
