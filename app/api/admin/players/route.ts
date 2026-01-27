import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const createPlayerSchema = z.object({
  teamId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dni: z.string().min(1),
  birthDate: z.string().min(1),
  jerseyNumber: z.number().int().min(0).max(99),
  heightCm: z.number().int().min(0).optional().nullable(),
  isFederated: z.boolean().optional().default(true),
  photoUrl: z.string().url().optional().nullable(),
})

async function assertAdmin(accessToken: string) {
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

  if (callerProfile?.role !== "admin") {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  return { ok: true as const, adminClient }
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertAdmin(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { data, error } = await auth.adminClient
      .from("players")
      .select("id, team_id, first_name, last_name, dni, birth_date, jersey_number, height_cm, is_federated, photo_url, created_at")
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ players: data ?? [] })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/players failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertAdmin(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => null)
    const parsed = createPlayerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { teamId, firstName, lastName, dni, birthDate, jerseyNumber, heightCm, isFederated, photoUrl } = parsed.data

    const { data: player, error } = await auth.adminClient
      .from("players")
      .insert({
        team_id: teamId,
        first_name: firstName,
        last_name: lastName,
        dni,
        birth_date: birthDate,
        jersey_number: jerseyNumber,
        height_cm: heightCm ?? null,
        is_federated: isFederated,
        photo_url: photoUrl ?? null,
      })
      .select("id, team_id, first_name, last_name, dni, birth_date, jersey_number, height_cm, is_federated, photo_url, created_at")
      .single()

    if (error || !player) {
      return NextResponse.json({ error: error?.message ?? "No se pudo crear el jugador" }, { status: 400 })
    }

    return NextResponse.json({ player })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/players failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
