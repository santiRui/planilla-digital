"use client"

import { useEffect, useMemo, useState } from "react"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

interface Venue {
  id: string
  name: string
}

interface MatchRow {
  id: string
  homeTeamId: string
  awayTeamId: string
  scheduledAt: Date | null
}

interface Team {
  id: string
  name: string
}

interface MatchPaymentRow {
  matchId: string
  homeCash: number | null
  homeTransfer: number | null
  awayCash: number | null
  awayTransfer: number | null
  receiverName: string | null
}

export default function CierreJornadaPage() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [selectedVenue, setSelectedVenue] = useState("")
  const [selectedDate, setSelectedDate] = useState("") // YYYY-MM-DD

  const [matches, setMatches] = useState<MatchRow[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [payments, setPayments] = useState<MatchPaymentRow[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  // Cargar sedes una sola vez
  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase.from("venues").select("id, name").order("name", { ascending: true })
      if (error) {
        setError(error.message)
        return
      }
      setVenues((data ?? []).map((v: any) => ({ id: v.id, name: v.name })) as Venue[])
    }

    run()
  }, [supabase])

  // Cargar partidos y pagos cuando cambian sede/fecha
  useEffect(() => {
    const load = async () => {
      if (!selectedVenue || !selectedDate) return

      setLoading(true)
      setError(null)

      try {
        // Necesitamos el token para llamar al endpoint de pagos, igual que la planilla
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) {
          setError("Tenés que iniciar sesión para ver el cierre de jornada.")
          setMatches([])
          setPayments([])
          setTeams([])
          return
        }

        const dayStart = new Date(`${selectedDate}T00:00:00-03:00`)
        const dayEnd = new Date(`${selectedDate}T23:59:59-03:00`)

        // Partidos de esa sede y fecha
        const { data: matchRows, error: matchError } = await supabase
          .from("matches")
          .select("id, home_team_id, away_team_id, scheduled_at, venue_id")
          .eq("venue_id", selectedVenue)
          .gte("scheduled_at", dayStart.toISOString())
          .lte("scheduled_at", dayEnd.toISOString())

        if (matchError) {
          setError(matchError.message)
          setMatches([])
          setPayments([])
          setTeams([])
          return
        }

        const mappedMatches: MatchRow[] = (matchRows ?? []).map((m: any) => ({
          id: String(m.id),
          homeTeamId: String(m.home_team_id),
          awayTeamId: String(m.away_team_id),
          scheduledAt: m.scheduled_at ? new Date(m.scheduled_at) : null,
        }))

        setMatches(mappedMatches)

        if (mappedMatches.length === 0) {
          setPayments([])
          setTeams([])
          return
        }

        const matchIds = mappedMatches.map((m) => m.id)

        // Equipos involucrados
        const teamIds = Array.from(
          new Set<string>(
            mappedMatches
              .flatMap((m) => [m.homeTeamId, m.awayTeamId])
              .filter(Boolean),
          ),
        )

        if (teamIds.length > 0) {
          const { data: teamRows, error: teamError } = await supabase
            .from("teams")
            .select("id, name")
            .in("id", teamIds)

          if (teamError) {
            setError((prev) => prev ?? teamError.message)
          } else {
            setTeams((teamRows ?? []).map((t: any) => ({ id: t.id, name: t.name })) as Team[])
          }
        } else {
          setTeams([])
        }

        // Pagos por partido: usamos el mismo endpoint que la planilla para asegurar consistencia
        const paymentResults: MatchPaymentRow[] = []

        const responses = await Promise.all(
          matchIds.map(async (matchId) => {
            try {
              const res = await fetch(`/api/mesa/match-payments?matchId=${encodeURIComponent(matchId)}`, {
                headers: { Authorization: `Bearer ${token}` },
              })
              const json = (await res.json().catch(() => null)) as any
              if (!res.ok || !json?.payment) return null

              const p = json.payment as any
              const row: MatchPaymentRow = {
                matchId: String(p.match_id),
                homeCash: p.home_cash != null ? Number(p.home_cash) : null,
                homeTransfer: p.home_transfer != null ? Number(p.home_transfer) : null,
                awayCash: p.away_cash != null ? Number(p.away_cash) : null,
                awayTransfer: p.away_transfer != null ? Number(p.away_transfer) : null,
                receiverName: p.receiver_name != null ? String(p.receiver_name) : null,
              }
              return row
            } catch {
              return null
            }
          }),
        )

        for (const r of responses) {
          if (r) paymentResults.push(r)
        }

        setPayments(paymentResults)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [selectedVenue, selectedDate, supabase])

  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name || "TBD"

  const rows = matches
    .slice()
    .sort((a, b) => {
      const ta = a.scheduledAt?.getTime() ?? 0
      const tb = b.scheduledAt?.getTime() ?? 0
      return ta - tb
    })
    .map((match) => {
      const payment = payments.find((p) => p.matchId === match.id)
      const homeCash = payment?.homeCash ?? 0
      const homeTransfer = payment?.homeTransfer ?? 0
      const awayCash = payment?.awayCash ?? 0
      const awayTransfer = payment?.awayTransfer ?? 0
      const receiverName = payment?.receiverName ?? "-"

      return {
        match,
        homeCash,
        homeTransfer,
        awayCash,
        awayTransfer,
        totalCash: homeCash + awayCash,
        totalTransfer: homeTransfer + awayTransfer,
        receiverName,
      }
    })

  const totalCash = rows.reduce((acc, r) => acc + r.totalCash, 0)
  const totalTransfer = rows.reduce((acc, r) => acc + r.totalTransfer, 0)

  const formatTime = (d: Date | null) => {
    if (!d) return "-"
    return d.toTimeString().slice(0, 5)
  }

  const formatMoney = (amount: number) =>
    amount.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Cierre de jornada" }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cierre de jornada</h1>
          <p className="text-muted-foreground mt-1">
            Seleccioná sede y fecha para ver los pagos de todos los partidos y el resumen de efectivo y transferencia.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="venue">Sede</Label>
              <Select
                value={selectedVenue}
                onValueChange={(v) => {
                  setSelectedVenue(v)
                }}
              >
                <SelectTrigger id="venue">
                  <SelectValue placeholder="Seleccionar sede" />
                </SelectTrigger>
                <SelectContent>
                  {venues.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="date">Fecha</Label>
              <Input
                id="date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {!selectedVenue || !selectedDate ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Seleccioná sede y fecha para ver el cierre de jornada.
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Cargando datos...</CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay partidos con pagos registrados para esta sede en esa fecha.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Horario</TableHead>
                    <TableHead>Partido</TableHead>
                    <TableHead>Efectivo Local</TableHead>
                    <TableHead>Transferencia Local</TableHead>
                    <TableHead>Efectivo Visitante</TableHead>
                    <TableHead>Transferencia Visitante</TableHead>
                    <TableHead>Total efectivo</TableHead>
                    <TableHead>Total transferencia</TableHead>
                    <TableHead>Recibió</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.match.id}>
                      <TableCell>{formatTime(row.match.scheduledAt)}</TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {getTeamName(row.match.homeTeamId)} vs {getTeamName(row.match.awayTeamId)}
                        </div>
                      </TableCell>
                      <TableCell>${formatMoney(row.homeCash)}</TableCell>
                      <TableCell>${formatMoney(row.homeTransfer)}</TableCell>
                      <TableCell>${formatMoney(row.awayCash)}</TableCell>
                      <TableCell>${formatMoney(row.awayTransfer)}</TableCell>
                      <TableCell>${formatMoney(row.totalCash)}</TableCell>
                      <TableCell>${formatMoney(row.totalTransfer)}</TableCell>
                      <TableCell>{row.receiverName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="font-semibold">Resumen del día</div>
              <div className="text-sm flex flex-col sm:flex-row gap-2 sm:gap-4">
                <span>
                  Total en efectivo: <span className="font-semibold">${formatMoney(totalCash)}</span>
                </span>
                <span>
                  Total en transferencia: <span className="font-semibold">${formatMoney(totalTransfer)}</span>
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
