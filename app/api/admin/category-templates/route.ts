import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const createSchema = z.object({
  name: z.string().min(1),
  ageGroup: z.string().min(1),
  branch: z.enum(["masculino", "femenino", "mixto"]),
})

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    const match = authHeader?.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]

    if (!accessToken) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const parsed = createSchema.safeParse(body)
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

    const { name, ageGroup, branch } = parsed.data

    const { data: template, error } = await adminClient
      .from("category_templates")
      .insert({
        name,
        age_group: ageGroup,
        branch,
      })
      .select("id, name, age_group, branch, created_at")
      .single()

    if (error || !template) {
      return NextResponse.json({ error: error?.message ?? "No se pudo crear la categoría" }, { status: 400 })
    }

    return NextResponse.json({ template })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/category-templates failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
