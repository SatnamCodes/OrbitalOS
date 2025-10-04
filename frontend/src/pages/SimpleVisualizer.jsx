import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Satellite, RefreshCw, Compass, Map, Globe, BarChart3, Activity, GaugeCircle, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useEnhancedSatellitesStore } from '../stores/enhancedStores'

const API_BASE_URL = (import.meta.env?.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '')

const Visualizer = () => {
  const { satellites, loadSatellites, isLoading, error } = useEnhancedSatellitesStore()
  const [selectedFilter, setSelectedFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSatellite, setSelectedSatellite] = useState(null)

  const formatNumber = (value, digits = 2) =>
    Number.isFinite(value) ? value.toFixed(digits) : '—'

  const formatLabel = (value) =>
    value ? value.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Unknown'

  const handleSelectSatellite = (satellite) => {
    setSelectedSatellite(satellite)
  }

  const handleCardKeyDown = (event, satellite) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleSelectSatellite(satellite)
    }
    if (event.key === 'Escape') {
      setSelectedSatellite(null)
    }
  }

  // Load satellites on mount
  useEffect(() => {
    console.log('🔍 Debug: satellites.length =', satellites.length, 'isLoading =', isLoading)
    if (satellites.length === 0 && !isLoading) {
      console.log('🚀 Loading enhanced satellites...')
      loadSatellites()
    }
  }, [satellites.length, loadSatellites, isLoading])

  // Debug effect
  useEffect(() => {
    console.log('📊 Enhanced satellites loaded:', satellites.length)
    if (satellites.length > 0) {
      console.log('📊 First 3 satellites:', satellites.slice(0, 3))
    }
  }, [satellites])

  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedSatellite(null)
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // Filter satellites based on selected criteria
  const filteredSatellites = satellites
    .filter(sat => {
      // Apply filter
      if (selectedFilter === 'starlink') return sat.name?.toLowerCase().includes('starlink')
      if (selectedFilter === 'gps') return sat.type === 'navigation'
      if (selectedFilter === 'communication') return sat.type === 'communication'
      return true
    })
    .filter(sat => {
      // Apply search
      if (!searchTerm) return true
      return sat.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             sat.norad_id?.toString().includes(searchTerm)
    })
    .slice(0, 100) // Limit for performance

  // Get satellite type counts
  const getTypeCount = (type) => {
    return satellites.filter(sat => {
      if (type === 'starlink') return sat.name?.toLowerCase().includes('starlink')
      if (type === 'gps') return sat.type === 'navigation'
      if (type === 'communication') return sat.type === 'communication'
      return true
    }).length
  }

  // Get satellite color based on type
  const getSatelliteColor = (satellite) => {
    const name = satellite.name?.toLowerCase() || ''
    const type = satellite.type?.toLowerCase() || ''
    
    if (name.includes('starlink')) return 'bg-cyan-500'
    if (name.includes('gps') || type === 'navigation') return 'bg-green-500'
    if (type === 'communication') return 'bg-orange-500'
    if (type === 'weather') return 'bg-yellow-500'
    if (type === 'science') return 'bg-purple-500'
    return 'bg-gray-500'
  }

  // Refresh satellites
  const refreshSatellites = () => {
    console.log('🔄 Refreshing satellite data...')
    loadSatellites()
    toast.success('Refreshing satellite data...')
  }

  // Test API directly
  const testAPI = async () => {
    try {
      console.log('🧪 Testing enhanced API directly...')
      const response = await fetch(`${API_BASE_URL}/api/v1/satellites?limit=5`)
      const data = await response.json()
      console.log('🧪 API Test Result:', data)
      toast.success(`API test successful - got ${data.length} satellites`)
    } catch (error) {
      console.error('🧪 API Test Failed:', error)
      toast.error(`API test failed: ${error.message}`)
    }
  }

  return (
    <div className="space-y-10 pb-24">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="glass-panel px-6 py-6 sm:px-8 lg:px-10"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.45em] text-white/60">Realtime catalog</p>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Enhanced Satellite Visualizer</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/65">
              Streaming Celestrak telemetry with filters, search, and risk cues. Instantly slice the catalog across operators and constellations.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/60">
              <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                {satellites.length.toLocaleString()} tracked assets
              </span>
              {satellites.length === 0 && !isLoading && (
                <span className="rounded-full border border-rose-400/50 bg-rose-500/20 px-3 py-1.5 text-rose-200">
                  No data loaded yet
                </span>
              )}
              {error && (
                <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-amber-200">
                  Error: {error}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={refreshSatellites}
              disabled={isLoading}
              className="btn btn-secondary whitespace-nowrap"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
            <button
              onClick={testAPI}
              className="btn btn-primary whitespace-nowrap"
            >
              🧪 Test API
            </button>
          </div>
        </div>
      </motion.div>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-0">

        {/* Stats Cards */}
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card border border-white/10"
          >
            <div className="flex items-center gap-3 mb-2">
              <Satellite className="w-6 h-6 text-blue-400" />
              <h3 className="text-lg font-semibold">Total Satellites</h3>
            </div>
            <p className="text-3xl font-bold text-blue-400">{satellites.length.toLocaleString()}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card border border-white/10"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 bg-cyan-500 rounded"></div>
              <h3 className="text-lg font-semibold">Starlink</h3>
            </div>
            <p className="text-3xl font-bold text-cyan-400">{getTypeCount('starlink').toLocaleString()}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card border border-white/10"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 bg-green-500 rounded"></div>
              <h3 className="text-lg font-semibold">Navigation</h3>
            </div>
            <p className="text-3xl font-bold text-green-400">{getTypeCount('gps').toLocaleString()}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card border border-white/10"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 bg-orange-500 rounded"></div>
              <h3 className="text-lg font-semibold">Communication</h3>
            </div>
            <p className="text-3xl font-bold text-orange-400">{getTypeCount('communication').toLocaleString()}</p>
          </motion.div>
        </div>

        {/* Controls */}
        <div className="card border border-white/10 mb-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label">Filter by Type</label>
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="input bg-white/10"
              >
                <option value="all">All Satellites</option>
                <option value="starlink">Starlink</option>
                <option value="gps">GPS/Navigation</option>
                <option value="communication">Communication</option>
              </select>
            </div>
            <div>
              <label className="label">Search Satellites</label>
              <input
                type="text"
                placeholder="Search by name or NORAD ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Satellite List */}
        <div className="card border border-white/10">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5" />
            <h2 className="text-xl font-bold">
              Satellite Data ({filteredSatellites.length} shown)
            </h2>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                <span>Loading enhanced satellite data...</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto pr-1">
              {filteredSatellites.map((satellite) => {
                const normalizedId = satellite.norad_id ?? satellite.id ?? satellite.name
                const selectedId = selectedSatellite?.norad_id ?? selectedSatellite?.id ?? selectedSatellite?.name
                const isSelected = selectedId != null && selectedId === normalizedId

                return (
                  <motion.div
                    key={normalizedId}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelectSatellite(satellite)}
                    onKeyDown={(event) => handleCardKeyDown(event, satellite)}
                    role="button"
                    tabIndex={0}
                    className={`group select-none cursor-pointer rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-lg transition-all duration-200 hover:border-white/40 hover:shadow-[0_24px_60px_-38px_rgba(56,189,248,0.75)] ${
                      isSelected ? 'ring-2 ring-sky-400/60 shadow-[0_30px_70px_-48px_rgba(56,189,248,0.65)]' : 'ring-0'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-3 h-3 rounded-full ${getSatelliteColor(satellite)} shadow-inner shadow-black/40`}></div>
                      <h3 className="font-semibold text-sm truncate group-hover:text-white transition-colors">
                        {satellite.name}
                      </h3>
                    </div>
                    <div className="space-y-1 text-xs text-gray-400">
                      <div className="flex items-center gap-2">
                        <Compass className="w-3 h-3 opacity-60" />
                        <span>NORAD: {satellite.norad_id ?? '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Map className="w-3 h-3 opacity-60" />
                        <span>Type: {satellite.type || 'Unknown'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <GaugeCircle className="w-3 h-3 opacity-60" />
                        <span>Altitude: {formatNumber(satellite.alt_km ?? satellite.altitude, 1)} km</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Activity className="w-3 h-3 opacity-60" />
                        <span>Velocity: {formatNumber(satellite.velocity_km_s ?? satellite.velocity, 2)} km/s</span>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}

          {!isLoading && filteredSatellites.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Satellite className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>No satellites found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedSatellite && (
          <motion.div
            key={selectedSatellite.norad_id ?? selectedSatellite.id ?? 'detail-panel'}
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 180, damping: 22 }}
            className="glass-panel fixed bottom-8 right-8 z-20 w-full max-w-md border border-white/10 p-6 shadow-[0_32px_90px_-48px_rgba(56,189,248,0.55)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-white/60 mb-1">Selected Satellite</p>
                <h3 className="text-xl font-semibold text-white leading-tight">
                  {selectedSatellite.name}
                </h3>
                <p className="text-sm text-white/60 mt-1">
                  NORAD {selectedSatellite.norad_id ?? '—'} • {formatLabel(selectedSatellite.type)}
                </p>
              </div>
              <button
                onClick={() => setSelectedSatellite(null)}
                className="btn btn-secondary !px-3 !py-1 text-xs"
                aria-label="Close satellite details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 text-sm">
              {[{
                icon: <Globe className="w-4 h-4 text-blue-300" />, label: 'Latitude', value: `${formatNumber(selectedSatellite.latitude, 2)}°`
              }, {
                icon: <Compass className="w-4 h-4 text-emerald-300" />, label: 'Longitude', value: `${formatNumber(selectedSatellite.longitude, 2)}°`
              }, {
                icon: <GaugeCircle className="w-4 h-4 text-indigo-300" />, label: 'Altitude', value: `${formatNumber(selectedSatellite.alt_km ?? selectedSatellite.altitude, 1)} km`
              }, {
                icon: <Activity className="w-4 h-4 text-amber-300" />, label: 'Velocity', value: `${formatNumber(selectedSatellite.velocity_km_s ?? selectedSatellite.velocity, 2)} km/s`
              }].map((item) => (
                <div key={item.label} className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/8 p-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
                    {item.icon}
                    {item.label}
                  </div>
                  <span className="text-base font-semibold text-white">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-white/60">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
                Source: {formatLabel(selectedSatellite.source)}
              </span>
              {selectedSatellite.timestamp && (
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
                  Updated: {new Date(selectedSatellite.timestamp).toLocaleString()}
                </span>
              )}
            </div>

            {(selectedSatellite.riskLevel || Number.isFinite(selectedSatellite.riskScore)) && (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3">
                <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/60">Risk Assessment</p>
                  {selectedSatellite.riskLevel && (
                    <p className="text-sm font-semibold text-white mt-1">
                      {formatLabel(selectedSatellite.riskLevel)}
                    </p>
                  )}
                  {Number.isFinite(selectedSatellite.riskScore) && (
                    <p className="text-xs text-white/60 mt-1">
                      Score: {formatNumber(selectedSatellite.riskScore, 4)}
                    </p>
                  )}
                  {selectedSatellite.riskReason && (
                    <p className="text-xs text-white/60 mt-2 leading-relaxed">
                      {selectedSatellite.riskReason}
                    </p>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Visualizer