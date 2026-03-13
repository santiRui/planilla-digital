import { NextRequest, NextResponse } from "next/server"
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

// Clave de deduplicación: misma jugada registrada varias veces por reintentos.
function buildEventKey(e: any): string {
  return [
    e.match_id ?? "",
    e.team_id ?? "",
    e.player_id ?? "",
    e.victim_player_id ?? "",
    e.type ?? "",
    e.period ?? "",
    e.game_time ?? "",
    e.points ?? "",
    e.shot_type ?? "",
    String(e.made ?? ""),
  ].join("|")
}

export async function POST(req: NextRequest) {
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

    const admin = auth.adminClient

    // 1) Obtener todos los partidos finalizados
    const { data: finishedMatches, error: matchErr } = await admin
      .from("matches")
      .select("id")
      .eq("status", "finalizado")

    if (matchErr) {
      return NextResponse.json({ error: matchErr.message }, { status: 400 })
    }

    const matchIds = (finishedMatches ?? []).map((m: any) => m.id)
    if (!matchIds.length) {
      return NextResponse.json({ ok: true, deleted: 0, matches: 0 })
    }

    // 2) Leer eventos solo de partidos finalizados
    const { data: events, error: evErr } = await admin
      .from("match_events")
      .select("id, match_id, team_id, player_id, victim_player_id, type, period, game_time, points, shot_type, made, occurred_at")
      .in("match_id", matchIds)
      .order("occurred_at", { ascending: true })

    if (evErr) {
      return NextResponse.json({ error: evErr.message }, { status: 400 })
    }

    const allEvents = events ?? []

    const seenByKey = new Map<string, string>() // key -> first event id
    const duplicates: string[] = []

    for (const e of allEvents) {
      const key = buildEventKey(e)
      const existing = seenByKey.get(key)
      if (existing) {
        // Este evento es un duplicado de una jugada ya registrada.
        duplicates.push(e.id)
      } else {
        seenByKey.set(key, e.id)
      }
    }

    if (duplicates.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0, matches: matchIds.length })
    }

    // 2) Borrar duplicados en batches para evitar límites de IN
    const chunkSize = 500
    let deletedTotal = 0
    for (let i = 0; i < duplicates.length; i += chunkSize) {
      const chunk = duplicates.slice(i, i + chunkSize)
      const { error: delErr, count } = await admin
        .from("match_events")
        .delete({ count: "exact" })
        .in("id", chunk)

      if (delErr) {
        return NextResponse.json({ error: delErr.message, deletedUntilError: deletedTotal }, { status: 400 })
      }

      deletedTotal += count ?? 0
    }

    return NextResponse.json({ ok: true, deleted: deletedTotal, matches: matchIds.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/matches/dedup-events failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
