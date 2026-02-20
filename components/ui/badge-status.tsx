import { cn } from "@/lib/utils"
import type { MatchStatus } from "@/lib/types"

interface BadgeStatusProps {
  status: MatchStatus
  className?: string
}

const statusConfig: Record<MatchStatus, { label: string; className: string }> = {
  programado: {
    label: "Programado",
    className: "bg-secondary text-secondary-foreground",
  },
  en_juego: {
    label: "En Juego",
    className: "bg-[var(--color-live)] text-[var(--color-live-foreground)] animate-pulse-live",
  },
  finalizado: {
    label: "Finalizado",
    className: "bg-[var(--color-success)] text-[var(--color-success-foreground)]",
  },
  suspendido: {
    label: "Suspendido",
    className: "bg-red-500/10 text-red-600",
  },
  demorado: {
    label: "Demorado",
    className: "bg-amber-500/10 text-amber-600",
  },
}

export function BadgeStatus({ status, className }: BadgeStatusProps) {
  const config = statusConfig[status]

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.className,
        className,
      )}
    >
      {status === "en_juego" && <span className="mr-1.5 h-2 w-2 rounded-full bg-current" />}
      {config.label}
    </span>
  )
}
