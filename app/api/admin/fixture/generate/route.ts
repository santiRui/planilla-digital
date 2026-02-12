import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const generateFixtureSchema = z.object({
  tournamentId: z.string().min(1),
  zonesCount: z.number().int().min(1).max(26).optional(),
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

type TeamLite = { id: string }

function zoneCodeForIndex(idx: number) {
  const base = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  return base[idx] ?? `Z${idx + 1}`
}

function splitIntoZones(teamIds: string[], zonesCount: number) {
  const zones: Array<{ zoneCode: string; teamIds: string[] }> = []
  const count = Math.max(1, Math.min(zonesCount, 26))

  for (let i = 0; i < count; i += 1) {
    zones.push({ zoneCode: zoneCodeForIndex(i), teamIds: [] })
  }

  for (let i = 0; i < teamIds.length; i += 1) {
    zones[i % count]!.teamIds.push(teamIds[i]!)
  }

  return zones.filter((z) => z.teamIds.length > 0)
}

function roundRobinPairs(teamIds: string[]) {
  const teams = [...teamIds]
  if (teams.length % 2 !== 0) {
    teams.push("bye")
  }

  const rounds = teams.length - 1
  const matchesPerRound = teams.length / 2

  const result: Array<{ round: number; homeTeamId: string; awayTeamId: string }> = []

  for (let round = 0; round < rounds; round++) {
    for (let match = 0; match < matchesPerRound; match++) {
      const home = teams[match]
      const away = teams[teams.length - 1 - match]

      if (home !== "bye" && away !== "bye") {
        result.push({ round: round + 1, homeTeamId: home, awayTeamId: away })
      }
    }

    const lastTeam = teams.pop()!
    teams.splice(1, 0, lastTeam)
  }

  return result
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
    const parsed = generateFixtureSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { tournamentId } = parsed.data
    const zonesCount = Number(parsed.data.zonesCount ?? 1)

    const { data: tournament, error: tournamentError } = await auth.adminClient
      .from("tournaments")
      .select("category_id")
      .eq("id", tournamentId)
      .maybeSingle()

    if (tournamentError) {
      return NextResponse.json({ error: tournamentError.message }, { status: 400 })
    }

    const categoryId = (tournament as any)?.category_id as string | null
    if (!categoryId) {
      return NextResponse.json({ error: "El torneo no tiene categoría asignada" }, { status: 400 })
    }

    const { data: teamCategoryRows, error: teamsError } = await auth.adminClient
      .from("team_categories")
      .select("team_id")
      .eq("category_id", categoryId)
      .order("created_at", { ascending: true })

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 400 })
    }

    const teamIds = (teamCategoryRows ?? []).map((t: any) => t.team_id as string)

    if (teamIds.length < 2) {
      return NextResponse.json({ error: "Se necesitan al menos 2 equipos para generar un fixture" }, { status: 400 })
    }

    // Reset playoff stages so they can be regenerated from the new regular season fixture
    const { error: deletePlayoffMatchesError } = await auth.adminClient
      .from("matches")
      .delete()
      .eq("tournament_id", tournamentId)
      .in("phase", ["playoff", "cuartos", "semifinal", "final"])

    if (deletePlayoffMatchesError) {
      return NextResponse.json({ error: deletePlayoffMatchesError.message }, { status: 400 })
    }

    const { error: deleteSeriesError } = await auth.adminClient
      .from("playoff_series")
      .delete()
      .eq("tournament_id", tournamentId)
      .in("phase", ["cuartos", "semifinal", "final"])

    if (deleteSeriesError) {
      return NextResponse.json({ error: deleteSeriesError.message }, { status: 400 })
    }

    // Replace only regular season fixture for this category
    const { error: deleteError } = await auth.adminClient
      .from("matches")
      .delete()
      .eq("tournament_id", tournamentId)
      .eq("phase", "fase_regular")

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 })
    }

    // Mezclar aleatoriamente el orden de los equipos antes de asignarlos a zonas y generar el round-robin
    const shuffledTeamIds = [...teamIds]
    for (let i = shuffledTeamIds.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffledTeamIds[i], shuffledTeamIds[j]] = [shuffledTeamIds[j]!, shuffledTeamIds[i]!]
    }

    const zones = splitIntoZones(shuffledTeamIds, zonesCount)

    const { error: deleteZonesError } = await auth.adminClient
      .from("tournament_team_zones")
      .delete()
      .eq("tournament_id", tournamentId)

    if (deleteZonesError) {
      return NextResponse.json({ error: deleteZonesError.message }, { status: 400 })
    }

    const zoneRows = zones.flatMap((z) => z.teamIds.map((teamId) => ({ tournament_id: tournamentId, team_id: teamId, zone_code: z.zoneCode })))
    const { error: insertZonesError } = await auth.adminClient.from("tournament_team_zones").insert(zoneRows)

    if (insertZonesError) {
      return NextResponse.json({ error: insertZonesError.message }, { status: 400 })
    }

    const insertRows = zones.flatMap((z) => {
      const pairs = roundRobinPairs(z.teamIds)
      return pairs.map((p) => ({
        tournament_id: tournamentId,
        home_team_id: p.homeTeamId,
        away_team_id: p.awayTeamId,
        zone_code: z.zoneCode,
        round: p.round,
        phase: "fase_regular",
        status: "programado",
        scheduled_at: null,
        venue_id: null,
        court_id: null,
        home_score: null,
        away_score: null,
      }))
    })

    const { data: inserted, error: insertError } = await auth.adminClient
      .from("matches")
      .insert(insertRows)
      .select(
        "id, tournament_id, home_team_id, away_team_id, round, phase, status, scheduled_at, venue_id, court_id, home_score, away_score, zone_code, created_at",
      )
      .order("round", { ascending: true })
      .order("created_at", { ascending: true })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 })
    }

    return NextResponse.json({ matches: inserted ?? [] })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/fixture/generate failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
