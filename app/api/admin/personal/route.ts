import { NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

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

    const { data: profiles, error } = await auth.adminClient
      .from("profiles")
      .select("id, full_name, phone, role, is_referee, is_table_official, created_at")
      .or("is_referee.eq.true,is_table_official.eq.true")
      .order("full_name", { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const usersById: Record<string, { email: string | null }> = {}

    let page = 1
    const perPage = 1000

    for (let i = 0; i < 10; i += 1) {
      const { data: usersData, error: usersError } = await auth.adminClient.auth.admin.listUsers({ page, perPage })
      if (usersError) break
      const users = usersData?.users ?? []
      users.forEach((u: any) => {
        usersById[u.id] = { email: u.email ?? null }
      })
      if (users.length < perPage) break
      page += 1
    }

    const people = (profiles ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      phone: p.phone ?? null,
      role: p.role,
      is_referee: Boolean(p.is_referee),
      is_table_official: Boolean(p.is_table_official),
      created_at: p.created_at,
      email: usersById[p.id]?.email ?? null,
    }))

    return NextResponse.json({ people })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/personal failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
