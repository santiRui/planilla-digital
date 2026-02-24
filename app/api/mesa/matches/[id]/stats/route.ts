import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const playerStatSchema = z.object({
  playerId: z.string().uuid(),
  teamId: z.string().uuid(),
  minutes: z.number(),
  points: z.number().int(),
  t1Made: z.number().int(),
  t1Att: z.number().int(),
  t2Made: z.number().int(),
  t2Att: z.number().int(),
  t3Made: z.number().int(),
  t3Att: z.number().int(),
  rebounds: z.number().int(),
  assists: z.number().int(),
  steals: z.number().int(),
  turnovers: z.number().int(),
  blocksCommitted: z.number().int(),
  blocksReceived: z.number().int(),
  foulsCommitted: z.number().int(),
  foulsReceived: z.number().int(),
  rating: z.number().int(),
})

const bodySchema = z.object({
  stats: z.array(playerStatSchema),
})

async function assertMesaRole(accessToken: string, matchId: string) {
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
  if (role !== "admin" && role !== "arbitro" && role !== "oficial_mesa") {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  // Para guardar stats exigimos al menos rol de oficial de mesa o admin
  if (role === "arbitro") {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  // Verificamos que esté asignado al partido como oficial de mesa si no es admin
  if (role === "oficial_mesa") {
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

    const auth = await assertMesaRole(accessToken, matchId)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)

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
      rebounds: s.rebounds,
      assists: s.assists,
      steals: s.steals,
      turnovers: s.turnovers,
      blocks_committed: s.blocksCommitted,
      blocks_received: s.blocksReceived,
      fouls_committed: s.foulsCommitted,
      fouls_received: s.foulsReceived,
      rating: s.rating,
    }))

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 })
    }

    const { error } = await auth.adminClient
      .from("match_player_stats")
      .upsert(rows, { onConflict: "match_id,player_id" })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, inserted: rows.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/mesa/matches/[id]/stats failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
