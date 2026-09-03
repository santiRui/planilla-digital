import { NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

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

export async function GET(req: Request, ctx: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await ctx.params

    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    const auth = await assertAdmin(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const adminClient = auth.adminClient

    const { data: memberships, error: memError } = await adminClient
      .from("team_memberships")
      .select("id, remaining_games, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true })

    if (memError) {
      return NextResponse.json({ error: memError.message }, { status: 400 })
    }

    const membershipIds = (memberships ?? []).map((m: any) => m.id as string)

    let usages: any[] = []
    if (membershipIds.length > 0) {
      const { data: usageRows, error: usageError } = await adminClient
        .from("team_membership_usages")
        .select("team_membership_id, match_id, used_at")
        .in("team_membership_id", membershipIds)
        .order("used_at", { ascending: true })

      if (usageError) {
        return NextResponse.json({ error: usageError.message }, { status: 400 })
      }

      usages = usageRows as any[]
    }

    return NextResponse.json({ memberships: memberships ?? [], usages })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/team-memberships/[teamId] failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await ctx.params

    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    const auth = await assertAdmin(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(req.url)
    const membershipId = searchParams.get("membershipId")
    if (!membershipId) {
      return NextResponse.json({ error: "Falta membershipId" }, { status: 400 })
    }

    const body = await req.json().catch(() => null)
    const remaining = Number(body?.remaining_games)
    if (!Number.isFinite(remaining) || remaining < 0) {
      return NextResponse.json({ error: "remaining_games debe ser un número mayor o igual a 0" }, { status: 400 })
    }

    const { data, error } = await auth.adminClient
      .from("team_memberships")
      .update({ remaining_games: remaining })
      .eq("id", membershipId)
      .eq("team_id", teamId)
      .select("id, team_id, remaining_games, created_at")
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "No se pudo actualizar la membresía" }, { status: 400 })
    }

    return NextResponse.json({ membership: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("PATCH /api/admin/team-memberships/[teamId] failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await ctx.params

    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    const auth = await assertAdmin(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(req.url)
    const membershipId = searchParams.get("membershipId")
    if (!membershipId) {
      return NextResponse.json({ error: "Falta membershipId" }, { status: 400 })
    }

    const { error } = await auth.adminClient
      .from("team_memberships")
      .delete()
      .eq("id", membershipId)
      .eq("team_id", teamId)

    if (error) {
      return NextResponse.json({ error: error.message ?? "No se pudo eliminar la membresía" }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("DELETE /api/admin/team-memberships/[teamId] failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
