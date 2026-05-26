import { NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: tournamentId } = await ctx.params
    const admin = createSupabaseAdminClient()

    const { data: leaderRows, error: leadersError } = await admin
      .from("tournament_player_leaders")
      .select(
        "tournament_id, player_id, games, points, rebounds, assists, steals, blocks, fouls_received, players(id, first_name, last_name, jersey_number)",
      )
      .eq("tournament_id", tournamentId)

    if (leadersError) {
      return NextResponse.json({ error: leadersError.message }, { status: 400 })
    }

    const asArray = (leaderRows ?? []).map((r: any) => ({
      playerId: String(r.player_id),
      games: Number(r.games ?? 0),
      points: Number(r.points ?? 0),
      rebounds: Number(r.rebounds ?? 0),
      assists: Number(r.assists ?? 0),
      steals: Number(r.steals ?? 0),
      blocks: Number(r.blocks ?? 0),
      foulsReceived: Number(r.fouls_received ?? 0),
      jerseyNumber: (r.players?.jersey_number as number | null) ?? null,
      firstName: String(r.players?.first_name ?? ""),
      lastName: String(r.players?.last_name ?? ""),
    }))

    const limit = 10

    const topScorers = [...asArray]
      .sort((a, b) => b.points - a.points || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topRebounders = [...asArray]
      .sort((a, b) => b.rebounds - a.rebounds || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topAssistants = [...asArray]
      .sort((a, b) => b.assists - a.assists || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topStealers = [...asArray]
      .sort((a, b) => b.steals - a.steals || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topBlockers = [...asArray]
      .sort((a, b) => b.blocks - a.blocks || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    const topFoulsReceived = [...asArray]
      .sort((a, b) => b.foulsReceived - a.foulsReceived || (b.games || 0) - (a.games || 0))
      .slice(0, limit)

    return NextResponse.json({ topScorers, topRebounders, topAssistants, topStealers, topBlockers, topFoulsReceived })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/public/tournaments/[id]/leaders failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
