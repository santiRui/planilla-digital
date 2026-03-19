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
    const { data: matches, error: matchErr } = await admin
      .from("matches")
      .select("id")
      .eq("status", "finalizado")

    if (matchErr) {
      return NextResponse.json({ error: matchErr.message }, { status: 400 })
    }

    const matchIds = (matches ?? []).map((m: any) => m.id)
    if (!matchIds.length) {
      return NextResponse.json({ ok: true, matches: 0, processed: 0 })
    }

    // 2) Para cada partido, recalcular estadísticas usando la misma lógica que el endpoint por-id
    const results: { matchId: string; ok: boolean; error?: string }[] = []

    for (const id of matchIds) {
      const { data: evRows, error: evErr } = await admin
        .from("match_events")
        .select("*")
        .eq("match_id", id)
        .order("occurred_at", { ascending: true })

      if (evErr) {
        results.push({ matchId: id, ok: false, error: evErr.message })
        continue
      }

      const { data: matchRow, error: mErr } = await admin
        .from("matches")
        .select("id, home_team_id, away_team_id, status")
        .eq("id", id)
        .single()

      if (mErr || !matchRow || matchRow.status !== "finalizado") {
        results.push({ matchId: id, ok: false, error: mErr?.message ?? "Partido no finalizado" })
        continue
      }

      const { data: homePlayers, error: homeErr } = await admin
        .from("players")
        .select("id, team_id")
        .eq("team_id", matchRow.home_team_id)
      if (homeErr) {
        results.push({ matchId: id, ok: false, error: homeErr.message })
        continue
      }

      const { data: awayPlayers, error: awayErr } = await admin
        .from("players")
        .select("id, team_id")
        .eq("team_id", matchRow.away_team_id)
      if (awayErr) {
        results.push({ matchId: id, ok: false, error: awayErr.message })
        continue
      }

      const allPlayers = [...(homePlayers ?? []), ...(awayPlayers ?? [])]

      // Deduplicar eventos de este partido (misma clave que en frontend)
      const seen = new Set<string>()
      const dedupedEvents = (evRows ?? []).filter((e) => {
        // Dedupe solo por id de evento para no colapsar intentos distintos de una serie de libres.
        const key = String(e.id)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      const PERIOD_SECONDS = 10 * 60
      const statsByPlayer = new Map<string, any>()

      for (const player of allPlayers) {
        const playerEvents = dedupedEvents.filter(
          (e: any) => e.player_id === player.id || e.victim_player_id === player.id,
        )
        const periods = new Set(playerEvents.map((e: any) => e.period))

        let totalSeconds = 0
        for (const periodValue of periods) {
          const periodEvents = playerEvents.filter((e: any) => e.period === periodValue)
          if (!periodEvents.length) continue

          const timesInSeconds = periodEvents
            .map((e: any) => {
              const [mm, ss] = String(e.game_time ?? "0:00").split(":").map((v: any) => Number(v))
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

        let points = 0
        let t1Made = 0,
          t1Att = 0
        let t2Made = 0,
          t2Att = 0
        let t3Made = 0,
          t3Att = 0
        let rebounds = 0,
          assists = 0,
          steals = 0,
          turnovers = 0
        let blocksCommitted = 0,
          blocksReceived = 0
        let foulsCommitted = 0,
          foulsReceived = 0
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
          match_id: id,
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

      const rows = Array.from(statsByPlayer.values())

      const { error: upsertErr } = await admin
        .from("match_player_stats")
        .upsert(rows, { onConflict: "match_id,player_id" })

      if (upsertErr) {
        results.push({ matchId: id, ok: false, error: upsertErr.message })
        continue
      }

      results.push({ matchId: id, ok: true })
    }

    const processed = results.filter((r) => r.ok).length

    return NextResponse.json({ ok: true, matches: matchIds.length, processed, results })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/matches/recalc-all-stats failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
