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

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const parsed = createTeamSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const adminClient = createSupabaseAdminClient()
    const userClient = createSupabaseServerClient(accessToken)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const callerId = userData.user.id
    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .maybeSingle()

    if (callerProfileError) {
      return NextResponse.json({ error: callerProfileError.message }, { status: 400 })
    }

    if (callerProfile?.role !== "admin") {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 })
    }

    const { name, categoryId, categoryIds, logoUrl, primaryColor, secondaryColor } = parsed.data

    const categories = (categoryIds ?? []).filter(Boolean)
    if (categories.length === 0 && categoryId) categories.push(categoryId)

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
