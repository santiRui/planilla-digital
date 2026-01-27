import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const updatePersonalSchema = z
  .object({
    fullName: z.string().min(1),
    role: z.enum(["arbitro", "oficial_mesa"]).optional(),
    roles: z.array(z.enum(["arbitro", "oficial_mesa"])) .optional(),
    isReferee: z.boolean().optional(),
    isTableOfficial: z.boolean().optional(),
    phone: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const roles = Array.isArray(data.roles) ? data.roles : []
    const isReferee = data.isReferee ?? roles.includes("arbitro")
    const isTableOfficial = data.isTableOfficial ?? roles.includes("oficial_mesa")
    const hasLegacyRole = Boolean(data.role)

    if (!hasLegacyRole && !isReferee && !isTableOfficial) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe tener al menos un rol" })
    }
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
    const parsed = updatePersonalSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const roles = Array.isArray(parsed.data.roles) ? parsed.data.roles : []
    const legacyRole = parsed.data.role

    const isReferee =
      parsed.data.isReferee !== undefined
        ? parsed.data.isReferee
        : roles.includes("arbitro") || legacyRole === "arbitro"

    const isTableOfficial =
      parsed.data.isTableOfficial !== undefined
        ? parsed.data.isTableOfficial
        : roles.includes("oficial_mesa") || legacyRole === "oficial_mesa"

    const primaryRole = legacyRole
      ? legacyRole
      : isReferee
        ? "arbitro"
        : "oficial_mesa"

    const { fullName, phone } = parsed.data

    const { data: updated, error } = await auth.adminClient
      .from("profiles")
      .update({
        full_name: fullName,
        role: primaryRole,
        phone: phone ?? null,
        is_referee: Boolean(isReferee),
        is_table_official: Boolean(isTableOfficial),
      })
      .eq("id", id)
      .select("id, full_name, phone, role, is_referee, is_table_official, created_at")
      .single()

    if (error || !updated) {
      return NextResponse.json({ error: error?.message ?? "No se pudo actualizar" }, { status: 400 })
    }

    const { data: userData, error: userError } = await auth.adminClient.auth.admin.getUserById(id)

    return NextResponse.json({
      person: {
        ...updated,
        email: userError ? null : userData.user?.email ?? null,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("PATCH /api/admin/personal/[id] failed:", e)
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

    const { data: profile, error: profileError } = await auth.adminClient
      .from("profiles")
      .select("role")
      .eq("id", id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    if (profile?.role === "admin") {
      return NextResponse.json({ error: "No se puede eliminar un admin" }, { status: 400 })
    }

    const { error } = await auth.adminClient.auth.admin.deleteUser(id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("DELETE /api/admin/personal/[id] failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
