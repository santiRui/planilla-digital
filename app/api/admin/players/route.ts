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
  jerseyNumber: z.number().int().min(0),
  heightCm: z.number().int().min(0).optional().nullable(),
  isFederated: z.boolean().optional().default(false),
  federatedCategory: z.enum(["u21", "u23", "primera", "segunda"]).optional().nullable(),
  labasSeasons: z.number().int().min(0).optional().default(0),
  photoUrl: z.string().url().optional().nullable(),
}).refine((player) => !player.isFederated || !!player.federatedCategory, {
  message: "Seleccioná la categoría federada.",
  path: ["federatedCategory"],
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

type FederatedCategory = "u21" | "u23" | "primera" | "segunda"

const FED_LIMIT_COLUMN = {
  u21: "federated_u21_limit",
  u23: "federated_u23_limit",
  primera: "federated_primera_limit",
  segunda: "federated_segunda_limit",
} as const satisfies Record<FederatedCategory, string>

const FED_LABEL: Record<FederatedCategory, string> = {
  u21: "U21",
  u23: "U23",
  primera: "Primera",
  segunda: "Segunda",
}

// Valida el límite de federados por categoría para el equipo del jugador.
// Devuelve { ok } o { ok:false, error } si se supera el cupo.
async function checkFederatedLimit(params: {
  adminClient: ReturnType<typeof createSupabaseAdminClient>
  teamId: string
  isFederated: boolean
  federatedCategory: FederatedCategory | null
  excludePlayerId?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { adminClient, teamId, isFederated, federatedCategory, excludePlayerId } = params

  if (!isFederated || !federatedCategory) return { ok: true }

  const limitColumn = FED_LIMIT_COLUMN[federatedCategory]

  // Categorías a las que pertenece el equipo
  const { data: linkRows, error: linkError } = await adminClient
    .from("team_categories")
    .select("category_id")
    .eq("team_id", teamId)

  if (linkError) return { ok: false, error: linkError.message }

  const categoryIds = (linkRows ?? []).map((r) => r.category_id as string).filter(Boolean)
  if (categoryIds.length === 0) return { ok: true }

  const { data: catRows, error: catError } = await adminClient
    .from("categories")
    .select("id, name, federated_u21_limit, federated_u23_limit, federated_primera_limit, federated_segunda_limit")
    .in("id", categoryIds)

  if (catError) return { ok: false, error: catError.message }

  // Límite efectivo = el más restrictivo (menor) entre las categorías del equipo
  let effectiveLimit: number | null = null
  let limitingCategoryName = ""
  for (const c of catRows ?? []) {
    const lim = c[limitColumn]
    if (lim == null) continue
    if (effectiveLimit == null || Number(lim) < effectiveLimit) {
      effectiveLimit = Number(lim)
      limitingCategoryName = String(c.name ?? "")
    }
  }

  if (effectiveLimit == null) return { ok: true }

  // Contamos los federados de ese tipo que ya tiene el equipo (excluyendo el que se edita)
  let countQuery = adminClient
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("is_federated", true)
    .eq("federated_category", federatedCategory)

  if (excludePlayerId) {
    countQuery = countQuery.neq("id", excludePlayerId)
  }

  const { count, error: countError } = await countQuery
  if (countError) return { ok: false, error: countError.message }

  const existing = count ?? 0
  if (existing + 1 > effectiveLimit) {
    return {
      ok: false,
      error: `Se alcanzó el límite de federados ${FED_LABEL[federatedCategory]} (${effectiveLimit}) para la categoría ${limitingCategoryName}.`,
    }
  }

  return { ok: true }
}

function computePlayerScoring(params: {
  birthDate: string
  isFederated: boolean
  federatedCategory: FederatedCategory | null
  labasSeasons: number
}): number {
  const age = computeAgeFromBirthDate(params.birthDate)

  // 1) Base por federada / amateur
  let base = 0
  if (params.isFederated) {
    // Por ahora todas las categorías federadas (U21, U23, Primera, Segunda) suman 400.
    base = 400
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

async function findPlayerConflictByDniAndCategory(params: {
  adminClient: ReturnType<typeof createSupabaseAdminClient>
  teamId: string
  dni: string
}) {
  const { adminClient, teamId, dni } = params

  const { data: teamCats, error: teamCatsError } = await adminClient
    .from("team_categories")
    .select("category_id")
    .eq("team_id", teamId)

  if (teamCatsError) {
    return { error: teamCatsError.message }
  }

  const categoryIds = (teamCats ?? []).map((c: any) => c.category_id as string).filter(Boolean)
  if (categoryIds.length === 0) {
    return { conflict: false as const }
  }

  const { data: links, error: linksError } = await adminClient
    .from("team_categories")
    .select("team_id")
    .in("category_id", categoryIds)

  if (linksError) {
    return { error: linksError.message }
  }

  const teamIds = Array.from(new Set((links ?? []).map((r: any) => r.team_id as string | null).filter(Boolean))) as string[]
  if (teamIds.length === 0) {
    return { conflict: false as const }
  }

  const { data: playersWithSameDni, error: playersError } = await adminClient
    .from("players")
    .select("id, team_id, dni")
    .eq("dni", dni)
    .in("team_id", teamIds)

  if (playersError) {
    return { error: playersError.message }
  }

  const conflictExists = (playersWithSameDni ?? []).length > 0
  return { conflict: conflictExists }
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
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { teamId, firstName, lastName, dni, birthDate, jerseyNumber, heightCm, isFederated, federatedCategory, labasSeasons, photoUrl } =
      parsed.data

    const scoring = computePlayerScoring({
      birthDate,
      isFederated,
      federatedCategory: isFederated ? federatedCategory ?? null : null,
      labasSeasons,
    })

    const limitCheck = await checkFederatedLimit({
      adminClient: auth.adminClient,
      teamId,
      isFederated,
      federatedCategory: isFederated ? federatedCategory ?? null : null,
    })
    if (!limitCheck.ok) {
      return NextResponse.json({ error: limitCheck.error }, { status: 400 })
    }

    const conflictCheck = await findPlayerConflictByDniAndCategory({
      adminClient: auth.adminClient,
      teamId,
      dni,
    })

    if (conflictCheck.error) {
      return NextResponse.json({ error: conflictCheck.error }, { status: 400 })
    }

    if (conflictCheck.conflict) {
      return NextResponse.json(
        { error: "Ya existe una jugadora con ese DNI registrada en esta categoría." },
        { status: 400 },
      )
    }

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
        federated_category: isFederated ? federatedCategory ?? null : null,
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
