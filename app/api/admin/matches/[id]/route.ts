import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { resolveSeriesAndMaybeAdvance } from "@/app/api/mesa/matches/[id]/route"

const updateMatchSchedulingSchema = z.object({
  scheduledDate: z.string().optional().nullable(), // YYYY-MM-DD
  scheduledTime: z.string().optional().nullable(), // HH:MM
  venueId: z.string().optional().nullable(),
  courtId: z.string().optional().nullable(),
  refereeIds: z.array(z.string()).optional().nullable(),
  tableOfficialIds: z.array(z.string()).optional().nullable(),
  status: z.enum(["programado", "en_juego", "finalizado", "suspendido", "demorado"]).optional(),
  statusReason: z.string().max(500).optional().nullable(),
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
  // Guardamos la fecha y hora tal cual se ingresan (hora local del torneo),
  // sin convertir a UTC, para evitar desfasajes al mostrarla luego.
  return `${d}T${t}:00-03:00`
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

    // Leemos el estado actual del partido para poder aplicar reglas de transición (por ej. suspendido -> programado al reprogramar)
    const { data: currentMatch, error: currentError } = await auth.adminClient
      .from("matches")
      .select(
        "id, status, scheduled_at, tournament_id, phase, home_team_id, away_team_id, home_score, away_score, playoff_series_id, series_game_number",
      )
      .eq("id", id)
      .maybeSingle()

    if (currentError) {
      return NextResponse.json({ error: currentError.message }, { status: 400 })
    }

    if (!currentMatch) {
      return NextResponse.json({ error: "Partido no encontrado" }, { status: 404 })
    }

    if (parsed.data.scheduledDate && parsed.data.scheduledTime) {
      const candidate = new Date(`${parsed.data.scheduledDate}T${parsed.data.scheduledTime}:00-03:00`)
      const now = new Date()
      if (!Number.isNaN(candidate.getTime()) && candidate.getTime() < now.getTime()) {
        return NextResponse.json(
          { error: "No podés programar un partido en una fecha u horario pasado." },
          { status: 400 },
        )
      }
    }

    // Sólo actualizamos fecha/hora/sede/cancha si vinieron explícitamente en el payload.
    // Esto evita que flujos como Jornada (que sólo cambian estado/motivo) borren la programación existente.
    const hasSchedulingFields =
      Object.prototype.hasOwnProperty.call(parsed.data, "scheduledDate") ||
      Object.prototype.hasOwnProperty.call(parsed.data, "scheduledTime")

    const hasVenueField = Object.prototype.hasOwnProperty.call(parsed.data, "venueId")
    const hasCourtField = Object.prototype.hasOwnProperty.call(parsed.data, "courtId")

    const scheduledAt = hasSchedulingFields ? toScheduledAt(parsed.data.scheduledDate ?? null, parsed.data.scheduledTime ?? null) : undefined

    const update: any = {}

    if (scheduledAt !== undefined) {
      update.scheduled_at = scheduledAt
    }
    if (hasVenueField) {
      update.venue_id = parsed.data.venueId ? parsed.data.venueId : null
    }
    if (hasCourtField) {
      update.court_id = parsed.data.courtId ? parsed.data.courtId : null
    }

    // Regla de negocio: si el partido estaba suspendido y se lo reprograma a una fecha/hora futura,
    // vuelve a quedar como programado y se limpia el motivo de suspensión, salvo que se indique
    // explícitamente otro estado distinto en la request.
    let nextStatus = parsed.data.status
    let nextStatusReason = parsed.data.statusReason

    if (
      currentMatch.status === "suspendido" &&
      parsed.data.scheduledDate &&
      parsed.data.scheduledTime &&
      (!parsed.data.status || parsed.data.status === "suspendido")
    ) {
      const candidate = new Date(`${parsed.data.scheduledDate}T${parsed.data.scheduledTime}:00-03:00`)
      const now = new Date()
      if (!Number.isNaN(candidate.getTime()) && candidate.getTime() >= now.getTime()) {
        nextStatus = "programado"
        nextStatusReason = null
      }
    }

    if (nextStatus) {
      update.status = nextStatus
    }
    if (nextStatusReason !== undefined) {
      update.status_reason = nextStatusReason
    }

    const { data: updated, error: updateError } = await auth.adminClient
      .from("matches")
      .update(update)
      .eq("id", id)
      .select(
        "id, tournament_id, home_team_id, away_team_id, round, phase, status, scheduled_at, venue_id, court_id, home_score, away_score, playoff_series_id, series_game_number, created_at, match_official_assignments(user_id, role)",
      )
      .single()

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "No se pudo actualizar" }, { status: 400 })
    }

    // Sólo reemplazamos designaciones si se envían explícitamente (Programación).
    // Jornada u otros flujos que no toquen refereeIds / tableOfficialIds
    // dejan intactas las asignaciones actuales.
    const hasRefereesField = Object.prototype.hasOwnProperty.call(parsed.data, "refereeIds")
    const hasTableOfficialsField = Object.prototype.hasOwnProperty.call(parsed.data, "tableOfficialIds")

    let matchToReturn = updated

    if (hasRefereesField || hasTableOfficialsField) {
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

      // Volvemos a leer el partido con las designaciones recién insertadas para devolver
      // al cliente el estado actualizado que usará Programación.
      const { data: refreshed, error: refreshedError } = await auth.adminClient
        .from("matches")
        .select(
          "id, tournament_id, home_team_id, away_team_id, round, phase, status, scheduled_at, venue_id, court_id, home_score, away_score, playoff_series_id, series_game_number, created_at, match_official_assignments(user_id, role)",
        )
        .eq("id", id)
        .single()

      if (!refreshed || refreshedError) {
        return NextResponse.json(
          { error: refreshedError?.message ?? "No se pudo cargar el partido actualizado" },
          { status: 400 },
        )
      }

      matchToReturn = refreshed as typeof updated
    }

    // Si desde Programación se marca un partido de play-off como finalizado,
    // reutilizamos la misma lógica de avance de series que en la mesa.
    if (matchToReturn.playoff_series_id && matchToReturn.status === "finalizado") {
      await resolveSeriesAndMaybeAdvance(auth.adminClient as any, matchToReturn as any)
    }

    return NextResponse.json({ match: matchToReturn })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("PATCH /api/admin/matches/[id] failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
