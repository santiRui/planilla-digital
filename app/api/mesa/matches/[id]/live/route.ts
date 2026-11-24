import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const liveUpdateSchema = z.object({
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  period: z.number().int().min(1),
  gameTime: z.number().int().min(0),
  state: z.object({
    onCourtPlayers: z.object({ home: z.array(z.string()), away: z.array(z.string()) }),
    playerSeconds: z.record(z.number().nonnegative()),
  }).passthrough().optional(),
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

    const { homeScore, awayScore, period, gameTime, state } = parsed.data

    const { data: updated, error: updateError } = await auth.adminClient
      .from("matches")
      .update({
        live_home_score: homeScore,
        live_away_score: awayScore,
        live_period: period,
        live_game_time: Math.floor(gameTime),
        ...(state ? { live_state: state } : {}),
        live_updated_at: new Date().toISOString(),
      })
      .eq("id", matchId)
      .eq("status", "en_juego")
      .select("id")
      .maybeSingle()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }
    if (!updated) {
      return NextResponse.json({ error: "El partido ya no está en juego" }, { status: 409 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/mesa/matches/[id]/live failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: matchId } = await ctx.params
    const accessToken = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const auth = await assertMesaLiveRole(accessToken, matchId)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await auth.adminClient
      .from("matches")
      .select("id, status, home_score, away_score, live_home_score, live_away_score, live_period, live_game_time, live_updated_at, live_state")
      .eq("id", matchId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!data) return NextResponse.json({ error: "Partido no encontrado" }, { status: 404 })

    return NextResponse.json({ live: data }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    console.error("GET /api/mesa/matches/[id]/live failed:", e)
    return NextResponse.json({ error: "No se pudo cargar el estado del partido" }, { status: 500 })
  }
}
