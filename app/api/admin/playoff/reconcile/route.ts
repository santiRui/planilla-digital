import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { resolveSeriesAndMaybeAdvance } from "@/app/api/mesa/matches/[id]/route"

const requestSchema = z.object({ tournamentId: z.string().uuid() })

export async function POST(req: Request) {
  try {
    const accessToken = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const admin = createSupabaseAdminClient()
    const user = createSupabaseServerClient(accessToken)
    const { data: authData, error: authError } = await user.auth.getUser()
    if (authError || !authData.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const { data: profile, error: profileError } = await admin
      .from("profiles").select("role").eq("id", authData.user.id).maybeSingle()
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 })
    if (profile?.role !== "admin") return NextResponse.json({ error: "Prohibido" }, { status: 403 })

    const parsed = requestSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Torneo inválido" }, { status: 400 })
    const tournamentId = parsed.data.tournamentId
    const { data: tournament, error: tournamentError } = await admin
      .from("tournaments").select("format").eq("id", tournamentId).maybeSingle()
    if (tournamentError) return NextResponse.json({ error: tournamentError.message }, { status: 400 })
    if (!tournament) return NextResponse.json({ error: "Torneo no encontrado." }, { status: 404 })
    if (tournament.format === "juegos_olimpicos") {
      return NextResponse.json({ error: "Esta revisión solo corresponde a torneos normales." }, { status: 400 })
    }

    const { data: series, error: seriesError } = await admin
      .from("playoff_series").select("id, phase, series_index").eq("tournament_id", tournamentId)
    if (seriesError) return NextResponse.json({ error: seriesError.message }, { status: 400 })
    const rows = (series ?? []).filter((row) => ["cuartos", "semifinal", "final"].includes(row.phase))
    if (!rows.length) return NextResponse.json({ error: "El torneo no tiene series para revisar." }, { status: 404 })

    const { data: games, error: gamesError } = await admin
      .from("matches")
      .select("id, playoff_series_id, series_game_number")
      .in("playoff_series_id", rows.map((row) => row.id))
      .eq("status", "finalizado")
      .order("series_game_number", { ascending: false })
    if (gamesError) return NextResponse.json({ error: gamesError.message }, { status: 400 })

    const lastGame = new Map<string, string>()
    for (const game of games ?? []) {
      if (game.playoff_series_id && !lastGame.has(game.playoff_series_id)) {
        lastGame.set(game.playoff_series_id, game.id)
      }
    }

    const phaseOrder = { cuartos: 0, semifinal: 1, final: 2 }
    rows.sort((a, b) =>
      phaseOrder[a.phase as keyof typeof phaseOrder] - phaseOrder[b.phase as keyof typeof phaseOrder] ||
      a.series_index - b.series_index)
    let reviewed = 0
    for (const row of rows) {
      if (!lastGame.has(row.id)) continue
      await resolveSeriesAndMaybeAdvance(admin, {
        playoff_series_id: row.id,
        phase: row.phase,
        status: "finalizado",
      } as Parameters<typeof resolveSeriesAndMaybeAdvance>[1])
      reviewed++
    }

    return NextResponse.json({ ok: true, reviewed })
  } catch (error) {
    console.error("POST /api/admin/playoff/reconcile failed:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron revisar las series." },
      { status: 500 },
    )
  }
}
