import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import GlobalHeader from '../components/GlobalHeader'

const featureVideoUrl = new URL('../../../visuals/44350-438661984.mp4', import.meta.url).href

const STAR_COUNT = 120

const MISSION_METRICS = [
  { label: 'Collision alerts resolved', value: '128K+', detail: 'Machine-audited since 2022' },
  { label: 'Active vehicles', value: '4,900+', detail: 'Propagated with live ephemeris' },
  { label: 'Launch windows brokered', value: '870', detail: 'Across nine launch providers' },
]

const HERO_SIGNAL_POINTS = [
  'Global debris network ingest updated every 94 seconds',
  'Launch feasibility pipeline cross-checks 1.7M cataloged objects',
  'All telemetry encrypted end-to-end with quantum-safe ciphers',
]

const CONSTELLATION_PILLARS = [
  {
    title: 'Command the void',
    body: 'Real-time orbital state fusion with autonomous alerting keeps your fleet aligned with international safety corridors.',
    points: ['Predictive conjunction scoring', 'Encrypted telemetry ingestion', 'Shared situational awareness'],
  },
  {
    title: 'Design the launch',
    body: 'Simulate, reserve, and certify launch corridors with a single tap. Orbital OS reconciles customer manifests with logistical constraints.',
    points: ['Dynamic launch feasibility scans', 'Rideshare capacity marketplace', 'SGP4-backed planning tools'],
  },
  {
    title: 'Scale responsibly',
    body: 'Policy-first tooling with automated compliance reports keeps regulators, ground, and mission controllers in sync.',
    points: ['Audit trails & compliance packets', 'Multi-tenant access controls', '24/7 anomaly escalation playbooks'],
  },
]

const CTA_ACTIONS = [
  {
    title: 'Book a launch corridor',
    description: 'Reserve precise windows in LEO, GEO, or cislunar space with automated feasibility summaries.',
    action: 'Reserve Orbit',
    href: '/booking',
  },
  {
    title: 'Explore the operations console',
    description: 'Monitor fleets, automate conjunction responses, and surface risk trends in one command deck.',
    action: 'View Dashboard',
    href: '/dashboard',
  },
]

function LandingPage() {
  const navigate = useNavigate()
  const stars = useMemo(
    () =>
      Array.from({ length: STAR_COUNT }, (_, index) => ({
        id: `landing-star-${index}`,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: Math.random() * 1.3 + 0.5,
        opacity: 0.4 + Math.random() * 0.35,
        duration: 10 + Math.random() * 6,
        delay: Math.random() * 4,
      })),
    []
  )

  return (
    <>
      <GlobalHeader />
      <main className="bg-black text-white">
        {/* Hero */}
        <section className="relative overflow-hidden pt-28 pb-24 sm:pb-32">
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-b from-black via-[#050510] to-black" />
            <div className="absolute inset-y-0 left-0 w-[420px] blur-3xl bg-sky-500/30" />
            <div className="absolute inset-y-16 right-[-12%] w-[520px] bg-gradient-to-br from-fuchsia-500/40 via-purple-600/30 to-blue-500/40 blur-3xl" />
            <motion.div
              className="pointer-events-none absolute top-[-18%] right-[-14%] h-[700px] w-[600px] rounded-[42%] bg-gradient-to-br from-amber-400/40 via-purple-500/35 to-sky-400/45 blur-3xl"
              initial={{ opacity: 0.45, rotate: 8, scale: 1.05 }}
              animate={{ opacity: [0.45, 0.65, 0.5], rotate: [8, 4, 10], scale: [1.05, 1.1, 1.02] }}
              transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="absolute inset-0">
              {stars.map((star) => (
                <span
                  key={star.id}
                  className="absolute rounded-full bg-white"
                  style={{
                    left: `${star.left}%`,
                    top: `${star.top}%`,
                    width: `${star.size}px`,
                    height: `${star.size}px`,
                    opacity: star.opacity,
                    animation: `star-float ${star.duration}s ease-in-out ${star.delay}s infinite alternate`,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="relative z-10 mx-auto flex max-w-6xl flex-col justify-between gap-16 px-6 lg:flex-row lg:items-center">
            <div className="max-w-2xl space-y-6">
              <p className="text-sm uppercase tracking-[0.5em] text-white/60">Every void needs an order</p>
              <motion.h1
                className="text-4xl font-semibold tracking-[0.35em] uppercase sm:text-6xl"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
              >
                Orbital OS
              </motion.h1>
              <p className="text-base text-white/70 sm:text-lg">
                The mission operations platform for constellations, rideshares, and sovereign space programs. Orchestrate launch logistics, manage conjunctions, and align every orbit with surgical precision.
              </p>
              <div className="flex flex-wrap gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => navigate('/booking')}
                  className="group flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm uppercase tracking-[0.35em] transition hover:border-white hover:bg-white/20"
                >
                  Reserve Orbit
                  <span className="rounded-full bg-white text-black px-2 py-1 text-[10px] font-semibold tracking-[0.25em] transition group-hover:bg-yellow-300 group-hover:text-black">
                    GO
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/visualizer')}
                  className="group flex items-center gap-3 rounded-full border border-white/10 px-6 py-3 text-sm uppercase tracking-[0.35em] text-white/70 transition hover:border-white hover:text-white"
                >
                  Live visualizer
                  <span className="text-xs font-semibold tracking-[0.25em] text-white/50 transition group-hover:text-white">
                    ↗
                  </span>
                </button>
              </div>
            </div>

            <div className="mx-auto flex max-w-sm flex-col gap-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70 backdrop-blur-sm lg:mx-0">
              <p className="uppercase tracking-[0.35em] text-[11px] text-white/50">Live systems summary</p>
              <div className="flex items-baseline gap-3 text-white">
                <span className="text-3xl font-semibold">92.4%</span>
                <span className="text-xs text-emerald-400">Safe launch corridors online</span>
              </div>
              <p>
                Orbital OS actively monitors manifests and debris forecasts, orchestrating launch availability across allied ranges.
              </p>
              <ul className="space-y-3 text-xs text-white/60">
                {HERO_SIGNAL_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/70" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Mission metrics */}
        <section className="relative border-y border-white/10 bg-[#05050d] py-16 sm:py-20">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-5" />
          <div className="relative mx-auto grid max-w-5xl grid-cols-1 gap-10 px-6 sm:grid-cols-3">
            {MISSION_METRICS.map((metric) => (
              <div key={metric.label} className="space-y-2 border border-white/10 bg-white/5 px-6 py-6 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.35em] text-white/50">{metric.label}</p>
                <p className="text-3xl font-semibold text-white">{metric.value}</p>
                <p className="text-sm text-white/60">{metric.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Constellation pillars */}
        <section className="relative overflow-hidden py-24">
          <div className="absolute inset-0 bg-gradient-to-b from-black via-[#060510] to-black" />
          <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="relative mx-auto flex max-w-6xl flex-col gap-16 px-6">
            <div className="max-w-2xl space-y-4">
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">Mission architecture</p>
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">
                A single command deck for satellites, launch vehicles, and space stations
              </h2>
              <p className="text-base text-white/70">
                Every Orbit, vehicle, and rideshare partner syncs into one secure operating system. From early design studies to on-orbit stewardship, Orbital OS keeps crews in lockstep.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
              {CONSTELLATION_PILLARS.map((pillar) => (
                <div key={pillar.title} className="flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-white">{pillar.title}</h3>
                    <p className="text-sm leading-relaxed text-white/70">{pillar.body}</p>
                  </div>
                  <ul className="mt-6 space-y-3 text-sm text-white/70">
                    {pillar.points.map((point) => (
                      <li key={point} className="flex items-start gap-3">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Video CTA */}
        <section className="relative overflow-hidden border-y border-white/10 py-24">
          <video
            className="absolute inset-0 h-full w-full object-cover opacity-40"
            src={featureVideoUrl}
            autoPlay
            loop
            muted
            playsInline
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black via-black/70 to-black" />

          <div className="relative mx-auto flex max-w-5xl flex-col items-start gap-10 px-6 text-left">
            <p className="text-xs uppercase tracking-[0.35em] text-white/50">Launch orchestration</p>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">
              Model the window, reserve the slot, execute with confidence
            </h2>
            <p className="max-w-3xl text-base text-white/70">
              Our launch feasibility engine synthesizes SGP4 propagation, debris telemetry, and cross-operator manifests. Seconds later, you have a validated path from ground to orbit along with actionable mitigations.
            </p>
            <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2">
              {CTA_ACTIONS.map((card) => (
                <button
                  key={card.title}
                  type="button"
                  onClick={() => navigate(card.href)}
                  className="group flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-black/60 p-6 text-left transition hover:border-white/60 hover:bg-white/10"
                >
                  <div className="space-y-3">
                    <p className="text-sm uppercase tracking-[0.3em] text-white/60">{card.action}</p>
                    <h3 className="text-xl font-semibold text-white">{card.title}</h3>
                    <p className="text-sm text-white/70">{card.description}</p>
                  </div>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm text-white/60 transition group-hover:text-white">
                    Enter mission console
                    <span className="text-base">→</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Closing statement */}
        <section className="relative py-24">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 text-center">
            <p className="text-xs uppercase tracking-[0.5em] text-white/50">Orbital stewardship</p>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">
              The operating system for civilisation beyond Earth
            </h2>
            <p className="text-base text-white/70">
              Join launch integrators, defense teams, and commercial fleets building the next era of space logistics with Orbital OS.
            </p>
            <div className="flex flex-wrap justify-center gap-4 pt-4">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="rounded-full border border-white/20 px-6 py-3 text-sm uppercase tracking-[0.35em] text-white/70 transition hover:border-white hover:text-white"
              >
                Sign in to mission control
              </button>
              <button
                type="button"
                onClick={() => navigate('/booking')}
                className="rounded-full border border-white bg-white px-6 py-3 text-sm uppercase tracking-[0.35em] text-black transition hover:bg-yellow-300 hover:text-black"
              >
                Start a launch briefing
              </button>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}

export default LandingPage