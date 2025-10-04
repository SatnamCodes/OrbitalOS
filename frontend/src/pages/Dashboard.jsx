import React from 'react'
import { useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import SatelliteVisualizationNASA from '../components/SatelliteVisualizationNASA'
import EnhancedConjunctionAnalysis from '../components/EnhancedConjunctionAnalysis'

function Dashboard() {
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const view = searchParams.get('view')

  // Route to conjunction analysis if view=conflict
  if (view === 'conflict') {
    return <EnhancedConjunctionAnalysis />
  }

  return (
    <div className="space-y-10 pb-20">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="glass-panel px-6 py-6 sm:px-8 lg:px-10"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.45em] text-white/60">Mission Control Center</p>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">OrbitalOS Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/65">
              Watch constellation telemetry, risk posture, and business metrics in a unified glass cockpit.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/8 px-5 py-3 text-sm text-white/70 backdrop-blur-md">
              <span className="block text-[10px] uppercase tracking-[0.45em] text-white/40">Active Fleets</span>
              <span className="text-lg font-semibold text-sky-300">22,174</span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/8 px-5 py-3 text-sm text-white/70 backdrop-blur-md">
              <span className="block text-[10px] uppercase tracking-[0.45em] text-white/40">Risk Events</span>
              <span className="text-lg font-semibold text-rose-300">3</span>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 sm:px-6 lg:px-0">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Active Satellites', value: '22,174', accent: 'text-sky-300' },
            { label: 'Risk Events', value: '3', accent: 'text-rose-300' },
            { label: 'Success Rate', value: '97%', accent: 'text-emerald-300' },
            { label: 'Monthly Revenue', value: '$33k', accent: 'text-violet-300' }
          ].map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="card border border-white/10"
            >
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">{stat.label}</p>
              <p className={`mt-3 text-3xl font-semibold ${stat.accent}`}>{stat.value}</p>
              <p className="mt-1 text-xs text-white/50">Updated moments ago</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="glass-panel overflow-hidden border border-white/10"
        >
          <div className="border-b border-white/10 px-6 py-5">
            <h2 className="text-xl font-semibold text-white">Live Satellite Tracking</h2>
            <p className="text-sm text-white/65">Real-time 3D visualization of orbital objects and proximity risks.</p>
          </div>
          <div className="h-[580px]">
            <SatelliteVisualizationNASA />
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default Dashboard