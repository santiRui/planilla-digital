import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const updateTeamSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().optional().nullable(),
  categoryIds: z.array(z.string().min(1)).optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().min(1),
  secondaryColor: z.string().min(1),
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
    const parsed = updateTeamSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { name, categoryId, categoryIds, logoUrl, primaryColor, secondaryColor } = parsed.data

    const categories = (categoryIds ?? []).filter(Boolean)
    if (categories.length === 0 && categoryId) categories.push(categoryId)

    const { data: team, error } = await auth.adminClient
      .from("teams")
      .update({
        name,
        logo_url: logoUrl ?? null,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
      })
      .eq("id", id)
      .select("id, name, logo_url, primary_color, secondary_color, created_at")
      .single()

    if (error || !team) {
      return NextResponse.json({ error: error?.message ?? "No se pudo actualizar el equipo" }, { status: 400 })
    }

    const { error: deleteLinksError } = await auth.adminClient.from("team_categories").delete().eq("team_id", id)
    if (deleteLinksError) {
      return NextResponse.json({ error: deleteLinksError.message }, { status: 400 })
    }

    if (categories.length > 0) {
      const { error: insertLinksError } = await auth.adminClient
        .from("team_categories")
        .insert(categories.map((cid) => ({ team_id: id, category_id: cid })))

      if (insertLinksError) {
        return NextResponse.json({ error: insertLinksError.message }, { status: 400 })
      }
    }

    return NextResponse.json({ team: { ...team, categoryIds: categories } })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("PATCH /api/admin/teams/[id] failed:", e)
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

    // Primero eliminar relaciones en tablas que dependan del equipo (por ahora team_categories)
    const { error: linksError } = await auth.adminClient.from("team_categories").delete().eq("team_id", id)
    if (linksError) {
      return NextResponse.json({ error: linksError.message }, { status: 400 })
    }

    const { error } = await auth.adminClient.from("teams").delete().eq("id", id)
    if (error) {
      // Es probable que queden otras referencias (jugadores, partidos, etc.)
      return NextResponse.json(
        { error: "No se pudo eliminar el equipo. Verificá que no tenga jugadores o partidos asociados." },
        { status: 400 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("DELETE /api/admin/teams/[id] failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
