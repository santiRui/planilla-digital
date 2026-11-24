import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { validateTeamSelection } from "@/lib/preplanilla-state"

const teamStateSchema = z.object({
  staffIds: z.array(z.string()),
  selectedPlayerIds: z.array(z.string()),
  jerseyByPlayerId: z.record(z.number().int().min(0).max(999)),
  starters: z.array(z.string()),
  captainId: z.string().nullable(),
  confirmed: z.boolean(),
})

const savePreplanillaSchema = z.object({
  homeState: teamStateSchema,
  awayState: teamStateSchema,
})

async function assertMesaPreplanillaRole(accessToken: string, matchId: string) {
  const adminClient = createSupabaseAdminClient()
  const userClient = createSupabaseServerClient(accessToken)

  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false as const, status: 401, error: "No autorizado" }
  }

  const callerId = userData.user.id

  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from("profiles")
    .select("role, is_table_official, is_referee")
    .eq("id", callerId)
    .maybeSingle()

  if (callerProfileError) {
    return { ok: false as const, status: 400, error: callerProfileError.message }
  }

  const role = (callerProfile?.role as string | undefined) ?? ""
  const isTableOfficial = Boolean((callerProfile as any)?.is_table_official)

  if (role === "admin") {
    return { ok: true as const, adminClient, callerId, role }
  }

  if (role === "oficial_mesa") {
    return { ok: true as const, adminClient, callerId, role }
  }

  // Permitir cuentas con rol principal 'arbitro' pero que también son oficiales de mesa.
  if (role === "arbitro" && isTableOfficial) {
    return { ok: true as const, adminClient, callerId, role }
  }

  if (role !== "oficial_mesa") {
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

    const auth = await assertMesaPreplanillaRole(accessToken, matchId)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => null)
    const parsed = savePreplanillaSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { homeState, awayState } = parsed.data
    const { data: matchRow, error: matchError } = await auth.adminClient
      .from("matches")
      .select("home_team_id, away_team_id")
      .eq("id", matchId)
      .maybeSingle()
    if (matchError || !matchRow) {
      return NextResponse.json({ error: matchError?.message ?? "Partido no encontrado" }, { status: 404 })
    }

    const { data: players, error: playersError } = await auth.adminClient
      .from("players")
      .select("id, team_id, jersey_number")
      .in("team_id", [matchRow.home_team_id, matchRow.away_team_id])
    if (playersError) return NextResponse.json({ error: playersError.message }, { status: 400 })
    const rosterById = new Map((players ?? []).map((player) => [player.id, player]))

    for (const [label, teamId, teamState] of [
      ["local", matchRow.home_team_id, homeState],
      ["visitante", matchRow.away_team_id, awayState],
    ] as const) {
      const invalid = validateTeamSelection(teamState, teamId, label, rosterById)
      if (invalid) return NextResponse.json({ error: invalid.error }, { status: invalid.status })
    }

    const { data: saved, error: upsertError } = await auth.adminClient
      .from("match_preplanilla_state")
      .upsert({
        match_id: matchId,
        home_state: homeState,
        away_state: awayState,
        updated_at: new Date().toISOString(),
      }, { onConflict: "match_id" })
      .select("match_id")
      .single()

    if (upsertError || !saved) {
      return NextResponse.json({ error: upsertError?.message ?? "No se pudo guardar la preplanilla" }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/mesa/matches/[id]/preplanilla failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: matchId } = await ctx.params

    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertMesaPreplanillaRole(accessToken, matchId)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { data, error } = await auth.adminClient
      .from("match_preplanilla_state")
      .select("home_state, away_state")
      .eq("match_id", matchId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (!data) {
      return NextResponse.json({ error: "Sin preplanilla" }, { status: 404 })
    }

    return NextResponse.json({
      homeState: (data as any).home_state,
      awayState: (data as any).away_state,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/mesa/matches/[id]/preplanilla failed:", e)
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

    const auth = await assertMesaPreplanillaRole(accessToken, matchId)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { error } = await auth.adminClient.from("match_preplanilla_state").delete().eq("match_id", matchId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("DELETE /api/mesa/matches/[id]/preplanilla failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
