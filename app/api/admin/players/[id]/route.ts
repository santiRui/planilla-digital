import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const updatePlayerSchema = z.object({
  teamId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dni: z.string().min(1),
  birthDate: z.string().min(1), // YYYY-MM-DD
  jerseyNumber: z.number().int().min(0),
  heightCm: z.number().int().min(0).optional().nullable(),
  isFederated: z.boolean(),
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

  let base = 0
  if (params.isFederated) {
    // Por ahora todas las categorías federadas suman 400.
    base = 400
  } else if (age != null) {
    base = age >= 25 ? 100 : 150
  }

  let ageAdj = 0
  if (age != null) {
    if (age >= 50) ageAdj = -75
    else if (age >= 40) ageAdj = -20
    else if (age >= 30) ageAdj = -10
  }

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

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
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
    const parsed = updatePlayerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { teamId, firstName, lastName, dni, birthDate, jerseyNumber, heightCm, isFederated, federatedCategory, labasSeasons, photoUrl } =
      parsed.data

    const { data: current, error: currentError } = await auth.adminClient
      .from("players")
      .select("team_id, is_federated, federated_category")
      .eq("id", id)
      .maybeSingle()
    if (currentError || !current) {
      return NextResponse.json({ error: currentError?.message ?? "Jugador no encontrado" }, { status: 404 })
    }

    const normalizedCategory = isFederated ? federatedCategory ?? null : null
    const unchangedFederation = current.team_id === teamId && current.is_federated === isFederated &&
      (current.federated_category === normalizedCategory ||
        (current.federated_category === "mayores" && normalizedCategory === "primera") ||
        (current.federated_category === "intermedia" && normalizedCategory === "segunda"))
    if (!unchangedFederation) {
      const limitCheck = await checkFederatedLimit({
        adminClient: auth.adminClient,
        teamId,
        isFederated,
        federatedCategory: normalizedCategory,
        excludePlayerId: id,
      })
      if (!limitCheck.ok) {
        return NextResponse.json({ error: limitCheck.error }, { status: 400 })
      }
    }

    const scoring = computePlayerScoring({
      birthDate,
      isFederated,
      federatedCategory: normalizedCategory,
      labasSeasons,
    })

    const { data: player, error } = await auth.adminClient
      .from("players")
      .update({
        team_id: teamId,
        first_name: firstName,
        last_name: lastName,
        dni,
        birth_date: birthDate,
        jersey_number: jerseyNumber,
        height_cm: heightCm ?? null,
        is_federated: isFederated,
        federated_category: normalizedCategory,
        labas_seasons: labasSeasons ?? 0,
        scoring,
        photo_url: photoUrl ?? null,
      })
      .eq("id", id)
      .select(
        "id, team_id, first_name, last_name, dni, birth_date, jersey_number, height_cm, is_federated, federated_category, labas_seasons, scoring, photo_url, created_at",
      )
      .single()

    if (error || !player) {
      return NextResponse.json({ error: error?.message ?? "No se pudo actualizar el jugador" }, { status: 400 })
    }

    return NextResponse.json({ player })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("PATCH /api/admin/players/[id] failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
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

    const { error } = await auth.adminClient.from("players").delete().eq("id", id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("DELETE /api/admin/players/[id] failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
