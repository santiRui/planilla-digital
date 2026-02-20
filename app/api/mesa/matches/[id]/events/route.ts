import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const eventSchema = z.object({
  id: z.string(),
  matchId: z.string(),
  teamId: z.string(),
  // Algunos eventos (como timeout) no necesitan jugador asociado
  playerId: z.string().optional().nullable(),
  type: z.enum([
    "points",
    "shot",
    "free_throw",
    "rebound",
    "assist",
    "turnover",
    "steal",
    "block",
    "foul",
    "timeout",
    "substitution_in",
    "substitution_out",
  ]),
  points: z.number().int().min(1).max(3).optional().nullable(),
  shotType: z.number().int().min(2).max(3).optional().nullable(),
  made: z.boolean().optional().nullable(),
  x: z.number().optional().nullable(),
  y: z.number().optional().nullable(),
  reboundType: z.enum(["offensive", "defensive"]).optional().nullable(),
  foulType: z.enum(["personal", "technical", "unsportsmanlike", "disqualifying", "fight"]).optional().nullable(),
  period: z.number().int().min(1),
  gameTime: z.string(),
  timestamp: z.string().datetime().optional().nullable(),
})

async function assertMesaEventsRole(accessToken: string, matchId: string) {
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
  if (role !== "admin" && role !== "oficial_mesa" && role !== "arbitro") {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  if (role !== "admin") {
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
  }

  return { ok: true as const, adminClient, callerId }
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

    const auth = await assertMesaEventsRole(accessToken, matchId)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => null)
    const parsed = eventSchema.safeParse(body?.event ?? body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const ev = parsed.data

    if (ev.matchId !== matchId) {
      return NextResponse.json({ error: "matchId no coincide" }, { status: 400 })
    }

    const occurredAt = ev.timestamp ? new Date(ev.timestamp) : new Date()

    const insertRow: any = {
      match_id: ev.matchId,
      team_id: ev.teamId,
      player_id: ev.playerId,
      type: ev.type,
      points: ev.points ?? null,
      period: ev.period,
      game_time: ev.gameTime,
      occurred_at: occurredAt.toISOString(),
      created_by: auth.callerId,
      shot_type: ev.shotType ?? null,
      made: ev.made ?? null,
      x: ev.x ?? null,
      y: ev.y ?? null,
      rebound_type: ev.reboundType ?? null,
      foul_type: ev.foulType ?? null,
    }

    const { data, error } = await auth.adminClient
      .from("match_events")
      .insert(insertRow)
      .select("id, match_id, team_id, player_id, type, points, period, game_time, occurred_at, created_by, shot_type, made, x, y, rebound_type, foul_type")
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "No se pudo insertar evento" }, { status: 400 })
    }

    return NextResponse.json({ event: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/mesa/matches/[id]/events failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: matchId } = await ctx.params

    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertMesaEventsRole(accessToken, matchId)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => null)
    const eventId: string | undefined = body?.eventId

    if (!eventId) {
      return NextResponse.json({ error: "eventId requerido" }, { status: 400 })
    }

    const { error } = await auth.adminClient
      .from("match_events")
      .delete()
      .eq("id", eventId)
      .eq("match_id", matchId)

    // Para simplificar el manejo en cliente y evitar ruido con respuestas 400,
    // siempre devolvemos 200 aquí. Si hubo un error de Supabase, lo informamos
    // en el payload pero no como código HTTP 4xx.
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 200 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("DELETE /api/mesa/matches/[id]/events failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
