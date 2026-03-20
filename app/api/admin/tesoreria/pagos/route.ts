import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const PAYMENT_PASSWORD = "santirui142357"

const createPaymentSchema = z.object({
  password: z.string().min(1),
  amount: z.number().positive(),
  method: z.string().min(1),
  note: z.string().max(500).optional().nullable(),
})

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

  return { ok: true as const, adminClient, callerId }
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

    const { data, error } = await auth.adminClient
      .from("treasury_payments")
      .select("id, amount, currency, method, note, paid_at, created_at")
      .order("paid_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ payments: data ?? [] })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("GET /api/admin/tesoreria/pagos failed:", e)
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

    const auth = await assertAdmin(accessToken)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => null)
    const parsed = createPaymentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { password, amount, method, note } = parsed.data

    if (password !== PAYMENT_PASSWORD) {
      return NextResponse.json({ error: "Clave incorrecta" }, { status: 403 })
    }

    const now = new Date().toISOString()

    const { data, error } = await auth.adminClient
      .from("treasury_payments")
      .insert({
        amount,
        currency: "USD",
        method,
        note: note ?? null,
        paid_at: now,
        created_by: auth.callerId,
      })
      .select("id, amount, currency, method, note, paid_at, created_at")
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "No se pudo registrar el pago" }, { status: 400 })
    }

    return NextResponse.json({ payment: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno"
    console.error("POST /api/admin/tesoreria/pagos failed:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
