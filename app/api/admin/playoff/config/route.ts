import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const configSchema = z.object({
  tournamentId: z.string().min(1),
  qualifiedTeams: z.number().int().refine((v) => [2, 4, 8].includes(v), "Clasificados inválidos"),
  bestOfCuartos: z.number().int().min(1).max(9),
  bestOfSemifinal: z.number().int().min(1).max(9),
  bestOfFinal: z.number().int().min(1).max(9),
  tiebreakMode: z.enum(["olimpico_sorteo", "olimpico_sin_sorteo", "labas"]),
})

type TiebreakMode = "olimpico_sorteo" | "olimpico_sin_sorteo" | "labas"

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

function phaseFromQualified(qualifiedTeams: number) {
  if (qualifiedTeams === 8) return "cuartos" as const
  if (qualifiedTeams === 4) return "semifinal" as const
  return "final" as const
}

function bestOfForPhase(config: {
  bestOfCuartos: number
  bestOfSemifinal: number
  bestOfFinal: number
}) {
  return {
    cuartos: config.bestOfCuartos,
    semifinal: config.bestOfSemifinal,
    final: config.bestOfFinal,
  }
}

async function ensureValidConfig(qualifiedTeams: number, config: any) {
  // Only validate according to your rule: qualified_teams determines starting phase.
  // We still store best-of for all phases, but will only use those that are reached.
  void phaseFromQualified(qualifiedTeams)
  void bestOfForPhase(config)
}

export async function GET(req: Request) {
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

    const { searchParams } = new URL(req.url)
    const tournamentId = searchParams.get("tournamentId")

    if (!tournamentId) {
      return NextResponse.json({ error: "Falta tournamentId" }, { status: 400 })
    }

    const { data, error } = await auth.adminClient
      .from("tournament_playoff_config")
      .select("tournament_id, qualified_teams, best_of_cuartos, best_of_semifinal, best_of_final, tiebreak_mode")
      .eq("tournament_id", tournamentId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (!data) {
      return NextResponse.json({ config: null })
    }

    return NextResponse.json({
      config: {
        tournamentId: data.tournament_id,
        qualifiedTeams: data.qualified_teams,
        startPhase: phaseFromQualified(data.qualified_teams),
        bestOfCuartos: data.best_of_cuartos,
        bestOfSemifinal: data.best_of_semifinal,
        bestOfFinal: data.best_of_final,
        tiebreakMode: data.tiebreak_mode as TiebreakMode,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/playoff/config failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
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

    const body = await req.json().catch(() => null)
    const parsed = configSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    await ensureValidConfig(parsed.data.qualifiedTeams, parsed.data)

    const { tournamentId, qualifiedTeams, bestOfCuartos, bestOfSemifinal, bestOfFinal, tiebreakMode } = parsed.data

    const { error } = await auth.adminClient.from("tournament_playoff_config").upsert({
      tournament_id: tournamentId,
      qualified_teams: qualifiedTeams,
      best_of_cuartos: bestOfCuartos,
      best_of_semifinal: bestOfSemifinal,
      best_of_final: bestOfFinal,
      tiebreak_mode: tiebreakMode,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      config: {
        tournamentId,
        qualifiedTeams,
        startPhase: phaseFromQualified(qualifiedTeams),
        bestOfCuartos,
        bestOfSemifinal,
        bestOfFinal,
        tiebreakMode,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("PUT /api/admin/playoff/config failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
