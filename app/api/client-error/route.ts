import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    console.error("[client-error]", body)
  } catch (e) {
    console.error("[client-error] failed to parse body", e)
  }

  // Siempre respondemos 204 para no mostrar error al usuario
  return new NextResponse(null, { status: 204 })
}
