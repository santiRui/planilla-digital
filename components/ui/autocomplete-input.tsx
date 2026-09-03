'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'

type AutocompleteInputProps = Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  options: string[]
  maxOptions?: number
  renderOption?: (option: string, isActive: boolean) => React.ReactNode
}

function AutocompleteInput({
  value,
  onValueChange,
  options,
  maxOptions = 8,
  className,
  renderOption,
  ...props
}: AutocompleteInputProps) {
  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)

  const filtered = React.useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return []

    const unique = Array.from(new Set(options)).filter(Boolean)
    return unique
      .filter((o) => o.toLowerCase().includes(q))
      .slice(0, Math.max(0, maxOptions))
  }, [value, options, maxOptions])

  const shouldOpen = open && filtered.length > 0

  React.useEffect(() => {
    if (!shouldOpen) return
    setActiveIndex(0)
  }, [shouldOpen, value])

  const selectOption = React.useCallback(
    (opt: string) => {
      onValueChange(opt)
      setOpen(false)
    },
    [onValueChange],
  )

  return (
    <Popover open={shouldOpen} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div>
          <Input
            value={value}
            onChange={(e) => {
              onValueChange(e.target.value)
              setOpen(true)
              setActiveIndex(0)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => {
              if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                setOpen(true)
                return
              }

              if (!shouldOpen) return

              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIndex((prev) => {
                  const next = prev + 1
                  return next >= filtered.length ? 0 : next
                })
                return
              }

              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIndex((prev) => {
                  const next = prev - 1
                  return next < 0 ? Math.max(0, filtered.length - 1) : next
                })
                return
              }

              if (e.key === 'Escape') {
                e.preventDefault()
                setOpen(false)
                return
              }

              if (e.key === 'Enter') {
                const opt = filtered[activeIndex]
                if (!opt) return
                e.preventDefault()
                selectOption(opt)
                return
              }

              if (e.key === 'Tab') {
                const opt = filtered[activeIndex]
                if (!opt) return
                selectOption(opt)
              }
            }}
            className={cn(className)}
            {...props}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[var(--radix-popover-trigger-width)] p-1"
      >
        <div className="max-h-64 overflow-y-auto">
          {filtered.map((opt, idx) => {
            const isActive = idx === activeIndex
            return (
              <button
                key={opt}
                type="button"
                className={cn(
                  'w-full rounded-sm px-2 py-1.5 text-left text-sm outline-none',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  selectOption(opt)
                }}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                {renderOption ? renderOption(opt, isActive) : opt}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { AutocompleteInput }
