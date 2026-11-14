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

const PERIOD_SECONDS = 10 * 60

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: matchId } = await ctx.params

    const authHeader = req.headers.get("authorization")
    const m = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = m?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertAdmin(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const admin = auth.adminClient

    const url = new URL(req.url)
    const force = url.searchParams.get("force") === "1"

    const { data: matchRow, error: matchError } = await admin
      .from("matches")
      .select("id, home_team_id, away_team_id, home_score, away_score")
      .eq("id", matchId)
      .maybeSingle()

    if (matchError || !matchRow) {
      return NextResponse.json({ error: matchError?.message ?? "Partido no encontrado" }, { status: 404 })
    }

    const { data: evRows, error: evErr } = await admin
      .from("match_events")
      .select("*")
      .eq("match_id", matchId)
      .order("occurred_at", { ascending: true })

    if (evErr) {
      return NextResponse.json({ error: evErr.message }, { status: 400 })
    }

    const { data: homePlayers, error: homeErr } = await admin
      .from("players")
      .select("id, team_id")
      .eq("team_id", matchRow.home_team_id)
    if (homeErr) {
      return NextResponse.json({ error: homeErr.message }, { status: 400 })
    }

    const { data: awayPlayers, error: awayErr } = await admin
      .from("players")
      .select("id, team_id")
      .eq("team_id", matchRow.away_team_id)
    if (awayErr) {
      return NextResponse.json({ error: awayErr.message }, { status: 400 })
    }

    const allPlayers = [...(homePlayers ?? []), ...(awayPlayers ?? [])]

    // Deduplicar por CONTENIDO (igual que el historial en la UI), no por id,
    // porque en la base pueden existir jugadas repetidas con distinto id.
    const seen = new Set<string>()
    const events = (evRows ?? []).filter((e: any) => {
      const key = [
        e.type ?? "",
        e.team_id ?? "",
        e.player_id ?? "",
        e.victim_player_id ?? "",
        e.period ?? "",
        e.game_time ?? "",
        e.points ?? "",
        e.shot_type ?? "",
        String(e.made ?? ""),
      ].join("|")
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Detectar esquema de puntaje: si hay eventos "shot"/"free_throw" usamos esos;
    // si no, usamos eventos de tipo "points" (planillas antiguas).
    const hasShotScheme = events.some((e: any) => e.type === "shot" || e.type === "free_throw")

    const statsByPlayer = new Map<string, any>()

    for (const player of allPlayers) {
      const playerEvents = events.filter(
        (e: any) => e.player_id === player.id || e.victim_player_id === player.id,
      )

      // Minutos jugados (a partir de game_time por período)
      const periods = new Set(playerEvents.map((e: any) => e.period))
      let totalSeconds = 0
      for (const periodValue of periods) {
        const periodEvents = playerEvents.filter((e: any) => e.period === periodValue)
        const times = periodEvents
          .map((e: any) => {
            const [mm, ss] = String(e.game_time ?? "0:00").split(":").map((v: any) => Number(v))
            if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null
            return mm * 60 + ss
          })
          .filter((v: any): v is number => v !== null)
        if (!times.length) continue
        const maxR = Math.max(...times)
        const minR = Math.min(...times)
        if (Number.isFinite(maxR) && Number.isFinite(minR) && maxR >= minR) {
          totalSeconds += Math.min(maxR - minR, PERIOD_SECONDS)
        }
      }
      const minutes = totalSeconds / 60

      let points = 0
      let t1Made = 0, t1Att = 0
      let t2Made = 0, t2Att = 0
      let t3Made = 0, t3Att = 0
      let rebounds = 0, assists = 0, steals = 0, turnovers = 0
      let blocksCommitted = 0, blocksReceived = 0
      let foulsCommitted = 0, foulsReceived = 0
      let rating = 0

      for (const e of events) {
        const isActor = e.player_id === player.id
        const isVictim = e.victim_player_id === player.id
        if (!isActor && !isVictim) continue

        if (isActor) {
          if (e.type === "shot" && e.shot_type) {
            if (e.shot_type === 2) {
              t2Att += 1
              if (e.made) { t2Made += 1; points += 2; rating += 2 } else { rating -= 1 }
            } else if (e.shot_type === 3) {
              t3Att += 1
              if (e.made) { t3Made += 1; points += 3; rating += 3 } else { rating -= 1 }
            }
          } else if (e.type === "free_throw") {
            const fp = typeof e.points === "number" && e.points > 0 ? e.points : 1
            t1Att += fp
            if (e.made) { t1Made += fp; points += fp; rating += fp } else { rating -= fp }
          } else if (e.type === "points" && !hasShotScheme) {
            // Planillas antiguas: un evento "points" representa una conversión.
            const p = typeof e.points === "number" ? e.points : 0
            if (p === 1) { t1Att += 1; t1Made += 1 }
            else if (p === 2) { t2Att += 1; t2Made += 1 }
            else if (p === 3) { t3Att += 1; t3Made += 1 }
            points += p
            rating += p
          } else if (e.type === "rebound") {
            rebounds += 1; rating += 1
          } else if (e.type === "assist") {
            assists += 1; rating += 1
          } else if (e.type === "steal") {
            steals += 1; rating += 1
          } else if (e.type === "turnover") {
            turnovers += 1; rating -= 1
          } else if (e.type === "block") {
            blocksCommitted += 1; rating += 1
          } else if (e.type === "foul") {
            foulsCommitted += 1; rating -= 1
          }
        }

        if (isVictim) {
          if (e.type === "block") { blocksReceived += 1; rating -= 1 }
          else if (e.type === "foul") { foulsReceived += 1; rating += 1 }
        }
      }

      statsByPlayer.set(player.id, {
        match_id: matchId,
        team_id: player.team_id,
        player_id: player.id,
        minutes,
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

    const officialHome = matchRow.home_score ?? null
    const officialAway = matchRow.away_score ?? null

    const rawHome = rows
      .filter((r) => r.team_id === matchRow.home_team_id)
      .reduce((a, r) => a + (r.points ?? 0), 0)
    const rawAway = rows
      .filter((r) => r.team_id === matchRow.away_team_id)
      .reduce((a, r) => a + (r.points ?? 0), 0)

    // Reconciliar los puntos de cada equipo para que cierren EXACTAMENTE con el
    // marcador oficial (el historial puede estar duplicado/incompleto). Ajustamos
    // vía tiros libres para mantener points = t1 + 2*t2 + 3*t3 coherente.
    const reconcileTeam = (teamId: string, official: number | null) => {
      if (official == null) return
      const teamRows = rows.filter((r) => r.team_id === teamId)
      if (teamRows.length === 0) return

      let sum = teamRows.reduce((a, r) => a + (r.points ?? 0), 0)
      let delta = official - sum
      if (delta === 0) return

      // Orden por puntos y minutos (los que más jugaron/anotaron primero)
      teamRows.sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || (b.minutes ?? 0) - (a.minutes ?? 0))

      if (delta > 0) {
        let i = 0
        while (delta > 0) {
          const r = teamRows[i % teamRows.length]
          r.points += 1
          r.t1_made += 1
          r.t1_att += 1
          delta -= 1
          i += 1
        }
      } else {
        delta = -delta
        let i = 0
        while (delta > 0 && i < teamRows.length) {
          const r = teamRows[i]
          const p = r.points ?? 0
          if (p <= 0) {
            i += 1
            continue
          }
          const take = Math.min(p, delta)
          r.points = p - take
          // Restamos primero de libres para mantener coherencia
          const t1cut = Math.min(take, r.t1_made ?? 0)
          r.t1_made = (r.t1_made ?? 0) - t1cut
          r.t1_att = Math.max(r.t1_made, (r.t1_att ?? 0) - t1cut)
          delta -= take
          if (r.points <= 0) i += 1
        }
      }
    }

    reconcileTeam(matchRow.home_team_id as string, officialHome)
    reconcileTeam(matchRow.away_team_id as string, officialAway)

    const homePoints = rows
      .filter((r) => r.team_id === matchRow.home_team_id)
      .reduce((a, r) => a + (r.points ?? 0), 0)
    const awayPoints = rows
      .filter((r) => r.team_id === matchRow.away_team_id)
      .reduce((a, r) => a + (r.points ?? 0), 0)

    void force

    // Borramos filas previas (por ejemplo, filas en cero) y reescribimos.
    const { error: delErr } = await admin
      .from("match_player_stats_planilla")
      .delete()
      .eq("match_id", matchId)
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 })
    }

    if (rows.length > 0) {
      const { error: upErr } = await admin
        .from("match_player_stats_planilla")
        .upsert(rows, { onConflict: "match_id,player_id" })
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 400 })
      }
    }

    return NextResponse.json({
      ok: true,
      persisted: true,
      matchId,
      scheme: hasShotScheme ? "shot/free_throw" : "points",
      players: rows.length,
      reconstruido: { homePoints: rawHome, awayPoints: rawAway },
      guardado: { homePoints, awayPoints },
      oficial: { homePoints: officialHome, awayPoints: officialAway },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/matches/[id]/recalc-from-events failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
