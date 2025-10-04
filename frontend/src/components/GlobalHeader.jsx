import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import clsx from 'clsx'

const NAV_ITEMS = [
  { key: 'details', label: 'Details', to: '/visualizer', variant: 'primary' },
  { key: 'visualizer', label: 'Visualizer', to: '/dashboard?view=risk', variant: 'default' },
  { key: 'conflict', label: 'Conflict Analysis', to: '/dashboard?view=conflict', variant: 'default' },
  { key: 'reserve', label: 'Reserve Orbit', to: '/booking', variant: 'accent' },
  { key: 'alerts', label: 'Alerts', to: '/alerts', variant: 'icon' },
]

const resolveIsActive = (location, item) => {
  const url = new URL(item.to, window.location.origin)
  if (location.pathname !== url.pathname) {
    return false
  }

  if (url.search) {
    return location.search === url.search
  }

  return true
}

function GlobalHeader() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <header className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4">
      <nav className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur-xl">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white/60"
          aria-label="Open menu"
          onClick={() => navigate('/')}
        >
          <span className="text-lg">☰</span>
        </button>

        <span className="rounded-full border border-white/20 bg-black px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-white">
          Orbital OS
        </span>

        {NAV_ITEMS.map((item) => {
          const isActive = resolveIsActive(location, item)

          if (item.variant === 'icon') {
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.to)}
                className={clsx(
                  'flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/70 transition-colors hover:text-white',
                  isActive && 'border-white/60 text-white'
                )}
                aria-label={item.label}
              >
                <Bell className="h-4 w-4" />
              </button>
            )
          }

          const baseClasses = 'rounded-full border px-5 py-2 text-[11px] uppercase tracking-[0.12em] transition-colors whitespace-nowrap'

          const className = clsx(baseClasses, {
            'border-white/10 bg-black/50 text-white/70 hover:text-white': item.variant === 'default',
            'border-transparent bg-[#d2ff01] text-black font-semibold shadow-[0_0_20px_rgba(210,255,1,0.35)] hover:bg-[#d2ff01]/90': item.variant === 'accent',
            'border-white/25 bg-white/10 text-white font-semibold hover:bg-white/15': item.variant === 'primary',
            'border-white/50 text-white': isActive && item.variant !== 'accent',
          })

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(item.to)}
              className={className}
            >
              {item.label}
            </button>
          )
        })}
      </nav>
    </header>
  )
}

export default GlobalHeader
