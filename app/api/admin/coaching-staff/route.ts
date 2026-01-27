import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const createCoachingStaffSchema = z.object({
  teamId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["tecnico", "asistente", "delegado"]),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
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
      .from("coaching_staff")
      .select("id, team_id, first_name, last_name, role, phone, email, created_at")
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ staff: data ?? [] })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/coaching-staff failed:", e)
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
    const parsed = createCoachingStaffSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { teamId, firstName, lastName, role, phone, email } = parsed.data

    const { data: row, error } = await auth.adminClient
      .from("coaching_staff")
      .insert({
        team_id: teamId,
        first_name: firstName,
        last_name: lastName,
        role,
        phone: phone ?? null,
        email: email ?? null,
      })
      .select("id, team_id, first_name, last_name, role, phone, email, created_at")
      .single()

    if (error || !row) {
      return NextResponse.json({ error: error?.message ?? "No se pudo crear" }, { status: 400 })
    }

    return NextResponse.json({ staff: row })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/coaching-staff failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
