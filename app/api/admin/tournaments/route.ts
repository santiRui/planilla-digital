import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const createTournamentSchema = z.object({
  name: z.string().min(1),
  year: z.number().int().min(1900).max(3000),
  branch: z.enum(["masculino", "femenino", "mixto"]),
  status: z.enum(["pendiente", "activo", "finalizado"]),
  categoryId: z.string().min(1),
})

function shortNameFrom(name: string) {
  const cleaned = name.trim().replace(/\s+/g, " ")
  if (cleaned.length <= 16) return cleaned
  return cleaned.slice(0, 16)
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const parsed = createTournamentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const adminClient = createSupabaseAdminClient()
    const userClient = createSupabaseServerClient(accessToken)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const callerId = userData.user.id

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .maybeSingle()

    if (callerProfileError) {
      return NextResponse.json({ error: callerProfileError.message }, { status: 400 })
    }

    if (callerProfile?.role !== "admin") {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 })
    }

    const { name, year, branch, status, categoryId } = parsed.data

    const { data: category, error: categoryError } = await adminClient
      .from("categories")
      .select("id, branch")
      .eq("id", categoryId)
      .maybeSingle()

    if (categoryError) {
      return NextResponse.json({ error: categoryError.message }, { status: 400 })
    }

    if (!category) {
      return NextResponse.json({ error: "Categoría no encontrada" }, { status: 400 })
    }

    if ((category as any).branch !== branch) {
      return NextResponse.json({ error: "La rama del torneo debe coincidir con la rama de la categoría" }, { status: 400 })
    }

    const { data: tournament, error: tournamentError } = await adminClient
      .from("tournaments")
      .insert({
        name,
        short_name: shortNameFrom(name),
        year,
        branch,
        status,
        category_id: categoryId,
      })
      .select("id, name, short_name, year, branch, status, created_at")
      .single()

    if (tournamentError || !tournament) {
      return NextResponse.json({ error: tournamentError?.message ?? "No se pudo crear el torneo" }, { status: 400 })
    }

    return NextResponse.json({ tournament })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/tournaments failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
