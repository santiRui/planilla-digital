import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const updateTournamentSchema = z.object({
  name: z.string().min(1),
  year: z.number().int().min(1900).max(3000),
  branch: z.enum(["masculino", "femenino", "mixto"]),
  status: z.enum(["pendiente", "activo", "finalizado"]),
  categoryId: z.string().min(1),
  isPublic: z.boolean().optional(),
})

function shortNameFrom(name: string) {
  const cleaned = name.trim().replace(/\s+/g, " ")
  if (cleaned.length <= 16) return cleaned
  return cleaned.slice(0, 16)
}

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

  if (callerProfileError || callerProfile?.role !== "admin") {
    return { ok: false as const, status: 403, error: "Prohibido" }
  }

  return { ok: true as const, adminClient }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
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
  const parsed = updateTournamentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
  }

  const { name, year, branch, status, categoryId, isPublic } = parsed.data

  const { data: category, error: categoryError } = await auth.adminClient
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

  const update: Record<string, any> = {
    name,
    short_name: shortNameFrom(name),
    year,
    branch,
    status,
    category_id: categoryId,
  }

  if (typeof isPublic === "boolean") {
    update.is_public = isPublic
  }

  const { data: tournament, error: tournamentError } = await auth.adminClient
    .from("tournaments")
    .update(update)
    .eq("id", id)
    .select("id, name, short_name, year, branch, status, is_public, created_at")
    .single()

  if (tournamentError || !tournament) {
    return NextResponse.json({ error: tournamentError?.message ?? "No se pudo actualizar el torneo" }, { status: 400 })
  }

  return NextResponse.json({ tournament })
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
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

  const { error } = await auth.adminClient.from("tournaments").delete().eq("id", id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
