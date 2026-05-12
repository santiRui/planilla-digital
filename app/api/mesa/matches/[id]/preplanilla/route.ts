import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

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

  if (role !== "oficial_mesa") {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  // Permitir a oficiales de mesa usar pre-planilla sin depender de asignaciones explícitas,
  // para soportar el flujo multi-dispositivo.
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

    const { error: upsertError } = await auth.adminClient
      .from("match_preplanilla_state")
      .upsert({
        match_id: matchId,
        home_state: homeState,
        away_state: awayState,
        updated_at: new Date().toISOString(),
      })
      .eq("match_id", matchId)

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 })
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
    })
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
