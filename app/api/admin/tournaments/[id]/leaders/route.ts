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

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: tournamentId } = await ctx.params

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

    // 1) Partidos del torneo
    const { data: matches, error: matchesError } = await admin
      .from("matches")
      .select("id, home_team_id, away_team_id")
      .eq("tournament_id", tournamentId)

    if (matchesError) {
      return NextResponse.json({ error: matchesError.message }, { status: 400 })
    }

    const matchIds = (matches ?? []).map((m: any) => m.id)
    if (!matchIds.length) {
      return NextResponse.json({
        topScorers: [],
        topThreePointers: [],
        topAssistants: [],
        topRebounders: [],
        topStealers: [],
        topBlockers: [],
      })
    }

    const teamIds = Array.from(
      new Set(
        (matches ?? []).flatMap((m: any) => [m.home_team_id, m.away_team_id]).filter((id: string | null) => Boolean(id)),
      ),
    ) as string[]

    // 2) Stats de jugadores para esos partidos
    // Para soportar torneos con mezcla de datos (algunos partidos con planilla nueva
    // y otros con stats legacy), resolvemos la fuente por PARTIDO:
    // - Si el partido tiene filas en match_player_stats_planilla, usamos esas.
    // - Si no tiene, hacemos fallback a match_player_stats.
    const [planillaRes, legacyRes] = await Promise.all([
      admin
        .from("match_player_stats_planilla")
        .select(
          "match_id, team_id, player_id, minutes, points, t1_made, t1_att, t2_made, t2_att, t3_made, t3_att, rebounds, assists, steals, blocks_committed",
        )
        .in("match_id", matchIds),
      admin
        .from("match_player_stats")
        .select(
          "match_id, team_id, player_id, minutes, points, t1_made, t1_att, t2_made, t2_att, t3_made, t3_att, rebounds, assists, steals, blocks_committed",
        )
        .in("match_id", matchIds),
    ])

    if (planillaRes.error) {
      return NextResponse.json({ error: planillaRes.error.message }, { status: 400 })
    }
    if (legacyRes.error) {
      return NextResponse.json({ error: legacyRes.error.message }, { status: 400 })
    }

    const planillaByMatch = new Map<string, any[]>()
    for (const r of (planillaRes.data ?? []) as any[]) {
      const matchId = String(r.match_id)
      const list = planillaByMatch.get(matchId) ?? []
      list.push(r)
      planillaByMatch.set(matchId, list)
    }

    const legacyByMatch = new Map<string, any[]>()
    for (const r of (legacyRes.data ?? []) as any[]) {
      const matchId = String(r.match_id)
      const list = legacyByMatch.get(matchId) ?? []
      list.push(r)
      legacyByMatch.set(matchId, list)
    }

    const statsRows: any[] = []
    for (const matchId of matchIds as any[]) {
      const id = String(matchId)
      const p = planillaByMatch.get(id)
      const l = legacyByMatch.get(id)

      if (p && p.length > 0) {
        statsRows.push(...p)

        // If there are legacy rows for the same match, keep only those players
        // that are not present in planilla rows to avoid dropping stats in mixed-data matches.
        if (l && l.length > 0) {
          const planillaPlayerIds = new Set((p as any[]).map((r) => String(r.player_id)))
          for (const row of l as any[]) {
            const pid = String((row as any).player_id)
            if (!planillaPlayerIds.has(pid)) statsRows.push(row)
          }
        }
        continue
      }

      if (l && l.length > 0) statsRows.push(...l)
    }

    if (statsRows.length === 0) {
      return NextResponse.json({
        topScorers: [],
        topThreePointers: [],
        topAssistants: [],
        topRebounders: [],
        topStealers: [],
        topBlockers: [],
      })
    }

    const statsPlayerIds = Array.from(new Set((statsRows ?? []).map((r: any) => String(r.player_id)).filter(Boolean)))
    const statsTeamIds = Array.from(new Set((statsRows ?? []).map((r: any) => r.team_id).filter(Boolean))) as string[]
    const allTeamIds = Array.from(new Set([...teamIds, ...statsTeamIds])) as string[]

    // 3) Datos de jugadores y equipos
    const [{ data: players, error: playersError }, { data: teams, error: teamsError }] = await Promise.all([
      admin
        .from("players")
        .select("id, team_id, first_name, last_name, jersey_number")
        .in("id", statsPlayerIds.length ? statsPlayerIds : ["__none__"]),
      admin
        .from("teams")
        .select("id, name")
        .in("id", allTeamIds.length ? allTeamIds : ["__none__"]),
    ])

    if (playersError) {
      return NextResponse.json({ error: playersError.message }, { status: 400 })
    }
    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 400 })
    }

    const playerById = new Map<string, any>()
    for (const p of players ?? []) {
      playerById.set(p.id, p)
    }

    const teamById = new Map<string, any>()
    for (const t of teams ?? []) {
      teamById.set(t.id, t)
    }

    type Agg = {
      playerId: string
      teamId: string
      games: number
      points: number
      t3Made: number
      t3Att: number
      assists: number
      rebounds: number
      steals: number
      blocks: number
      matchIds: Set<string>
    }

    const aggByPlayer = new Map<string, Agg>()

    for (const row of statsRows as any[]) {
      const player = playerById.get(String(row.player_id))
      const effectiveTeamId = String(player?.team_id ?? row.team_id ?? "")
      const key = `${row.player_id}|${effectiveTeamId}`
      const current = aggByPlayer.get(key) ?? {
        playerId: row.player_id,
        teamId: effectiveTeamId,
        games: 0,
        points: 0,
        t3Made: 0,
        t3Att: 0,
        assists: 0,
        rebounds: 0,
        steals: 0,
        blocks: 0,
        matchIds: new Set<string>(),
      }

      // Si el jugador figura en las estadísticas/planilla del partido, cuenta como PJ,
      // incluso si tiene 0 minutos.
      current.matchIds.add(String(row.match_id))
      current.points += row.points ?? 0
      current.t3Made += row.t3_made ?? 0
      current.t3Att += row.t3_att ?? 0
      current.assists += row.assists ?? 0
      current.rebounds += row.rebounds ?? 0
      current.steals += row.steals ?? 0
      current.blocks += row.blocks_committed ?? 0

      current.games = current.matchIds.size

      aggByPlayer.set(key, current)
    }

    const asArrayRaw = Array.from(aggByPlayer.values()).map((agg) => {
      const player = playerById.get(agg.playerId)
      const team = teamById.get(agg.teamId)
      return {
        playerId: agg.playerId,
        teamId: agg.teamId,
        games: agg.games,
        points: agg.points,
        t3Made: agg.t3Made,
        t3Att: agg.t3Att,
        assists: agg.assists,
        rebounds: agg.rebounds,
        steals: agg.steals,
        blocks: agg.blocks,
        jerseyNumber: player?.jersey_number ?? null,
        firstName: player?.first_name ?? "",
        lastName: player?.last_name ?? "",
        teamName: team?.name ?? "",
        matchIds: agg.matchIds,
      }
    })

    // Merge duplicates: sometimes the same real player can exist under multiple player_id values.
    // We merge by (teamId + jerseyNumber + normalized name) to avoid undercounting totals.
    const mergedByIdentity = new Map<
      string,
      {
        playerId: string
        teamId: string
        games: number
        points: number
        t3Made: number
        t3Att: number
        assists: number
        rebounds: number
        steals: number
        blocks: number
        jerseyNumber: number | null
        firstName: string
        lastName: string
        teamName: string
        matchIds: Set<string>
      }
    >()

    const normalizeIdentityPart = (value: unknown) =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()

    for (const row of asArrayRaw as any[]) {
      const first = normalizeIdentityPart(row.firstName)
      const last = normalizeIdentityPart(row.lastName)
      const key = `${row.teamId}|${last}|${first}`

      const current = mergedByIdentity.get(key) ?? {
        playerId: String(row.playerId),
        teamId: String(row.teamId),
        games: 0,
        points: 0,
        t3Made: 0,
        t3Att: 0,
        assists: 0,
        rebounds: 0,
        steals: 0,
        blocks: 0,
        jerseyNumber: (row.jerseyNumber as number | null) ?? null,
        firstName: String(row.firstName ?? ""),
        lastName: String(row.lastName ?? ""),
        teamName: String(row.teamName ?? ""),
        matchIds: new Set<string>(),
      }

      for (const id of (row.matchIds as Set<string>) ?? []) current.matchIds.add(String(id))
      current.points += Number(row.points ?? 0)
      current.t3Made += Number(row.t3Made ?? 0)
      current.t3Att += Number(row.t3Att ?? 0)
      current.assists += Number(row.assists ?? 0)
      current.rebounds += Number(row.rebounds ?? 0)
      current.steals += Number(row.steals ?? 0)
      current.blocks += Number(row.blocks ?? 0)
      current.games = current.matchIds.size

      mergedByIdentity.set(key, current)
    }

    const asArray = Array.from(mergedByIdentity.values()).map((m) => ({
      playerId: m.playerId,
      teamId: m.teamId,
      games: m.games,
      points: m.points,
      t3Made: m.t3Made,
      t3Att: m.t3Att,
      assists: m.assists,
      rebounds: m.rebounds,
      steals: m.steals,
      blocks: m.blocks,
      jerseyNumber: m.jerseyNumber,
      firstName: m.firstName,
      lastName: m.lastName,
      teamName: m.teamName,
    }))

    // Temporary targeted adjustment requested by user
    for (const row of asArray as any[]) {
      const first = normalizeIdentityPart(row.firstName)
      const last = normalizeIdentityPart(row.lastName)
      if (last === "rodriguez" && first === "graciela del valle") {
        row.points = 79
      }
    }

    const limit = 20

    const topScorers = [...asArray]
      .sort((a, b) => b.points - a.points || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topThreePointers = [...asArray]
      .sort((a, b) => b.t3Made - a.t3Made || (b.t3Att || 0) - (a.t3Att || 0))
      .slice(0, limit)

    const topAssistants = [...asArray]
      .sort((a, b) => b.assists - a.assists || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topRebounders = [...asArray]
      .sort((a, b) => b.rebounds - a.rebounds || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topStealers = [...asArray]
      .sort((a, b) => b.steals - a.steals || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topBlockers = [...asArray]
      .sort((a, b) => b.blocks - a.blocks || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    return NextResponse.json({ topScorers, topThreePointers, topAssistants, topRebounders, topStealers, topBlockers })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/tournaments/[id]/leaders failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
