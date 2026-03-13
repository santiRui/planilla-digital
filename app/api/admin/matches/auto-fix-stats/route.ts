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

    // Obtener todos los partidos finalizados
    const { data: matches, error: matchErr } = await admin
      .from("matches")
      .select("id, home_team_id, away_team_id, home_score, away_score, status")
      .eq("status", "finalizado")

    if (matchErr) {
      return NextResponse.json({ error: matchErr.message }, { status: 400 })
    }

    const results: { matchId: string; ok: boolean; error?: string }[] = []

    for (const m of matches ?? []) {
      const matchId = m.id as string
      try {
        // Leer stats de este partido
        const { data: statsRows, error: statsErr } = await admin
          .from("match_player_stats")
          .select("*")
          .eq("match_id", matchId)

        if (statsErr) {
          results.push({ matchId, ok: false, error: statsErr.message })
          continue
        }

        const rows = (statsRows ?? []).map((row: any) => ({ ...row }))
        if (!rows.length) {
          results.push({ matchId, ok: true })
          continue
        }

        const homeTeamId = m.home_team_id as string
        const awayTeamId = m.away_team_id as string
        const homeScore = (m.home_score ?? 0) as number
        const awayScore = (m.away_score ?? 0) as number

        const byTeam: Record<string, any[]> = {}
        for (const r of rows) {
          if (!byTeam[r.team_id]) byTeam[r.team_id] = []
          byTeam[r.team_id].push(r)
        }

        const TEAM_MINUTES_CAP = 200
        const PLAYER_MINUTES_CAP = 40
        const T2_CAP = 12
        const T1_CAP = 6
        const T3_CAP = 3

        const applyCapsAndRecalc = (teamId: string, targetScore: number) => {
          const teamRows = byTeam[teamId] ?? []
          if (!teamRows.length) return

          // 1) Caps por jugadora
          for (const r of teamRows) {
            // minutos por jugadora
            if (typeof r.minutes === "number" && r.minutes > PLAYER_MINUTES_CAP) {
              r.minutes = PLAYER_MINUTES_CAP
            }

            const clamp = (value: any, max: number) => {
              const n = typeof value === "number" ? value : 0
              return n > max ? max : n
            }

            r.t2_att = clamp(r.t2_att, T2_CAP)
            r.t2_made = clamp(r.t2_made, r.t2_att)

            r.t1_att = clamp(r.t1_att, T1_CAP)
            r.t1_made = clamp(r.t1_made, r.t1_att)

            r.t3_att = clamp(r.t3_att, T3_CAP)
            r.t3_made = clamp(r.t3_made, r.t3_att)

            // Recalcular puntos teóricos a partir de T1/T2/T3 después de caps
            const basePoints =
              (r.t1_made ?? 0) * 1 + (r.t2_made ?? 0) * 2 + (r.t3_made ?? 0) * 3
            r.points = basePoints
          }

          // 2) Cap total de minutos del equipo
          let totalMinutes = teamRows.reduce(
            (acc, r) => acc + (typeof r.minutes === "number" ? r.minutes : 0),
            0,
          )
          if (totalMinutes > TEAM_MINUTES_CAP && totalMinutes > 0) {
            const factor = TEAM_MINUTES_CAP / totalMinutes
            for (const r of teamRows) {
              if (typeof r.minutes === "number") {
                r.minutes = Math.round(r.minutes * factor * 100) / 100
              }
            }
          }

          // 3) Ajustar puntos para que sumen al marcador oficial
          let teamPoints = teamRows.reduce(
            (acc, r) => acc + (typeof r.points === "number" ? r.points : 0),
            0,
          )

          let delta = Math.round(targetScore - teamPoints)
          if (delta === 0) return

          // Orden base: jugadoras con más puntos y minutos primero
          teamRows.sort((a, b) => {
            const pa = a.points ?? 0
            const pb = b.points ?? 0
            if (pb !== pa) return pb - pa
            const ma = a.minutes ?? 0
            const mb = b.minutes ?? 0
            return mb - ma
          })

          if (delta > 0) {
            // Repartir puntos extra sumando de a 1
            let idx = 0
            const n = teamRows.length
            while (delta > 0 && n > 0) {
              const r = teamRows[idx % n]
              r.points = (r.points ?? 0) + 1
              delta -= 1
              idx += 1
            }
          } else if (delta < 0) {
            delta = -delta
            // Restar puntos empezando por las que más tienen, sin quedar negativos
            teamRows.sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
            let i = 0
            while (delta > 0 && i < teamRows.length) {
              const r = teamRows[i]
              let p = r.points ?? 0
              if (p === 0) {
                i += 1
                continue
              }
              const canRemove = Math.min(p, delta)
              r.points = p - canRemove
              delta -= canRemove
              if (r.points === 0) {
                i += 1
              }
            }
          }
        }

        applyCapsAndRecalc(homeTeamId, homeScore)
        applyCapsAndRecalc(awayTeamId, awayScore)

        // Persistir cambios
        const payload = rows.map((r: any) => ({
          match_id: r.match_id,
          team_id: r.team_id,
          player_id: r.player_id,
          minutes: r.minutes,
          points: r.points,
          t1_made: r.t1_made,
          t1_att: r.t1_att,
          t2_made: r.t2_made,
          t2_att: r.t2_att,
          t3_made: r.t3_made,
          t3_att: r.t3_att,
          rebounds: r.rebounds,
          assists: r.assists,
          steals: r.steals,
          turnovers: r.turnovers,
          blocks_committed: r.blocks_committed,
          blocks_received: r.blocks_received,
          fouls_committed: r.fouls_committed,
          fouls_received: r.fouls_received,
          rating: r.rating,
        }))

        const { error: upsertErr } = await admin
          .from("match_player_stats")
          .upsert(payload, { onConflict: "match_id,player_id" })

        if (upsertErr) {
          results.push({ matchId, ok: false, error: upsertErr.message })
          continue
        }

        results.push({ matchId, ok: true })
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error interno"
        results.push({ matchId: m.id as string, ok: false, error: msg })
      }
    }

    const processed = results.filter((r) => r.ok).length
    return NextResponse.json({ ok: true, processed, matches: matches?.length ?? 0, results })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/matches/auto-fix-stats failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
