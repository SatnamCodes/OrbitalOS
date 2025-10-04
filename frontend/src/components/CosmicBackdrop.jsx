import React, { useMemo } from 'react'

const STAR_COUNT = 90

const generateStars = () => {
  return Array.from({ length: STAR_COUNT }).map((_, index) => ({
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    delay: `${Math.random() * 3}s`,
    duration: `${2 + Math.random() * 3}s`,
    size: Math.random() < 0.7 ? 1 : 2,
    id: index
  }))
}

const CosmicBackdrop = () => {
  const stars = useMemo(() => generateStars(), [])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-950/70 to-black" />

      <div className="absolute inset-0 opacity-70 mix-blend-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_rgba(2,6,23,0)_55%)]" />
      <div className="absolute inset-0 opacity-50 mix-blend-screen bg-[conic-gradient(from_120deg,_rgba(59,130,246,0.2),_rgba(168,85,247,0.1),_rgba(15,23,42,0.8)_65%,_rgba(59,130,246,0.12))]" />
      <div className="absolute inset-0 opacity-30 blur-3xl bg-[radial-gradient(circle_at_20%_20%,_rgba(59,130,246,0.3),_transparent_55%)]" />

      {stars.map((star) => (
        <span
          key={star.id}
          className="absolute rounded-full bg-white/80 animate-pulse"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            animationDelay: star.delay,
            animationDuration: star.duration
          }}
        />
      ))}

      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-slate-900/80 via-slate-900/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950/90 via-slate-900/60 to-transparent" />
    </div>
  )
}

export default CosmicBackdrop