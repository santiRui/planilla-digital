import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const createPlayerSchema = z.object({
  teamId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dni: z.string().min(1),
  birthDate: z.string().min(1), // YYYY-MM-DD
  jerseyNumber: z.number().int().min(0).max(99),
  heightCm: z.number().int().min(0).optional().nullable(),
  isFederated: z.boolean().optional().default(true),
  federatedCategory: z.enum(["mayores", "intermedia"]).optional().nullable(),
  labasSeasons: z.number().int().min(0).optional().default(0),
  photoUrl: z.string().url().optional().nullable(),
})

function computeAgeFromBirthDate(birthDate: string): number | null {
  const d = new Date(birthDate)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
    age -= 1
  }
  return age
}

function computePlayerScoring(params: {
  birthDate: string
  isFederated: boolean
  federatedCategory: "mayores" | "intermedia" | null
  labasSeasons: number
}): number {
  const age = computeAgeFromBirthDate(params.birthDate)

  // 1) Base por federada / amateur
  let base = 0
  if (params.isFederated) {
    if (params.federatedCategory === "mayores") base = 400
    else if (params.federatedCategory === "intermedia") base = 200
  } else if (age != null) {
    // Amateur: derivamos mayor/menor de 25 por edad
    base = age >= 25 ? 100 : 150
  }

  // 2) Ajuste por edad
  let ageAdj = 0
  if (age != null) {
    if (age >= 50) ageAdj = -75
    else if (age >= 40) ageAdj = -20
    else if (age >= 30) ageAdj = -10
  }

  // 3) Ajuste por trayectoria Labas
  const seasons = params.labasSeasons || 0
  let labasAdj = 0
  if (seasons >= 2) labasAdj = -10

  return base + ageAdj + labasAdj
}

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
      .select(
        "id, team_id, first_name, last_name, dni, birth_date, jersey_number, height_cm, is_federated, federated_category, labas_seasons, scoring, photo_url, created_at",
      )
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

    const { teamId, firstName, lastName, dni, birthDate, jerseyNumber, heightCm, isFederated, federatedCategory, labasSeasons, photoUrl } =
      parsed.data

    const scoring = computePlayerScoring({
      birthDate,
      isFederated,
      federatedCategory: federatedCategory ?? null,
      labasSeasons,
    })

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
        federated_category: federatedCategory ?? null,
        labas_seasons: labasSeasons ?? 0,
        scoring,
        photo_url: photoUrl ?? null,
      })
      .select(
        "id, team_id, first_name, last_name, dni, birth_date, jersey_number, height_cm, is_federated, federated_category, labas_seasons, scoring, photo_url, created_at",
      )
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
