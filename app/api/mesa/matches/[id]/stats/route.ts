import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const playerStatSchema = z.object({
  playerId: z.string().uuid(),
  teamId: z.string().uuid(),
  minutes: z.number(),
  points: z.number().int(),
  t1Made: z.number().int(),
  t1Att: z.number().int(),
  t2Made: z.number().int(),
  t2Att: z.number().int(),
  t3Made: z.number().int(),
  t3Att: z.number().int(),
  rebounds: z.number().int(),
  assists: z.number().int(),
  steals: z.number().int(),
  turnovers: z.number().int(),
  blocksCommitted: z.number().int(),
  blocksReceived: z.number().int(),
  foulsCommitted: z.number().int(),
  foulsReceived: z.number().int(),
  rating: z.number().int(),
})

const bodySchema = z.object({
  stats: z.array(playerStatSchema),
})

async function assertAuthenticated(accessToken: string) {
  const adminClient = createSupabaseAdminClient()
  const userClient = createSupabaseServerClient(accessToken)

  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false as const, status: 401, error: "No autorizado" }
  }

  // No imponemos restricciones por rol: cualquier usuario autenticado puede
  // persistir las estadísticas calculadas por la planilla digital.
  return { ok: true as const, adminClient }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: matchId } = await ctx.params

    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertAuthenticated(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const rows = parsed.data.stats.map((s) => ({
      match_id: matchId,
      team_id: s.teamId,
      player_id: s.playerId,
      minutes: s.minutes,
      points: s.points,
      t1_made: s.t1Made,
      t1_att: s.t1Att,
      t2_made: s.t2Made,
      t2_att: s.t2Att,
      t3_made: s.t3Made,
      t3_att: s.t3Att,
      rebounds: s.rebounds,
      assists: s.assists,
      steals: s.steals,
      turnovers: s.turnovers,
      blocks_committed: s.blocksCommitted,
      blocks_received: s.blocksReceived,
      fouls_committed: s.foulsCommitted,
      fouls_received: s.foulsReceived,
      rating: s.rating,
    }))

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 })
    }

    const { error } = await auth.adminClient
      .from("match_player_stats_planilla")
      .upsert(rows, { onConflict: "match_id,player_id" })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Recalcular contenedores por torneo/jugadora (goleadores persistidos)
    const admin = auth.adminClient

    const { data: matchRow, error: matchError } = await admin
      .from("matches")
      .select("id, tournament_id")
      .eq("id", matchId)
      .maybeSingle()

    if (matchError || !matchRow?.tournament_id) {
      return NextResponse.json({ ok: true, inserted: rows.length })
    }

    const tournamentId = String(matchRow.tournament_id)
    const affectedPlayerIds = Array.from(new Set(rows.map((r) => String(r.player_id)).filter(Boolean)))

    if (affectedPlayerIds.length > 0) {
      const { data: tournamentMatches, error: tournamentMatchesError } = await admin
        .from("matches")
        .select("id")
        .eq("tournament_id", tournamentId)

      if (!tournamentMatchesError) {
        const tournamentMatchIds = (tournamentMatches ?? []).map((m: any) => String(m.id)).filter(Boolean)

        const { data: allStatsRows, error: allStatsError } = await admin
          .from("match_player_stats_planilla")
          .select(
            "match_id, player_id, points, t3_made, t3_att, rebounds, assists, steals, blocks_committed, fouls_received",
          )
          .in("match_id", tournamentMatchIds.length ? tournamentMatchIds : ["__none__"])
          .in("player_id", affectedPlayerIds)

        if (!allStatsError && Array.isArray(allStatsRows) && allStatsRows.length > 0) {
          const byPlayer = new Map<
            string,
            {
              matchIds: Set<string>
              points: number
              t3Made: number
              t3Att: number
              rebounds: number
              assists: number
              steals: number
              blocks: number
              foulsReceived: number
            }
          >()

          for (const r of allStatsRows as any[]) {
            const pid = String(r.player_id ?? "")
            if (!pid) continue
            const current = byPlayer.get(pid) ?? {
              matchIds: new Set<string>(),
              points: 0,
              t3Made: 0,
              t3Att: 0,
              rebounds: 0,
              assists: 0,
              steals: 0,
              blocks: 0,
              foulsReceived: 0,
            }
            current.matchIds.add(String(r.match_id))
            current.points += Number(r.points ?? 0)
            current.t3Made += Number(r.t3_made ?? 0)
            current.t3Att += Number(r.t3_att ?? 0)
            current.rebounds += Number(r.rebounds ?? 0)
            current.assists += Number(r.assists ?? 0)
            current.steals += Number(r.steals ?? 0)
            current.blocks += Number(r.blocks_committed ?? 0)
            current.foulsReceived += Number(r.fouls_received ?? 0)
            byPlayer.set(pid, current)
          }

          const leaderRows = Array.from(byPlayer.entries()).map(([playerId, agg]) => ({
            tournament_id: tournamentId,
            player_id: playerId,
            games: agg.matchIds.size,
            points: agg.points,
            t3_made: agg.t3Made,
            t3_att: agg.t3Att,
            rebounds: agg.rebounds,
            assists: agg.assists,
            steals: agg.steals,
            blocks: agg.blocks,
            fouls_received: agg.foulsReceived,
            updated_at: new Date().toISOString(),
          }))

          if (leaderRows.length > 0) {
            await admin
              .from("tournament_player_leaders")
              .upsert(leaderRows, { onConflict: "tournament_id,player_id" })
          }
        }
      }
    }

    return NextResponse.json({ ok: true, inserted: rows.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/mesa/matches/[id]/stats failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
