import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"

const bodySchema = z.object({
  dryRun: z.boolean().optional().default(false),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: matchId } = await params
    const json = await req.json()
    const { dryRun } = bodySchema.parse(json)

    const admin = createSupabaseAdminClient()

    // 1. Verify match exists and is finalized
    const { data: match, error: matchErr } = await admin
      .from("matches")
      .select("id, home_team_id, away_team_id, status")
      .eq("id", matchId)
      .single()
    if (matchErr || !match) {
      return NextResponse.json({ error: "Partido no encontrado" }, { status: 404 })
    }
    if (match.status !== "finalizado") {
      return NextResponse.json({ error: "Solo se pueden recalcular estadísticas de partidos finalizados" }, { status: 400 })
    }

    // 2. Fetch all events for the match
    const { data: events, error: evErr } = await admin
      .from("match_events")
      .select("*")
      .eq("match_id", matchId)
      .order("occurred_at", { ascending: true })
    if (evErr) throw evErr

    // 3. Fetch all players for both teams
    const { data: homePlayers, error: homeErr } = await admin
      .from("players")
      .select("id, team_id, first_name, last_name, jersey_number")
      .eq("team_id", match.home_team_id)
    if (homeErr) throw homeErr

    const { data: awayPlayers, error: awayErr } = await admin
      .from("players")
      .select("id, team_id, first_name, last_name, jersey_number")
      .eq("team_id", match.away_team_id)
    if (awayErr) throw awayErr

    const allPlayers = [...(homePlayers || []), ...(awayPlayers || [])]

    // 4. Deduplicate events (same logic as frontend)
    const seen = new Set<string>()
    const dedupedEvents = (events ?? []).filter((e) => {
      // Dedupe solo por id de evento para no colapsar intentos distintos de una serie de libres.
      const key = String(e.id)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // 5. Compute stats per player (mirroring frontend logic)
    const PERIOD_SECONDS = 10 * 60
    const statsByPlayer = new Map<string, any>()

    for (const player of allPlayers) {
      const playerEvents = dedupedEvents.filter((e: any) => e.player_id === player.id || e.victim_player_id === player.id)
      const periods = new Set(playerEvents.map((e: any) => e.period))

      // Minutes calculation
      let totalSeconds = 0
      for (const periodValue of periods) {
        const periodEvents = playerEvents.filter((e: any) => e.period === periodValue)
        if (!periodEvents.length) continue

        // Substitution logic: if no subs, assume full period if in starting five (we can't know without onCourtPlayers, so we skip)
        // Fallback to max-min method
        const timesInSeconds = periodEvents
          .map((e: any) => {
            const [mm, ss] = e.game_time.split(":").map((v: any) => Number(v))
            if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null
            return mm * 60 + ss
          })
          .filter((v: any): v is number => v !== null)

        if (!timesInSeconds.length) continue
        const maxRemaining = Math.max(...timesInSeconds)
        const minRemaining = Math.min(...timesInSeconds)
        if (Number.isFinite(maxRemaining) && Number.isFinite(minRemaining) && maxRemaining >= minRemaining) {
          const delta = maxRemaining - minRemaining
          totalSeconds += Math.min(delta, PERIOD_SECONDS)
        }
      }
      const minutesPlayed = totalSeconds / 60

      // Points and other stats
      let points = 0
      let t1Made = 0, t1Att = 0
      let t2Made = 0, t2Att = 0
      let t3Made = 0, t3Att = 0
      let rebounds = 0, assists = 0, steals = 0, turnovers = 0
      let blocksCommitted = 0, blocksReceived = 0
      let foulsCommitted = 0, foulsReceived = 0
      let rating = 0

      for (const e of dedupedEvents) {
        const isActor = e.player_id === player.id
        const isVictim = e.victim_player_id === player.id
        if (!isActor && !isVictim) continue

        if (isActor) {
          if (e.type === "shot" && e.shot_type) {
            if (e.shot_type === 2) {
              t2Att += 1
              if (e.made) {
                t2Made += 1
                points += 2
                rating += 2
              } else {
                rating -= 1
              }
            } else if (e.shot_type === 3) {
              t3Att += 1
              if (e.made) {
                t3Made += 1
                points += 3
                rating += 3
              } else {
                rating -= 1
              }
            }
          } else if (e.type === "free_throw") {
            // Algunos eventos de libre representan varios lanzamientos (por ejemplo 2/2),
            // usando points = 2 y made = true. Ajustamos intentos en consecuencia.
            const freePoints = typeof e.points === "number" && e.points > 0 ? e.points : 1
            t1Att += freePoints
            if (e.made) {
              t1Made += freePoints
              points += freePoints
              rating += freePoints
            } else {
              rating -= freePoints
            }
          } else if (e.type === "rebound") {
            rebounds += 1
            rating += 1
          } else if (e.type === "assist") {
            assists += 1
            rating += 1
          } else if (e.type === "steal") {
            steals += 1
            rating += 1
          } else if (e.type === "turnover") {
            turnovers += 1
            rating -= 1
          } else if (e.type === "block") {
            blocksCommitted += 1
            rating += 1
          } else if (e.type === "foul") {
            foulsCommitted += 1
            rating -= 1
          }
        }

        if (isVictim) {
          if (e.type === "block") {
            blocksReceived += 1
            rating -= 1
          } else if (e.type === "foul") {
            foulsReceived += 1
            rating += 1
          }
        }
      }

      statsByPlayer.set(player.id, {
        match_id: matchId,
        team_id: player.team_id,
        player_id: player.id,
        minutes: minutesPlayed,
        points,
        t1_made: t1Made,
        t1_att: t1Att,
        t2_made: t2Made,
        t2_att: t2Att,
        t3_made: t3Made,
        t3_att: t3Att,
        rebounds,
        assists,
        steals,
        turnovers,
        blocks_committed: blocksCommitted,
        blocks_received: blocksReceived,
        fouls_committed: foulsCommitted,
        fouls_received: foulsReceived,
        rating,
      })
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        stats: Array.from(statsByPlayer.values()),
        totalPlayers: statsByPlayer.size,
      })
    }

    // 6. Upsert into match_player_stats (unique constraint on match_id, player_id)
    const upsertRows = Array.from(statsByPlayer.values())
    const { data: upserted, error: upsertErr } = await admin
      .from("match_player_stats")
      .upsert(upsertRows, { onConflict: "match_id,player_id" })
      .select()
    if (upsertErr) throw upsertErr

    return NextResponse.json({
      ok: true,
      dryRun: false,
      upserted,
      totalPlayers: upsertRows.length,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/matches/[id]/recalc-stats failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
