import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const createUserSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(6),
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

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization")
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  const accessToken = match?.[1]

  if (!accessToken) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = createUserSchema.safeParse(body)

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

  if (callerProfileError || callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 })
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

  const { email, password, fullName, phone } = parsed.data

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  })

  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? "No se pudo crear el usuario" }, { status: 400 })
  }

  const newUserId = created.user.id

  const { error: upsertError } = await adminClient.from("profiles").upsert({
    id: newUserId,
    full_name: fullName,
    role: primaryRole,
    phone: phone ?? null,
    is_referee: Boolean(isReferee),
    is_table_official: Boolean(isTableOfficial),
  })

  if (upsertError) {
    return NextResponse.json({
      error: "Usuario creado, pero no se pudo actualizar el perfil",
      details: upsertError.message,
    })
  }

  return NextResponse.json({
    id: newUserId,
    email: created.user.email,
    fullName,
    role: primaryRole,
    isReferee: Boolean(isReferee),
    isTableOfficial: Boolean(isTableOfficial),
    phone: phone ?? null,
  })
}
