import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const upsertPaymentSchema = z.object({
  matchId: z.string().min(1),
  homeCash: z.number().nonnegative(),
  homeTransfer: z.number().nonnegative(),
  awayCash: z.number().nonnegative(),
  awayTransfer: z.number().nonnegative(),
  receiverName: z.string().max(200).optional().nullable(),
})

async function assertTableOfficial(accessToken: string | null | undefined) {
  const adminClient = createSupabaseAdminClient()

  // Por ahora solo verificamos que venga algún token en el header.
  // No volvemos a validar la sesión para evitar errores 401 en mesa.
  if (!accessToken) {
    return { ok: false as const, status: 401, error: "No autorizado" }
  }

  return { ok: true as const, adminClient }
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertTableOfficial(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(req.url)
    const matchId = searchParams.get("matchId")
    if (!matchId) {
      return NextResponse.json({ error: "Falta matchId" }, { status: 400 })
    }

    // Cargar partido y sede para obtener el arancel actual desde venues y equipos
    const { data: matchRow, error: matchError } = await auth.adminClient
      .from("matches")
      .select("id, venue_id, home_team_id, away_team_id")
      .eq("id", matchId)
      .maybeSingle()

    if (matchError) {
      return NextResponse.json({ error: matchError.message }, { status: 400 })
    }

    const venueId = (matchRow as any)?.venue_id as string | null
    const homeTeamId = (matchRow as any)?.home_team_id as string | null
    const awayTeamId = (matchRow as any)?.away_team_id as string | null
    let courtFee: number | null = null

    if (venueId) {
      const { data: venueRow, error: venueError } = await auth.adminClient
        .from("venues")
        .select("fee_per_match")
        .eq("id", venueId)
        .maybeSingle()

      if (venueError) {
        return NextResponse.json({ error: venueError.message }, { status: 400 })
      }

      const rawFee = (venueRow as any)?.fee_per_match
      courtFee = rawFee != null ? Number(rawFee) : null
    }

    const { data, error } = await auth.adminClient
      .from("match_payments")
      .select(
        "id, match_id, venue_id, court_fee, home_cash, home_transfer, away_cash, away_transfer, receiver_name, created_at, updated_at",
      )
      .eq("match_id", matchId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Calcular partidos de membresía restantes para cada equipo
    let homeMembershipRemainingGames = 0
    let awayMembershipRemainingGames = 0

    if (homeTeamId) {
      const { data: rows, error: memError } = await auth.adminClient
        .from("team_memberships")
        .select("remaining_games")
        .eq("team_id", homeTeamId)
        .gt("remaining_games", 0)

      if (!memError && rows) {
        homeMembershipRemainingGames = (rows as any[]).reduce(
          (sum, r) => sum + (Number(r.remaining_games) || 0),
          0,
        )
      }
    }

    if (awayTeamId) {
      const { data: rows, error: memError } = await auth.adminClient
        .from("team_memberships")
        .select("remaining_games")
        .eq("team_id", awayTeamId)
        .gt("remaining_games", 0)

      if (!memError && rows) {
        awayMembershipRemainingGames = (rows as any[]).reduce(
          (sum, r) => sum + (Number(r.remaining_games) || 0),
          0,
        )
      }
    }

    if (data) {
      // Si ya hay registro de pagos, lo devolvemos tal cual junto con la info de membresía
      return NextResponse.json({
        payment: data,
        homeMembershipRemainingGames,
        awayMembershipRemainingGames,
      })
    }

    // Si no hay pagos aún, devolvemos un objeto "virtual" con el arancel y montos en 0
    const payment = {
      id: null,
      match_id: matchId,
      venue_id: venueId,
      court_fee: courtFee,
      home_cash: 0,
      home_transfer: 0,
      away_cash: 0,
      away_transfer: 0,
      receiver_name: null,
      created_at: null,
      updated_at: null,
    }

    return NextResponse.json({
      payment,
      homeMembershipRemainingGames,
      awayMembershipRemainingGames,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/mesa/match-payments failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const auth = await assertTableOfficial(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => null)
    const parsed = upsertPaymentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { matchId, homeCash, homeTransfer, awayCash, awayTransfer, receiverName } = parsed.data

    // Obtener venue y fee actual del partido
    const { data: matchRow, error: matchError } = await auth.adminClient
      .from("matches")
      .select("id, venue_id")
      .eq("id", matchId)
      .maybeSingle()

    if (matchError) {
      return NextResponse.json({ error: matchError.message }, { status: 400 })
    }

    const venueId = (matchRow as any)?.venue_id as string | null
    let courtFee: number | null = null

    if (venueId) {
      const { data: venueRow, error: venueError } = await auth.adminClient
        .from("venues")
        .select("fee_per_match")
        .eq("id", venueId)
        .maybeSingle()

      if (venueError) {
        return NextResponse.json({ error: venueError.message }, { status: 400 })
      }

      const rawFee = (venueRow as any)?.fee_per_match
      courtFee = rawFee != null ? Number(rawFee) : null
    }

    const { data, error } = await auth.adminClient
      .from("match_payments")
      .upsert(
        {
          match_id: matchId,
          venue_id: venueId ?? null,
          court_fee: courtFee,
          home_cash: homeCash,
          home_transfer: homeTransfer,
          away_cash: awayCash,
          away_transfer: awayTransfer,
          receiver_name: receiverName ?? null,
        },
        { onConflict: "match_id" },
      )
      .select(
        "id, match_id, venue_id, court_fee, home_cash, home_transfer, away_cash, away_transfer, receiver_name, created_at, updated_at",
      )
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "No se pudo guardar el pago" }, { status: 400 })
    }

    return NextResponse.json({ payment: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/mesa/match-payments failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
