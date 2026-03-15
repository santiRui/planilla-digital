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

function pickRandom<T>(arr: T[]): T | undefined {
  if (!arr.length) return undefined
  const idx = Math.floor(Math.random() * arr.length)
  return arr[idx]
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

    const body = (await req.json().catch(() => null)) as
      | {
          matchId?: string
          homeScore?: number
          awayScore?: number
          clearExisting?: boolean
        }
      | null

    if (!body || !body.matchId) {
      return NextResponse.json({ error: "matchId requerido" }, { status: 400 })
    }

    const matchId = body.matchId
    const homeScore = typeof body.homeScore === "number" ? body.homeScore : 0
    const awayScore = typeof body.awayScore === "number" ? body.awayScore : 0
    const clearExisting = body.clearExisting ?? true

    const { data: mRow, error: mError } = await admin
      .from("matches")
      .select("id, home_team_id, away_team_id, status, home_score, away_score")
      .eq("id", matchId)
      .maybeSingle()

    if (mError || !mRow) {
      return NextResponse.json({ error: mError?.message ?? "Partido no encontrado" }, { status: 400 })
    }

    const homeTeamId = mRow.home_team_id as string
    const awayTeamId = mRow.away_team_id as string

    // Cargar jugadoras de ambos equipos
    const { data: playersRows, error: playersError } = await admin
      .from("players")
      .select("id, team_id")
      .in("team_id", [homeTeamId, awayTeamId])

    if (playersError) {
      return NextResponse.json({ error: playersError.message }, { status: 400 })
    }

    const playersByTeam: Record<string, { id: string }[]> = {}
    for (const p of playersRows ?? []) {
      const teamId = p.team_id as string
      if (!playersByTeam[teamId]) playersByTeam[teamId] = []
      playersByTeam[teamId].push({ id: p.id as string })
    }

    if (!playersByTeam[homeTeamId]?.length || !playersByTeam[awayTeamId]?.length) {
      return NextResponse.json(
        { error: "No hay jugadoras registradas para alguno de los equipos de este partido" },
        { status: 400 },
      )
    }

    if (clearExisting) {
      await admin.from("match_player_stats_planilla").delete().eq("match_id", matchId)
    }

    type FakeRow = {
      match_id: string
      team_id: string
      player_id: string
      minutes: number
      points: number
      t1_made: number
      t1_att: number
      t2_made: number
      t2_att: number
      t3_made: number
      t3_att: number
      rebounds: number
      assists: number
      steals: number
      turnovers: number
      blocks_committed: number
      blocks_received: number
      fouls_committed: number
      fouls_received: number
      rating: number
    }

    const rows: FakeRow[] = []

    function generateForTeam(teamId: string, score: number) {
      const teamPlayers = playersByTeam[teamId] ?? []
      if (!teamPlayers.length) return

      const n = teamPlayers.length

      // Elegimos entre 4 y min(7, n) anotadoras (si hay pocas jugadoras, mínimo 1-3)
      let maxScorers = Math.min(7, n)
      let minScorers = Math.min(4, n)
      if (n <= 3) {
        minScorers = 1
        maxScorers = n
      }
      const numScorers = Math.max(minScorers, Math.min(maxScorers, 4 + Math.floor(Math.random() * 3)))

      const shuffled = [...teamPlayers].sort(() => Math.random() - 0.5)
      const scorers = shuffled.slice(0, numScorers)

      // Distribuir minutos: varias entre 20-30 y resto entre 10-20, sumando aprox 200
      const minutesPerPlayer: Record<string, number> = {}
      const coreCount = Math.min(5, n)
      const cores = shuffled.slice(0, coreCount)
      const bench = shuffled.slice(coreCount)

      let totalMinutes = 0
      for (const p of cores) {
        const base = 20 + Math.floor(Math.random() * 11) // 20-30
        minutesPerPlayer[p.id] = base
        totalMinutes += base
      }
      for (const p of bench) {
        const base = 10 + Math.floor(Math.random() * 11) // 10-20
        minutesPerPlayer[p.id] = base
        totalMinutes += base
      }

      if (totalMinutes === 0) totalMinutes = 1
      const scale = 200 / totalMinutes
      let scaledTotal = 0
      for (const p of teamPlayers) {
        const raw = minutesPerPlayer[p.id] ?? 0
        const scaled = Math.round(raw * scale)
        minutesPerPlayer[p.id] = scaled
        scaledTotal += scaled
      }

      // Ajuste fino para que la suma sea exactamente 200
      let delta = 200 - scaledTotal
      let idx = 0
      const allPlayers = [...teamPlayers]
      while (delta !== 0 && allPlayers.length > 0) {
        const p = allPlayers[idx % allPlayers.length]
        const current = minutesPerPlayer[p.id] ?? 0
        if (delta > 0) {
          minutesPerPlayer[p.id] = current + 1
          delta -= 1
        } else if (current > 0) {
          minutesPerPlayer[p.id] = current - 1
          delta += 1
        }
        idx += 1
        if (idx > 1000) break
      }

      // Distribuir puntos de forma suave, cap ~15 por jugadora
      const MAX_PTS_PER_PLAYER = 15
      const pointsPerPlayer: Record<string, number> = {}
      let remaining = Math.max(0, score)

      // Inicializar con 0
      for (const p of scorers) pointsPerPlayer[p.id] = 0

      // Repartir de a 1 punto rotando las anotadoras hasta llegar al score o al cap
      let safety = 0
      while (remaining > 0 && safety < 10000) {
        for (const p of scorers) {
          if (remaining <= 0) break
          const current = pointsPerPlayer[p.id] ?? 0
          if (current >= MAX_PTS_PER_PLAYER) continue
          pointsPerPlayer[p.id] = current + 1
          remaining -= 1
          if (remaining <= 0) break
        }
        safety += 1
        if (safety > 1000) break
      }

      // Crear filas con tiros errados y pérdidas
      for (const p of teamPlayers) {
        const pts = pointsPerPlayer[p.id] ?? 0

        // Convertir puntos a combinación simple de T2/T1/T3
        let remaining = pts
        let t3_made = 0
        let t2_made = 0
        let t1_made = 0

        // Alguna probabilidad de triples si tiene muchos puntos
        while (remaining >= 3 && Math.random() < 0.3) {
          t3_made += 1
          remaining -= 3
        }
        while (remaining >= 2) {
          t2_made += 1
          remaining -= 2
        }
        t1_made = remaining

        // Intentos: algo más de tiros errados que convertidos, pero sin exagerar
        const t2_miss = t2_made > 0 ? Math.floor(t2_made * 0.5) + Math.floor(Math.random() * 3) : Math.floor(Math.random() * 2)
        const t1_miss = t1_made > 0 ? Math.floor(t1_made * 0.5) + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 2)
        const t3_miss =
          t3_made > 0
            ? Math.floor(t3_made * 0.7) + Math.floor(Math.random() * 3)
            : pts > 0
              ? Math.floor(Math.random() * 2)
              : 0

        // Pérdidas: más para quienes juegan más y anotan
        const baseMinutes = minutesPerPlayer[p.id] ?? 0
        let turnovers = 0
        if (baseMinutes >= 25 || pts >= 8) {
          turnovers = 2 + Math.floor(Math.random() * 3) // 2-4
        } else if (baseMinutes >= 15 || pts >= 4) {
          turnovers = Math.floor(Math.random() * 3) // 0-2
        } else {
          turnovers = Math.random() < 0.3 ? 1 : 0
        }

        // Otras estadísticas básicas: rebotes, asistencias, robos, tapas, faltas
        const isCore = baseMinutes >= 20
        const rebounds = isCore ? Math.floor(Math.random() * 7) : Math.floor(Math.random() * 4)
        // Asistencias: un poco más frecuentes en las jugadoras principales
        const assists = isCore ? (1 + Math.floor(Math.random() * 4)) : Math.floor(Math.random() * 2)
        const steals = Math.floor(Math.random() * (isCore ? 4 : 2))
        const blocks_committed = Math.random() < 0.3 ? 1 : 0
        const blocks_received = Math.random() < 0.2 ? 1 : 0
        // Faltas: más bajas por jugadora para acercarse a 9-16 por equipo
        const fouls_committed = isCore ? (1 + Math.floor(Math.random() * 2)) : Math.floor(Math.random() * 2) // core 1-2, resto 0-1
        const fouls_received = Math.floor(Math.random() * (isCore ? 3 : 2))

        // Valoración muy simple: puntos + rebotes + asistencias + robos + tapas - pérdidas - faltas cometidas
        const rating =
          pts + rebounds + assists + steals + blocks_committed - turnovers - Math.floor(fouls_committed / 2)

        const row: FakeRow = {
          match_id: matchId,
          team_id: teamId,
          player_id: p.id,
          minutes: minutesPerPlayer[p.id] ?? 0,
          points: pts,
          t1_made,
          t1_att: t1_made + t1_miss,
          t2_made,
          t2_att: t2_made + t2_miss,
          t3_made,
          t3_att: t3_made + t3_miss,
          rebounds,
          assists,
          steals,
          turnovers,
          blocks_committed,
          blocks_received,
          fouls_committed,
          fouls_received,
          rating,
        }

        rows.push(row)
      }
    }

    generateForTeam(homeTeamId, homeScore)
    generateForTeam(awayTeamId, awayScore)

    if (!rows.length) {
      return NextResponse.json({ error: "No se pudieron generar filas de estadísticas" }, { status: 400 })
    }

    const { error: upsertError } = await admin
      .from("match_player_stats_planilla")
      .upsert(rows, { onConflict: "match_id,player_id" })

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 })
    }

    // Opcional: actualizar el marcador oficial si está vacío o distinto
    const patch: any = {}
    if (typeof homeScore === "number") patch.home_score = homeScore
    if (typeof awayScore === "number") patch.away_score = awayScore
    if (Object.keys(patch).length > 0) {
      await admin.from("matches").update(patch).eq("id", matchId)
    }

    return NextResponse.json({ ok: true, matchId, homeScore, awayScore, rows: rows.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/matches/fake-stats failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
