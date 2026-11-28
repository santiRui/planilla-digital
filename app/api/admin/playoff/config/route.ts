import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const configSchema = z.object({
  tournamentId: z.string().min(1),
  qualifiedTeams: z.number().int().refine((v) => [2, 4, 8].includes(v), "Clasificados inválidos"),
  bestOfOctavos: z.number().int().min(1).max(9).optional(),
  bestOfCuartos: z.number().int().min(1).max(9),
  bestOfSemifinal: z.number().int().min(1).max(9),
  bestOfFinal: z.number().int().min(1).max(9),
  tiebreakMode: z.enum(["olimpico_sorteo", "olimpico_sin_sorteo", "labas"]),
  // Configuración opcional para formato Juegos Olímpicos
  joPlayoffTotal: z.number().int().min(2).max(16).optional(),
  joFromGanadores: z.number().int().min(0).max(16).optional(),
  joFromPerdedores: z.number().int().min(0).max(16).optional(),
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
  // Validación básica existente
  void phaseFromQualified(qualifiedTeams)
  void bestOfForPhase({
    bestOfCuartos: config.bestOfCuartos,
    bestOfSemifinal: config.bestOfSemifinal,
    bestOfFinal: config.bestOfFinal,
  })

  // Validación adicional para configuración Juegos Olímpicos
  const { joPlayoffTotal, joFromGanadores, joFromPerdedores } = config as {
    joPlayoffTotal?: number
    joFromGanadores?: number
    joFromPerdedores?: number
  }

  const anyJo =
    typeof joPlayoffTotal === "number" ||
    typeof joFromGanadores === "number" ||
    typeof joFromPerdedores === "number"

  if (anyJo) {
    if (
      typeof joPlayoffTotal !== "number" ||
      typeof joFromGanadores !== "number" ||
      typeof joFromPerdedores !== "number"
    ) {
      throw new Error(
        "Configuración Juegos Olímpicos incompleta: total, desde Ganadores y desde Perdedores son requeridos juntos.",
      )
    }
    if (joFromGanadores + joFromPerdedores !== joPlayoffTotal) {
      throw new Error(
        "Configuración Juegos Olímpicos inválida: joFromGanadores + joFromPerdedores debe igualar joPlayoffTotal.",
      )
    }
  }
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

    const columns = "tournament_id, qualified_teams, best_of_cuartos, best_of_semifinal, best_of_final, tiebreak_mode, jo_playoff_total, jo_from_ganadores, jo_from_perdedores"
    let { data, error } = await auth.adminClient
      .from("tournament_playoff_config")
      .select(`${columns}, best_of_octavos`)
      .eq("tournament_id", tournamentId)
      .maybeSingle()

    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      const legacy = await auth.adminClient
        .from("tournament_playoff_config")
        .select(columns)
        .eq("tournament_id", tournamentId)
        .maybeSingle()
      data = legacy.data ? { ...legacy.data, best_of_octavos: 1 } : null
      error = legacy.error
    }

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
        bestOfOctavos: (data as any).best_of_octavos ?? 1,
        bestOfCuartos: data.best_of_cuartos,
        bestOfSemifinal: data.best_of_semifinal,
        bestOfFinal: data.best_of_final,
        tiebreakMode: data.tiebreak_mode as TiebreakMode,
        joPlayoffTotal: data.jo_playoff_total,
        joFromGanadores: data.jo_from_ganadores,
        joFromPerdedores: data.jo_from_perdedores,
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

    const {
      tournamentId,
      qualifiedTeams,
      bestOfOctavos,
      bestOfCuartos,
      bestOfSemifinal,
      bestOfFinal,
      tiebreakMode,
      joPlayoffTotal,
      joFromGanadores,
      joFromPerdedores,
    } = parsed.data

    if (joPlayoffTotal != null) {
      const { data: existing, error: existingError } = await auth.adminClient
        .from("playoff_series").select("id").eq("tournament_id", tournamentId).limit(1)
      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 })
      if (existing?.length) {
        return NextResponse.json({ error: "Ya hay playoffs generados. No se pueden cambiar los cupos." }, { status: 409 })
      }
    }

    const { error } = await auth.adminClient.from("tournament_playoff_config").upsert({
      tournament_id: tournamentId,
      qualified_teams: qualifiedTeams,
      best_of_cuartos: bestOfCuartos,
      best_of_semifinal: bestOfSemifinal,
      best_of_final: bestOfFinal,
      tiebreak_mode: tiebreakMode,
      jo_playoff_total: joPlayoffTotal ?? null,
      jo_from_ganadores: joFromGanadores ?? null,
      jo_from_perdedores: joFromPerdedores ?? null,
      ...(joPlayoffTotal != null ? { jo_bracket_version: 2, best_of_octavos: bestOfOctavos ?? 1 } : {}),
    })

    if (error) {
      return NextResponse.json({
        error: joPlayoffTotal != null && (error.code === "42703" || error.code === "PGRST204")
          ? "Falta aplicar las migraciones de playoffs olímpicos en Supabase."
          : error.message,
      }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      config: {
        tournamentId,
        qualifiedTeams,
        startPhase: phaseFromQualified(qualifiedTeams),
        bestOfOctavos: bestOfOctavos ?? 1,
        bestOfCuartos,
        bestOfSemifinal,
        bestOfFinal,
        tiebreakMode,
        joPlayoffTotal: joPlayoffTotal ?? null,
        joFromGanadores: joFromGanadores ?? null,
        joFromPerdedores: joFromPerdedores ?? null,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("PUT /api/admin/playoff/config failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
