import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const createTeamSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().optional().nullable(),
  categoryIds: z.array(z.string().min(1)).optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().min(1),
  secondaryColor: z.string().min(1),
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

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    const auth = await assertAdmin(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const [{ data: teams, error: teamsError }, { data: links, error: linksError }] = await Promise.all([
      auth.adminClient
        .from("teams")
        .select("id, name, logo_url, primary_color")
        .order("name", { ascending: true }),
      auth.adminClient.from("team_categories").select("team_id, category_id"),
    ])

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 400 })
    }
    if (linksError) {
      return NextResponse.json({ error: linksError.message }, { status: 400 })
    }

    const categoryByTeamId: Record<string, string | null> = {}
    for (const row of (links ?? []) as any[]) {
      const teamId = String(row.team_id)
      const categoryId = row.category_id ? String(row.category_id) : null
      if (!teamId || !categoryId) continue
      if (!categoryByTeamId[teamId]) categoryByTeamId[teamId] = categoryId
    }

    const payload = (teams ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      logo_url: t.logo_url ?? null,
      primary_color: t.primary_color ?? null,
      category_id: categoryByTeamId[String(t.id)] ?? null,
    }))

    return NextResponse.json({ teams: payload })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/teams failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    const adminCheck = await assertAdmin(accessToken)
    if (!adminCheck.ok) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status })
    }

    const body = await req.json().catch(() => null)
    const parsed = createTeamSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const adminClient = adminCheck.adminClient

    const { name, categoryId, categoryIds, logoUrl, primaryColor, secondaryColor } = parsed.data

    const categories = (categoryIds ?? []).filter(Boolean)
    if (categories.length === 0 && categoryId) categories.push(categoryId)

    // Validar unicidad de nombre dentro de las categorías asociadas (evita duplicados en un mismo torneo)
    if (categories.length > 0) {
      const { data: existingLinks, error: existingLinksError } = await adminClient
        .from("team_categories")
        .select("team_id, category_id")
        .in("category_id", categories)

      if (existingLinksError) {
        return NextResponse.json({ error: existingLinksError.message }, { status: 400 })
      }

      const teamIds = Array.from(
        new Set((existingLinks ?? []).map((r: any) => r.team_id as string | null).filter(Boolean)),
      ) as string[]

      if (teamIds.length > 0) {
        const { data: teamsWithSameName, error: existingTeamsError } = await adminClient
          .from("teams")
          .select("id, name")
          .in("id", teamIds)
          .ilike("name", name)

        if (existingTeamsError) {
          return NextResponse.json({ error: existingTeamsError.message }, { status: 400 })
        }

        if ((teamsWithSameName ?? []).length > 0) {
          return NextResponse.json(
            { error: "Ya existe un equipo con ese nombre en este torneo/categoría." },
            { status: 400 },
          )
        }
      }
    }

    const { data: team, error } = await adminClient
      .from("teams")
      .insert({
        name,
        logo_url: logoUrl ?? null,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
      })
      .select("id, name, logo_url, primary_color, secondary_color, created_at")
      .single()

    if (error || !team) {
      return NextResponse.json({ error: error?.message ?? "No se pudo crear el equipo" }, { status: 400 })
    }

    if (categories.length > 0) {
      const { error: linkError } = await adminClient
        .from("team_categories")
        .insert(categories.map((cid) => ({ team_id: (team as any).id, category_id: cid })))

      if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 400 })
      }
    }

    return NextResponse.json({ team: { ...team, categoryIds: categories } })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/teams failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
