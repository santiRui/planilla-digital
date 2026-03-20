"use client"

import { useEffect, useMemo, useState } from "react"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

interface MatchRow {
  id: string
  tournamentId: string
  homeTeamId: string
  awayTeamId: string
  finishedAt: string | null
}

interface TournamentRow {
  id: string
  name: string
  year: number | null
}

interface TeamRow {
  id: string
  name: string
}

interface PaymentRow {
  id: string
  amount: number
  currency: string
  method: string
  note: string | null
  paidAt: string
  createdAt: string
}

const PRICE_PER_MATCH_USD = 3

export default function TesoreriaPage() {
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [tournaments, setTournaments] = useState<TournamentRow[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isPaymentOpen, setIsPaymentOpen] = useState(false)
  const [paymentPassword, setPaymentPassword] = useState("")
  const [paymentAmount, setPaymentAmount] = useState<string>("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [paymentNote, setPaymentNote] = useState("")
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Tenés que iniciar sesión como administrador para ver Tesorería.")
        setLoading(false)
        return
      }

      try {
        const [matchesRes, paymentsRes] = await Promise.all([
          fetch("/api/admin/matches", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/admin/tesoreria/pagos", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

        const matchesJson = (await matchesRes.json().catch(() => null)) as any
        const paymentsJson = (await paymentsRes.json().catch(() => null)) as any

        if (!matchesRes.ok) {
          throw new Error(matchesJson?.error ?? "No se pudieron cargar los partidos")
        }
        if (!paymentsRes.ok) {
          throw new Error(paymentsJson?.error ?? "No se pudieron cargar los pagos")
        }

        const rawMatches = (matchesJson.matches ?? []) as any[]
        const finalized = rawMatches.filter((m) => m.status === "finalizado" && m.finished_at)

        const matchRows: MatchRow[] = finalized.map((m) => ({
          id: String(m.id),
          tournamentId: String(m.tournament_id),
          homeTeamId: String(m.home_team_id),
          awayTeamId: String(m.away_team_id),
          finishedAt: m.finished_at,
        }))
        setMatches(matchRows)

        const tournamentIds = Array.from(new Set(matchRows.map((m) => m.tournamentId)))
        const teamIds = Array.from(
          new Set(matchRows.flatMap((m) => [m.homeTeamId, m.awayTeamId])),
        )

        if (tournamentIds.length > 0) {
          const { data: tData, error: tError } = await supabase
            .from("tournaments")
            .select("id, name, year")
            .in("id", tournamentIds)

          if (tError) throw new Error(tError.message)
          setTournaments((tData ?? []).map((t: any) => ({ id: t.id, name: t.name, year: t.year })) as TournamentRow[])
        }

        if (teamIds.length > 0) {
          const { data: teamData, error: teamError } = await supabase
            .from("teams")
            .select("id, name")
            .in("id", teamIds)

          if (teamError) throw new Error(teamError.message)
          setTeams((teamData ?? []).map((t: any) => ({ id: t.id, name: t.name })) as TeamRow[])
        }

        const paymentRows: PaymentRow[] = (paymentsJson.payments ?? []).map((p: any) => ({
          id: String(p.id),
          amount: Number(p.amount) || 0,
          currency: p.currency ?? "USD",
          method: p.method ?? "",
          note: p.note ?? null,
          paidAt: p.paid_at,
          createdAt: p.created_at,
        }))
        setPayments(paymentRows)
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al cargar Tesorería"
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [supabase])

  const getTournamentLabel = (id: string) => {
    const t = tournaments.find((tt) => tt.id === id)
    if (!t) return "-"
    return t.year ? `${t.name} ${t.year}` : t.name
  }

  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name || "-"

  const totalMatches = matches.length
  const totalAmount = totalMatches * PRICE_PER_MATCH_USD
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const pending = totalAmount - totalPaid

  const handleCreatePayment = async () => {
    setPaymentError(null)
    setPaymentSubmitting(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setPaymentError("Tenés que iniciar sesión para registrar un pago.")
        return
      }

      const amountNumber = Number.parseFloat(paymentAmount)
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        setPaymentError("Ingresá un monto válido mayor a 0.")
        return
      }

      if (!paymentMethod.trim()) {
        setPaymentError("Ingresá un método de pago.")
        return
      }

      if (!paymentPassword.trim()) {
        setPaymentError("Ingresá la clave para registrar pagos.")
        return
      }

      const res = await fetch("/api/admin/tesoreria/pagos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          password: paymentPassword,
          amount: amountNumber,
          method: paymentMethod.trim(),
          note: paymentNote.trim() || null,
        }),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setPaymentError(json?.error ?? "No se pudo registrar el pago")
        return
      }

      const saved: PaymentRow = {
        id: String(json.payment.id),
        amount: Number(json.payment.amount) || 0,
        currency: json.payment.currency ?? "USD",
        method: json.payment.method ?? "",
        note: json.payment.note ?? null,
        paidAt: json.payment.paid_at,
        createdAt: json.payment.created_at,
      }

      setPayments((prev) => [saved, ...prev])
      setIsPaymentOpen(false)
      setPaymentPassword("")
      setPaymentAmount("")
      setPaymentMethod("")
      setPaymentNote("")
    } finally {
      setPaymentSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Contabilidad" }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contabilidad</h1>
          <p className="text-muted-foreground mt-1">Resumen económico de partidos jugados y pagos registrados.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="text-xs uppercase text-muted-foreground">Partidos jugados con el sistema</div>
            <div className="text-lg font-semibold">{totalMatches}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-muted-foreground">Total generado (USD)</div>
            <div className="text-lg font-semibold">{totalAmount.toFixed(2)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-muted-foreground">Pagos realizados (USD)</div>
            <div className="text-lg font-semibold text-emerald-600">{totalPaid.toFixed(2)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-muted-foreground">Total a pagar (USD)</div>
            <div className="text-2xl font-bold text-red-600">{pending.toFixed(2)}</div>
          </div>
          <Button onClick={() => setIsPaymentOpen(true)}>Registrar pago</Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Cargando tesorería...</CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center text-destructive">{error}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <h2 className="text-lg font-semibold">Partidos jugados</h2>
                <p className="text-sm text-muted-foreground">Cada partido jugado genera un cargo fijo de 3 USD.</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha de juego</TableHead>
                    <TableHead>Torneo</TableHead>
                    <TableHead>Partido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                        No hay partidos finalizados registrados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    matches
                      .slice()
                      .sort((a, b) => (a.finishedAt && b.finishedAt ? a.finishedAt.localeCompare(b.finishedAt) : 0))
                      .map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>
                            {m.finishedAt
                              ? new Date(m.finishedAt).toLocaleString("es-AR", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })
                              : "-"}
                          </TableCell>
                          <TableCell>{getTournamentLabel(m.tournamentId)}</TableCell>
                          <TableCell>
                            {getTeamName(m.homeTeamId)} vs {getTeamName(m.awayTeamId)}
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <h2 className="text-lg font-semibold">Pagos</h2>
                <p className="text-sm text-muted-foreground">Historial de pagos registrados hacia el programador.</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Monto (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                        No hay pagos registrados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          {p.paidAt
                            ? new Date(p.paidAt).toLocaleString("es-AR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "-"}
                        </TableCell>
                        <TableCell>{p.method}</TableCell>
                        <TableCell className="text-right">{p.amount.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
            <DialogDescription>Ingresa los datos del pago y la clave de autorización.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="payment-amount">Monto (USD)</Label>
              <Input
                id="payment-amount"
                type="number"
                min="0"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payment-method">Método de pago</Label>
              <Input
                id="payment-method"
                placeholder="Ej: Efectivo, Transferencia, PayPal, etc."
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payment-note">Nota (opcional)</Label>
              <Input
                id="payment-note"
                placeholder="Detalle adicional del pago"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payment-password">Clave de autorización</Label>
              <Input
                id="payment-password"
                type="password"
                value={paymentPassword}
                onChange={(e) => setPaymentPassword(e.target.value)}
              />
            </div>
            {paymentError && <p className="text-sm text-destructive">{paymentError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreatePayment} disabled={paymentSubmitting}>
              {paymentSubmitting ? "Guardando..." : "Registrar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
