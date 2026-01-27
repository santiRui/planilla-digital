import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const updateMatchSchedulingSchema = z.object({
  scheduledDate: z.string().optional().nullable(), // YYYY-MM-DD
  scheduledTime: z.string().optional().nullable(), // HH:MM
  venueId: z.string().optional().nullable(),
  courtId: z.string().optional().nullable(),
  refereeIds: z.array(z.string()).optional().nullable(),
  tableOfficialIds: z.array(z.string()).optional().nullable(),
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

function toScheduledAt(scheduledDate?: string | null, scheduledTime?: string | null) {
  const d = scheduledDate?.trim()
  if (!d) return null
  const t = (scheduledTime?.trim() || "00:00").slice(0, 5)
  const iso = `${d}T${t}:00`
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
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
    const parsed = updateMatchSchedulingSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const scheduledAt = toScheduledAt(parsed.data.scheduledDate, parsed.data.scheduledTime)

    const venueId = parsed.data.venueId ? parsed.data.venueId : null
    const courtId = parsed.data.courtId ? parsed.data.courtId : null

    const { data: updated, error: updateError } = await auth.adminClient
      .from("matches")
      .update({
        scheduled_at: scheduledAt,
        venue_id: venueId,
        court_id: courtId,
      })
      .eq("id", id)
      .select(
        "id, tournament_id, home_team_id, away_team_id, round, phase, status, scheduled_at, venue_id, court_id, home_score, away_score, created_at, match_official_assignments(user_id, role)",
      )
      .single()

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "No se pudo actualizar" }, { status: 400 })
    }

    const refereeIds = Array.from(new Set((parsed.data.refereeIds ?? []).filter(Boolean)))
    const tableOfficialIds = Array.from(new Set((parsed.data.tableOfficialIds ?? []).filter(Boolean)))

    const overlap = refereeIds.filter((id) => tableOfficialIds.includes(id))
    if (overlap.length > 0) {
      return NextResponse.json(
        { error: "Un usuario no puede ser árbitro y oficial de mesa en el mismo partido." },
        { status: 400 },
      )
    }

    // Replace assignments for this match (simple + consistent)
    const { error: deleteAssignmentsError } = await auth.adminClient
      .from("match_official_assignments")
      .delete()
      .eq("match_id", id)

    if (deleteAssignmentsError) {
      return NextResponse.json({ error: deleteAssignmentsError.message }, { status: 400 })
    }

    const insertRows = [
      ...refereeIds.map((userId) => ({ match_id: id, user_id: userId, role: "arbitro" })),
      ...tableOfficialIds.map((userId) => ({ match_id: id, user_id: userId, role: "oficial_mesa" })),
    ]

    if (insertRows.length > 0) {
      const { error: insertAssignmentsError } = await auth.adminClient
        .from("match_official_assignments")
        .insert(insertRows)

      if (insertAssignmentsError) {
        return NextResponse.json({ error: insertAssignmentsError.message }, { status: 400 })
      }
    }

    const { data: finalMatch, error: refetchError } = await auth.adminClient
      .from("matches")
      .select(
        "id, tournament_id, home_team_id, away_team_id, round, phase, status, scheduled_at, venue_id, court_id, home_score, away_score, created_at, match_official_assignments(user_id, role)",
      )
      .eq("id", id)
      .single()

    if (refetchError || !finalMatch) {
      return NextResponse.json({ error: refetchError?.message ?? "No se pudo leer el partido" }, { status: 400 })
    }

    return NextResponse.json({ match: finalMatch })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("PATCH /api/admin/matches/[id] failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
