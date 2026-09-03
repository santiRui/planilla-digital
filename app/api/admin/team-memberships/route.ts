import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const assignMembershipSchema = z.object({
  teamId: z.string().min(1),
  games: z.number().int().positive(),
})

async function assertAdmin(accessToken: string | null | undefined) {
  const adminClient = createSupabaseAdminClient()
  const userClient = createSupabaseServerClient(accessToken || "")

  if (!accessToken) {
    return { ok: false as const, status: 401, error: "No autorizado" }
  }

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

  if (callerProfile?.role !== "admin") {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  return { ok: true as const, adminClient }
}

// Asignar una nueva membresía (suma juegos a las existentes)
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    const auth = await assertAdmin(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => null)
    const parsed = assignMembershipSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { teamId, games } = parsed.data

    const { data, error } = await auth.adminClient
      .from("team_memberships")
      .insert({ team_id: teamId, remaining_games: games })
      .select("id, team_id, remaining_games, created_at, updated_at")
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "No se pudo asignar la membresía" }, { status: 400 })
    }

    return NextResponse.json({ membership: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/team-memberships failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Resumen de equipos con membresía activa (partidos restantes)
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    const auth = await assertAdmin(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { data, error } = await auth.adminClient
      .from("team_memberships")
      .select("team_id, remaining_games")

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "No se pudieron cargar las membresías" }, { status: 400 })
    }

    const totals: Record<string, number> = {}
    for (const row of data as any[]) {
      const teamId = String(row.team_id)
      const remaining = Number(row.remaining_games) || 0
      totals[teamId] = (totals[teamId] ?? 0) + remaining
    }

    return NextResponse.json({ totals })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/team-memberships failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
