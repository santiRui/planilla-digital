import { Trophy } from "lucide-react"
import Link from "next/link"

export function PublicFooter() {
  return (
    <footer className="border-t bg-card mt-auto">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <span className="font-semibold">Torneo Barrial de Básquet</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link href="/fixture" className="hover:text-foreground transition-colors">
              Fixture
            </Link>
            <Link href="/posiciones" className="hover:text-foreground transition-colors">
              Posiciones
            </Link>
            <Link href="/estadisticas" className="hover:text-foreground transition-colors">
              Estadísticas
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">Temporada 2024</p>
        </div>
      </div>
    </footer>
  )
}
