import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const updateFixtureSchema = z.object({
  tournamentId: z.string().min(1),
  wheelsCount: z.number().int().min(1).max(6).optional(),
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

type MatchLite = {
  id: string
  home_team_id: string
  away_team_id: string
  zone_code: string | null
  round: number
  phase: string
  status: string
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

function roundRobinPairsWithWheels(teamIds: string[], wheelsCount: number) {
  const wheels = Math.max(1, Math.floor(wheelsCount || 1))
  const base = roundRobinPairs(teamIds)
  const baseRounds = base.reduce((max, m) => Math.max(max, m.round), 0)

  const out: Array<{ round: number; homeTeamId: string; awayTeamId: string }> = []

  for (let wheel = 1; wheel <= wheels; wheel += 1) {
    const roundOffset = (wheel - 1) * baseRounds
    const swap = wheel % 2 === 0
    for (const m of base) {
      out.push({
        round: roundOffset + m.round,
        homeTeamId: swap ? m.awayTeamId : m.homeTeamId,
        awayTeamId: swap ? m.homeTeamId : m.awayTeamId,
      })
    }
  }

  return out
}

function pairingKey(a: string, b: string) {
  return a < b ? `${a}:${b}` : `${b}:${a}`
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
    const parsed = updateFixtureSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { tournamentId } = parsed.data
    const wheelsCount = Number(parsed.data.wheelsCount ?? 1)

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

    const allTeamIds = (teamCategoryRows ?? []).map((t: any) => t.team_id as string).filter(Boolean)
    const uniqueTeamIds = Array.from(new Set(allTeamIds))

    if (uniqueTeamIds.length < 2) {
      return NextResponse.json({ error: "Se necesitan al menos 2 equipos para actualizar el fixture" }, { status: 400 })
    }

    // Load current zone assignments
    const { data: zoneRows, error: zonesError } = await auth.adminClient
      .from("tournament_team_zones")
      .select("team_id, zone_code")
      .eq("tournament_id", tournamentId)

    if (zonesError) {
      return NextResponse.json({ error: zonesError.message }, { status: 400 })
    }

    const teamToZone = new Map<string, string>()
    for (const r of (zoneRows ?? []) as any[]) {
      const teamId = r?.team_id ? String(r.team_id) : ""
      const zoneCode = r?.zone_code ? String(r.zone_code) : ""
      if (teamId && zoneCode) teamToZone.set(teamId, zoneCode)
    }

    // Assign missing teams to the smallest zone (or "A" if none)
    const zoneCounts = new Map<string, number>()
    for (const z of teamToZone.values()) {
      zoneCounts.set(z, (zoneCounts.get(z) ?? 0) + 1)
    }

    const existingZones = Array.from(new Set(Array.from(teamToZone.values()))).filter(Boolean)
    const fallbackZone = existingZones[0] ?? "A"

    const missingTeams = uniqueTeamIds.filter((id) => !teamToZone.has(id))
    if (missingTeams.length > 0) {
      const chooseZone = () => {
        const zones = existingZones.length > 0 ? existingZones : [fallbackZone]
        let best = zones[0]!
        let bestCount = zoneCounts.get(best) ?? 0
        for (const z of zones) {
          const c = zoneCounts.get(z) ?? 0
          if (c < bestCount) {
            best = z
            bestCount = c
          }
        }
        zoneCounts.set(best, (zoneCounts.get(best) ?? 0) + 1)
        return best
      }

      const inserts = missingTeams.map((teamId) => ({
        tournament_id: tournamentId,
        team_id: teamId,
        zone_code: chooseZone(),
      }))

      const { error: insertZonesError } = await auth.adminClient.from("tournament_team_zones").insert(inserts)
      if (insertZonesError) {
        return NextResponse.json({ error: insertZonesError.message }, { status: 400 })
      }

      for (const row of inserts) {
        teamToZone.set(row.team_id, row.zone_code)
      }
    }

    // Load existing regular season matches
    const { data: matches, error: matchesError } = await auth.adminClient
      .from("matches")
      .select("id, home_team_id, away_team_id, zone_code, round, phase, status")
      .eq("tournament_id", tournamentId)
      .eq("phase", "fase_regular")

    if (matchesError) {
      return NextResponse.json({ error: matchesError.message }, { status: 400 })
    }

    const regularMatches = (matches ?? []) as any as MatchLite[]

    const zones = Array.from(new Set(uniqueTeamIds.map((id) => teamToZone.get(id) ?? fallbackZone)))

    for (const zoneCode of zones) {
      const zoneMatches = regularMatches.filter((m) => (m.zone_code ?? fallbackZone) === zoneCode)

      // Construimos el conjunto de equipos de la zona a partir de:
      // - Los equipos declarados en team_categories (uniqueTeamIds) con esa zona.
      // - Cualquier equipo que ya aparezca en partidos de esa zona.
      const zoneTeamIdSet = new Set<string>()
      for (const id of uniqueTeamIds) {
        const cleanId = id ? String(id) : ""
        if (!cleanId) continue
        if ((teamToZone.get(cleanId) ?? fallbackZone) === zoneCode) {
          zoneTeamIdSet.add(cleanId)
        }
      }
      for (const m of zoneMatches) {
        const homeId = m.home_team_id ? String(m.home_team_id) : ""
        const awayId = m.away_team_id ? String(m.away_team_id) : ""
        if (homeId) zoneTeamIdSet.add(homeId)
        if (awayId) zoneTeamIdSet.add(awayId)
      }

      // Nos quedamos solo con IDs válidos (no vacíos)
      const zoneTeamIds = Array.from(zoneTeamIdSet).filter((id) => !!id)
      if (zoneTeamIds.length < 2) continue

      // Separar partidos jugados de programados.
      const played = zoneMatches.filter((m) => m.status !== "programado")
      const scheduled = zoneMatches.filter((m) => m.status === "programado")

      // Borramos todos los partidos programados de fase regular de esta zona;
      // vamos a reinsertar según el nuevo fixture.
      const toDeleteIds = scheduled.map((m) => m.id)
      if (toDeleteIds.length > 0) {
        const { error: deleteError } = await auth.adminClient.from("matches").delete().in("id", toDeleteIds)
        if (deleteError) {
          return NextResponse.json({ error: deleteError.message }, { status: 400 })
        }
      }

      // Generamos el round-robin teórico (con wheels) para TODOS los equipos
      // de la zona, respetando exactamente la cantidad de ruedas solicitada.
      const generated = roundRobinPairsWithWheels(zoneTeamIds, wheelsCount).sort(
        (a, b) => a.round - b.round,
      )

      // Agrupamos los partidos jugados por par de equipos (sin importar local/visitante).
      const playedByPair = new Map<string, MatchLite[]>()
      for (const m of played) {
        const key = pairingKey(m.home_team_id, m.away_team_id)
        const list = playedByPair.get(key) ?? []
        list.push(m)
        playedByPair.set(key, list)
      }

      const updateRows: Array<{ id: string; round: number; zone_code: string }> = []
      const insertRows: Array<{
        tournament_id: string
        home_team_id: string
        away_team_id: string
        zone_code: string
        round: number
        phase: string
        status: string
        scheduled_at: null
        venue_id: null
        court_id: null
      }> = []

      // Para cada partido teórico generado, intentamos reasignar primero un
      // partido jugado existente (preservando scores y demás datos), y si no
      // hay, creamos un nuevo partido programado.
      for (const p of generated) {
        // Ignoramos emparejamientos inválidos por seguridad.
        if (!p.homeTeamId || !p.awayTeamId) continue

        const key = pairingKey(p.homeTeamId, p.awayTeamId)
        const list = playedByPair.get(key)

        if (list && list.length > 0) {
          const existing = list.shift()!
          updateRows.push({ id: existing.id, round: p.round, zone_code: zoneCode })
        } else {
          insertRows.push({
            tournament_id: tournamentId,
            home_team_id: p.homeTeamId,
            away_team_id: p.awayTeamId,
            zone_code: zoneCode,
            round: p.round,
            phase: "fase_regular",
            status: "programado",
            scheduled_at: null,
            venue_id: null,
            court_id: null,
          })
        }
      }

      if (updateRows.length > 0) {
        for (const row of updateRows) {
          const { error: updateError } = await auth.adminClient
            .from("matches")
            .update({ round: row.round, zone_code: row.zone_code })
            .eq("id", row.id)

          if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 400 })
          }
        }
      }

      if (insertRows.length > 0) {
        const { error: insertError } = await auth.adminClient.from("matches").insert(insertRows)
        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 400 })
        }
      }
    }

    // Return the updated match list
    const { data: updatedMatches, error: updatedError } = await auth.adminClient
      .from("matches")
      .select(
        "id, tournament_id, home_team_id, away_team_id, round, phase, status, scheduled_at, venue_id, court_id, home_score, away_score, live_home_score, live_away_score, live_period, live_game_time, zone_code, playoff_series_id, series_game_number, created_at",
      )
      .eq("tournament_id", tournamentId)
      .order("phase", { ascending: true })
      .order("round", { ascending: true })
      .order("created_at", { ascending: true })

    if (updatedError) {
      return NextResponse.json({ error: updatedError.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, matches: updatedMatches ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error desconocido" }, { status: 500 })
  }
}
