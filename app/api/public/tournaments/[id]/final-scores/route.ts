import { NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: tournamentId } = await ctx.params

    const admin = createSupabaseAdminClient()

    const { data: matches, error: matchesError } = await admin
      .from("matches")
      .select("id, status, home_team_id, away_team_id")
      .eq("tournament_id", tournamentId)
      .eq("status", "finalizado")

    if (matchesError) {
      return NextResponse.json({ error: matchesError.message }, { status: 400 })
    }

    const matchIds = (matches ?? []).map((m: any) => String(m.id)).filter(Boolean)
    if (matchIds.length === 0) {
      return NextResponse.json({ scores: {} })
    }

    // Prefer planilla stats; fallback to legacy stats if planilla is empty.
    let rows: any[] = []

    const { data: rowsPlanilla, error: planillaError } = await admin
      .from("match_player_stats_planilla")
      .select("match_id, team_id, points")
      .in("match_id", matchIds)

    if (planillaError) {
      return NextResponse.json({ error: planillaError.message }, { status: 400 })
    }

    if (Array.isArray(rowsPlanilla) && rowsPlanilla.length > 0) {
      rows = rowsPlanilla as any[]
    } else {
      const { data: rowsLegacy, error: legacyError } = await admin
        .from("match_player_stats")
        .select("match_id, team_id, points")
        .in("match_id", matchIds)

      if (legacyError) {
        return NextResponse.json({ error: legacyError.message }, { status: 400 })
      }

      if (Array.isArray(rowsLegacy) && rowsLegacy.length > 0) {
        rows = rowsLegacy as any[]
      }
    }

    const totalsByMatch: Record<string, Record<string, number>> = {}
    for (const r of rows) {
      const matchId = String(r.match_id)
      const teamId = String(r.team_id)
      const pts = typeof r.points === "number" ? r.points : 0
      if (!totalsByMatch[matchId]) totalsByMatch[matchId] = {}
      totalsByMatch[matchId][teamId] = (totalsByMatch[matchId][teamId] ?? 0) + pts
    }

    const scores: Record<string, { home: number; away: number }> = {}
    for (const m of matches as any[]) {
      const matchId = String(m.id)
      const homeTeamId = String(m.home_team_id)
      const awayTeamId = String(m.away_team_id)
      const totals = totalsByMatch[matchId]
      if (!totals) continue

      const home = totals[homeTeamId] ?? 0
      const away = totals[awayTeamId] ?? 0
      scores[matchId] = { home, away }
    }

    return NextResponse.json({ scores })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/public/tournaments/[id]/final-scores failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
