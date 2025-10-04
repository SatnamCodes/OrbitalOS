import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, useTexture } from '@react-three/drei'
import { Loader2, MapPin, RefreshCw } from 'lucide-react'
import * as THREE from 'three'
import {
  eciToGeodetic,
  degreesLat,
  degreesLong,
  gstime,
  propagate,
  twoline2satrec
} from 'satellite.js'
import EnhancedSatelliteService from '../services/satelliteService_enhanced'
const ALTITUDE_SCALE = 20000 // Controls how far satellites sit from the globe
const EARTH_RADIUS_KM = 6371
const SIDEREAL_DAY_SECONDS = 86164 // Earth's rotation period relative to stars
const EARTH_ROTATION_RAD_PER_SEC = (Math.PI * 2) / SIDEREAL_DAY_SECONDS
const REALTIME_REFRESH_MS = 5000
const EPSILON = 1e-6

const SATREC_CACHE = new Map()

const getNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const clamp01 = (value) => Math.min(Math.max(value, 0), 1)

const ensureFinite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback)

const createRenderDatum = (satellite) => {
  let latitude = ensureFinite(satellite.latitude ?? satellite.lat_deg)
  let longitude = ensureFinite(satellite.longitude ?? satellite.lon_deg)
  let altitude = ensureFinite(satellite.altitude ?? satellite.alt_km)
  let velocity = ensureFinite(satellite.velocity ?? satellite.velocity_km_s)
  let timestampMs = satellite.timestamp ? Date.parse(satellite.timestamp) : Date.now()
  let propagated = false

  const line1 = typeof satellite.tle_line1 === 'string' ? satellite.tle_line1.trim() : null
  const line2 = typeof satellite.tle_line2 === 'string' ? satellite.tle_line2.trim() : null

  if (line1 && line2 && line1.length > 30 && line2.length > 30) {
    const cacheKey = `${line1}\n${line2}`
    let satrec = SATREC_CACHE.get(cacheKey)

    if (!satrec) {
      try {
        satrec = twoline2satrec(line1, line2)
        SATREC_CACHE.set(cacheKey, satrec)
      } catch (err) {
        console.warn(`Failed to parse TLE for ${satellite.name}:`, err)
        satrec = null
      }
    }

    if (satrec) {
      const propagationDate = new Date()
      const positionVelocity = propagate(satrec, propagationDate)

      if (positionVelocity.position) {
        const gmst = gstime(propagationDate)
        const geodetic = eciToGeodetic(positionVelocity.position, gmst)

        latitude = ensureFinite(degreesLat(geodetic.latitude), latitude)
        longitude = ensureFinite(degreesLong(geodetic.longitude), longitude)
        altitude = ensureFinite(geodetic.height, altitude)
        timestampMs = propagationDate.getTime()
        propagated = true
      }

      if (positionVelocity.velocity) {
        const { x: vx, y: vy, z: vz } = positionVelocity.velocity
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)
        velocity = ensureFinite(speed, velocity)
      }
    }
  }

  const latRad = THREE.MathUtils.degToRad(latitude)
  const lonRad = THREE.MathUtils.degToRad(longitude)
  const radius = 1 + Math.max(0, altitude) / ALTITUDE_SCALE

  const cosLat = Math.cos(latRad)
  const sinLat = Math.sin(latRad)
  const cosLon = Math.cos(lonRad)
  const sinLon = Math.sin(lonRad)

  const x = radius * cosLat * cosLon
  const y = radius * sinLat
  const z = radius * cosLat * sinLon

  const length = Math.hypot(x, y, z) || 1
  const dir = [x / length, y / length, z / length]

  const riskLevel = normalizeRiskLevel(satellite.riskLevel ?? satellite.risk_level)

  const colorHex = RISK_COLORS[riskLevel] || RISK_COLORS.unknown
  const color = new THREE.Color(colorHex)
  color.convertSRGBToLinear()

  return {
    sat: satellite,
    dir,
    radius: length,
    radiusKm: EARTH_RADIUS_KM + Math.max(0, altitude),
    color: new Float32Array([color.r, color.g, color.b]),
    timestampMs,
    riskLevel,
    riskScore: typeof satellite.riskScore === 'number' ? satellite.riskScore : null,
    latitude,
    longitude,
    altitude,
    velocity,
    propagated
  }
}

const computeAlpha = (elapsedMs, currentDatum, previousDatum, fallbackMs) => {
  const safeFallback = fallbackMs > 0 ? fallbackMs : REALTIME_REFRESH_MS
  const prevTimestamp = previousDatum?.timestampMs ?? currentDatum.timestampMs - safeFallback
  const dtMsRaw = currentDatum.timestampMs - prevTimestamp
  const duration = dtMsRaw > EPSILON ? dtMsRaw : safeFallback

  if (duration <= 0) {
    return 1
  }

  return clamp01(elapsedMs / duration)
}

const fillInterpolatedPosition = (previousDatum, currentDatum, alpha, target) => {
  const prev = previousDatum ?? currentDatum
  const t = clamp01(alpha)

  const prevDir = prev.dir
  const currDir = currentDatum.dir

  let dx = prevDir[0] + (currDir[0] - prevDir[0]) * t
  let dy = prevDir[1] + (currDir[1] - prevDir[1]) * t
  let dz = prevDir[2] + (currDir[2] - prevDir[2]) * t

  const length = Math.hypot(dx, dy, dz) || 1
  dx /= length
  dy /= length
  dz /= length

  const radius = prev.radius + (currentDatum.radius - prev.radius) * t

  target[0] = dx * radius
  target[1] = dy * radius
  target[2] = dz * radius

  return target
}

const TEXTURE_URLS = {
  map: '/textures/2k_earth_daymap.jpg',
  emissiveMap: '/textures/2k_earth_nightmap.jpg',
  cloudsMap: '/textures/8k_earth_clouds.jpg'
}

const TYPE_COLORS = {
  communication: '#f97316',
  navigation: '#22c55e',
  'earth-observation': '#a855f7',
  'space-station': '#facc15',
  weather: '#fcd34d',
  scientific: '#38bdf8',
  other: '#94a3b8'
}

const RISK_COLORS = {
  red: '#ef4444',
  amber: '#fbbf24',
  green: '#22c55e',
  unknown: '#94a3b8'
}

const RISK_BADGE_CLASSES = {
  red: 'border-red-500/60 bg-red-500/10 text-red-200',
  amber: 'border-amber-400/60 bg-amber-500/10 text-amber-100',
  green: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-100',
  unknown: 'border-slate-500/60 bg-slate-700/30 text-slate-200'
}

const getRiskBadgeClass = (level) => RISK_BADGE_CLASSES[level] || RISK_BADGE_CLASSES.unknown

const normalizeRiskLevel = (value) => (typeof value === 'string' && value.length
  ? value.toLowerCase()
  : 'unknown')

const RISK_LABELS = {
  red: 'High Risk',
  amber: 'Elevated Risk',
  green: 'Low Risk',
  unknown: 'Risk Unknown'
}

const FILTERS = {
  all: {
    label: 'All Objects',
    predicate: () => true
  },
  highRisk: {
    label: 'High Risk (Red)',
    predicate: (sat) => (sat.riskLevel || sat.risk_level || '').toLowerCase() === 'red'
  },
  mediumRisk: {
    label: 'Amber Risk',
    predicate: (sat) => (sat.riskLevel || sat.risk_level || '').toLowerCase() === 'amber'
  },
  lowRisk: {
    label: 'Low Risk',
    predicate: (sat) => (sat.riskLevel || sat.risk_level || '').toLowerCase() === 'green'
  },
  starlink: {
    label: 'Starlink',
    predicate: (sat) => sat.name?.toLowerCase().includes('starlink')
  },
  navigation: {
    label: 'Navigation',
    predicate: (sat) => sat.type === 'navigation'
  },
  communication: {
    label: 'Communication',
    predicate: (sat) => sat.type === 'communication'
  },
  earthObservation: {
    label: 'Earth Obs.',
    predicate: (sat) => sat.type === 'earth-observation'
  },
  spaceStation: {
    label: 'Stations',
    predicate: (sat) => sat.type === 'space-station'
  }
}

const Earth = React.memo(() => {
  const { map, emissiveMap, cloudsMap } = useTexture(TEXTURE_URLS)
  const cloudsRef = useRef()

  useMemo(() => {
    [map, emissiveMap, cloudsMap].forEach((texture) => {
      if (texture) {
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 8
      }
    })
  }, [map, emissiveMap, cloudsMap])

  useFrame((_, delta) => {
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += delta * EARTH_ROTATION_RAD_PER_SEC * 0.2
    }
  })

  return (
    <group>
      <mesh rotation={[0, Math.PI, 0]}>
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial
          map={map}
          roughness={0.85}
          metalness={0.1}
          emissive="#060b1b"
          emissiveIntensity={0.55}
          emissiveMap={emissiveMap}
        />
      </mesh>
      <mesh ref={cloudsRef} scale={1.01} rotation={[0, Math.PI, 0]}>
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial
          map={cloudsMap}
          transparent
          opacity={0.35}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh scale={1.05}>
        <sphereGeometry args={[1, 128, 128]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
    </group>
  )
})

const EarthFrame = ({ children }) => {
  const frameRef = useRef(null)

  useFrame((_, delta) => {
    if (frameRef.current) {
      frameRef.current.rotation.y += delta * EARTH_ROTATION_RAD_PER_SEC
    }
  })

  return <group ref={frameRef}>{children}</group>
}

const SatellitePoints = React.memo(({
  processedSatellites,
  previousMap,
  colors,
  lastUpdateTime,
  refreshMs,
  onSelect
}) => {
  const pointsRef = useRef(null)
  const tempVecRef = useRef(new Float32Array(3))
  const positions = useMemo(() => new Float32Array(processedSatellites.length * 3), [processedSatellites.length])

  useEffect(() => {
    const points = pointsRef.current
    if (!points || !points.geometry) {
      return
    }

    const geometry = points.geometry
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
    geometry.setDrawRange(0, processedSatellites.length)
    geometry.computeBoundingSphere()
  }, [positions, colors, processedSatellites.length])

  const handlePointerDown = useCallback(
    (event) => {
      event.stopPropagation()
      if (typeof event.index === 'number') {
        onSelect?.(event.index)
      }
    },
    [onSelect]
  )

  useFrame(() => {
    const points = pointsRef.current
    if (!points || !points.geometry || processedSatellites.length === 0) {
      return
    }

    const geometry = points.geometry
    const positionAttribute = geometry.getAttribute('position')
    if (!positionAttribute) {
      return
    }

    const array = positionAttribute.array
    const now = getNow()
    const elapsed = Math.max(now - lastUpdateTime, 0)
    const temp = tempVecRef.current

    for (let i = 0; i < processedSatellites.length; i += 1) {
      const currentDatum = processedSatellites[i]
      const prevDatum = previousMap.get(currentDatum.sat.norad_id)
      const alpha = computeAlpha(elapsed, currentDatum, prevDatum, refreshMs)

      fillInterpolatedPosition(prevDatum, currentDatum, alpha, temp)

      const baseIndex = i * 3
      array[baseIndex] = temp[0]
      array[baseIndex + 1] = temp[1]
      array[baseIndex + 2] = temp[2]
    }

    positionAttribute.needsUpdate = true
  })

  if (!processedSatellites.length) {
    return null
  }

  return (
    <points ref={pointsRef} onPointerDown={handlePointerDown}>
      <bufferGeometry />
      <pointsMaterial
        size={0.018}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.88}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
})

const SelectedMarker = ({ currentDatum, previousDatum, lastUpdateTime, refreshMs }) => {
  const markerRef = useRef(null)
  const tempVec = useRef(new Float32Array(3))

  useEffect(() => {
    if (!markerRef.current || !currentDatum) {
      return
    }
    const now = getNow()
    const elapsed = Math.max(now - lastUpdateTime, 0)
    const alpha = computeAlpha(elapsed, currentDatum, previousDatum, refreshMs)
    fillInterpolatedPosition(previousDatum, currentDatum, alpha, tempVec.current)
    markerRef.current.position.set(tempVec.current[0], tempVec.current[1], tempVec.current[2])
  }, [currentDatum, previousDatum, lastUpdateTime, refreshMs])

  useFrame((_, delta) => {
    if (!markerRef.current || !currentDatum) {
      return
    }

    markerRef.current.rotation.y += delta * 1.5
    const now = getNow()
    const elapsed = Math.max(now - lastUpdateTime, 0)
    const alpha = computeAlpha(elapsed, currentDatum, previousDatum, refreshMs)
    fillInterpolatedPosition(previousDatum, currentDatum, alpha, tempVec.current)
    markerRef.current.position.set(tempVec.current[0], tempVec.current[1], tempVec.current[2])
  })

  if (!currentDatum) {
    return null
  }

  return (
    <group ref={markerRef}>
      <mesh>
        <sphereGeometry args={[0.02, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh scale={[1.6, 1.6, 1.6]}>
        <ringGeometry args={[0.026, 0.035, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

const SatelliteVisualizationNASA = () => {
  const containerRef = useRef(null)
  const serviceRef = useRef(null)
  const catalogRef = useRef([])
  const [catalog, setCatalog] = useState([])
  const [previousCatalog, setPreviousCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterKey, setFilterKey] = useState('all')
  const [selectedNoradId, setSelectedNoradId] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [lastUpdateTime, setLastUpdateTime] = useState(getNow())
  const [isFullscreen, setIsFullscreen] = useState(false)

  if (!serviceRef.current) {
    serviceRef.current = new EnhancedSatelliteService()
  }

  const fetchCatalog = useCallback(async ({ forceRefresh = false, silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true)
      }
      const data = await serviceRef.current.fetchFullCatalog({ forceRefresh })
      const previous = catalogRef.current
      setPreviousCatalog(previous.length ? previous : data)
      setCatalog(data)
      catalogRef.current = data
      setLastUpdateTime(getNow())
      setLastUpdated(new Date().toISOString())
      setError(null)
    } catch (err) {
      console.error('Failed to load satellite catalog:', err)
      setError(err.message || 'Failed to load satellites')
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    let mounted = true
    fetchCatalog().catch(() => {
      if (mounted) {
        setLoading(false)
      }
    })

    const interval = setInterval(() => {
      fetchCatalog({ forceRefresh: true, silent: true }).catch(() => undefined)
    }, REALTIME_REFRESH_MS)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [fetchCatalog])

  useEffect(() => {
    catalogRef.current = catalog
  }, [catalog])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const node = containerRef.current
    if (!node) return

    if (!document.fullscreenElement) {
      node.requestFullscreen?.().catch(() => undefined)
    } else {
      document.exitFullscreen?.().catch(() => undefined)
    }
  }, [])

  const activeFilter = FILTERS[filterKey] || FILTERS.all

  const filteredCatalog = useMemo(() => {
    return catalog.filter((sat) => {
      if (!Number.isFinite(sat.latitude) || !Number.isFinite(sat.longitude)) {
        return false
      }
      return activeFilter.predicate(sat)
    })
  }, [catalog, activeFilter])
  const filteredPreviousCatalog = useMemo(() => {
    return previousCatalog.filter((sat) => {
      if (!Number.isFinite(sat.latitude) || !Number.isFinite(sat.longitude)) {
        return false
      }
      return activeFilter.predicate(sat)
    })
  }, [previousCatalog, activeFilter])

  const processedSatellites = useMemo(() => {
    return filteredCatalog.map((sat) => createRenderDatum(sat))
  }, [filteredCatalog])

  const previousSatellitesMap = useMemo(() => {
    const map = new Map()
    filteredPreviousCatalog.forEach((sat) => {
      map.set(sat.norad_id, createRenderDatum(sat))
    })
    return map
  }, [filteredPreviousCatalog])

  const colorArray = useMemo(() => {
    const arr = new Float32Array(processedSatellites.length * 3)

    processedSatellites.forEach((datum, index) => {
      const base = index * 3
      arr[base] = datum.color[0]
      arr[base + 1] = datum.color[1]
      arr[base + 2] = datum.color[2]
    })

    return arr
  }, [processedSatellites])

  const handlePointSelect = useCallback((index) => {
    const datum = processedSatellites[index]
    setSelectedNoradId(datum ? datum.sat.norad_id : null)
  }, [processedSatellites])

  const selectedDatum = useMemo(() => {
    if (selectedNoradId == null) {
      return null
    }
    return processedSatellites.find((datum) => datum.sat.norad_id === selectedNoradId) || null
  }, [processedSatellites, selectedNoradId])

  const selectedSatellite = selectedDatum?.sat ?? null
  const selectedPreviousDatum = selectedDatum
    ? previousSatellitesMap.get(selectedDatum.sat.norad_id) ?? null
    : null

  const selectedRiskLevel = useMemo(() => (
    selectedDatum?.riskLevel
      ?? normalizeRiskLevel(selectedSatellite?.riskLevel ?? selectedSatellite?.risk_level)
  ), [selectedDatum, selectedSatellite])

  const selectedRiskScore = useMemo(() => {
    if (selectedDatum?.riskScore != null) {
      return selectedDatum.riskScore
    }
    if (!selectedSatellite) {
      return null
    }
    const value = selectedSatellite.riskScore ?? selectedSatellite.risk_score
    return typeof value === 'number' ? value : null
  }, [selectedDatum, selectedSatellite])

  const selectedRiskReason = useMemo(() => (
    selectedSatellite?.riskReason
      ?? selectedSatellite?.risk_reason
      ?? 'Risk context unavailable.'
  ), [selectedSatellite])

  const displayLatitude = selectedDatum?.latitude ?? selectedSatellite?.latitude ?? null
  const displayLongitude = selectedDatum?.longitude ?? selectedSatellite?.longitude ?? null
  const displayAltitude = selectedDatum?.altitude ?? selectedSatellite?.altitude ?? selectedSatellite?.alt_km ?? null
  const displayVelocity = selectedDatum?.velocity ?? selectedSatellite?.velocity ?? selectedSatellite?.velocity_km_s ?? null
  const displayTimestamp = selectedDatum?.timestampMs ?? (selectedSatellite?.timestamp ? Date.parse(selectedSatellite.timestamp) : null)

  useEffect(() => {
    if (selectedNoradId == null) {
      return
    }
    const stillExists = processedSatellites.some((datum) => datum.sat.norad_id === selectedNoradId)
    if (!stillExists) {
      setSelectedNoradId(null)
    }
  }, [processedSatellites, selectedNoradId])

  const filterSummaries = useMemo(() => {
    return Object.entries(FILTERS).map(([key, value]) => {
      const count = catalog.reduce((acc, sat) => acc + (value.predicate(sat) ? 1 : 0), 0)
      return {
        key,
        label: value.label,
        count
      }
    })
  }, [catalog])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[600px] bg-black rounded-xl overflow-hidden"
    >
      {loading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-blue-300" />
          <span className="ml-3 text-sm text-blue-100 tracking-wide uppercase">
            Loading live satellite catalog…
          </span>
        </div>
      )}

      {error && (
        <div className="absolute top-4 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-red-500/40 bg-red-500/20 px-4 py-2 text-sm text-red-100 backdrop-blur">
          {error}
        </div>
      )}

      <div className="absolute top-4 left-4 z-30 w-64 rounded-xl border border-slate-700/60 bg-slate-900/70 p-4 backdrop-blur">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Filters
        </div>
        <div className="grid grid-cols-1 gap-2 text-sm">
          {filterSummaries.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilterKey(option.key)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                filterKey === option.key
                  ? 'border-blue-400/60 bg-blue-500/20 text-blue-100'
                  : 'border-slate-700/60 bg-slate-800/50 text-slate-200 hover:border-blue-500/40 hover:bg-slate-800'
              }`}
            >
              <span>{option.label}</span>
              <span className="text-xs text-slate-400">
                {option.count.toLocaleString()}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-1 text-xs text-slate-300">
          <div>Total: {catalog.length.toLocaleString()}</div>
          {lastUpdated && (
            <div>Updated: {new Date(lastUpdated).toLocaleTimeString()}</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => fetchCatalog({ forceRefresh: true })}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-500/60 bg-blue-500/10 px-3 py-2 text-sm text-blue-100 hover:bg-blue-500/20"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="absolute top-4 right-4 z-30 flex flex-col gap-3">
        <button
          type="button"
          onClick={toggleFullscreen}
          className="rounded-lg border border-slate-700/50 bg-slate-900/70 p-3 text-slate-100 backdrop-blur hover:border-blue-500/40 hover:bg-slate-900"
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          )}
        </button>

        {selectedSatellite && (
          <div className="w-64 rounded-xl border border-slate-700/60 bg-slate-900/75 p-4 text-sm text-slate-100 backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-blue-300">
              <MapPin className="h-4 w-4" />
              <span className="uppercase tracking-widest text-xs">Tracking</span>
            </div>
            <div className="text-lg font-semibold leading-tight">
              {selectedSatellite.name}
            </div>
            <div className="mt-3">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.25em] uppercase ${getRiskBadgeClass(selectedRiskLevel)}`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: RISK_COLORS[selectedRiskLevel] || RISK_COLORS.unknown }}
                />
                {RISK_LABELS[selectedRiskLevel]}
              </span>
              <p className="mt-3 text-xs leading-snug text-slate-400">
                {selectedRiskReason}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div>
                <span className="text-slate-500">NORAD</span>
                <div className="font-mono text-sm text-slate-100">
                  {selectedSatellite.norad_id}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Type</span>
                <div className="capitalize text-slate-100">
                  {selectedSatellite.type?.replace('-', ' ') || '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Latitude</span>
                <div>
                  {displayLatitude != null ? `${displayLatitude.toFixed(2)}°` : '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Longitude</span>
                <div>
                  {displayLongitude != null ? `${displayLongitude.toFixed(2)}°` : '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Altitude</span>
                <div>
                  {displayAltitude != null ? `${displayAltitude.toFixed(0)} km` : '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Velocity</span>
                <div>
                  {displayVelocity != null ? `${displayVelocity.toFixed(2)} km/s` : '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Risk Score</span>
                <div>{selectedRiskScore != null ? selectedRiskScore.toFixed(2) : '—'}</div>
              </div>
              <div>
                <span className="text-slate-500">Last Update</span>
                <div>
                  {displayTimestamp
                    ? new Date(displayTimestamp).toLocaleTimeString()
                    : '—'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Canvas
        camera={{ position: [0, 0, 4.2], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <color attach="background" args={['#020617']} />
        <fog attach="fog" args={[0x020617, 6, 18]} />

        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 3, 5]} intensity={1.4} castShadow />
        <directionalLight position={[-4, -3, -5]} intensity={0.35} />

        <Stars radius={120} depth={50} count={6000} factor={2} saturation={0} fade speed={0.2} />

        <EarthFrame>
          <Earth />
          <SatellitePoints
            processedSatellites={processedSatellites}
            previousMap={previousSatellitesMap}
            colors={colorArray}
            lastUpdateTime={lastUpdateTime}
            refreshMs={REALTIME_REFRESH_MS}
            onSelect={handlePointSelect}
          />
          {selectedDatum && (
            <SelectedMarker
              currentDatum={selectedDatum}
              previousDatum={selectedPreviousDatum}
              lastUpdateTime={lastUpdateTime}
              refreshMs={REALTIME_REFRESH_MS}
            />
          )}
        </EarthFrame>

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          zoomSpeed={0.6}
          rotateSpeed={0.5}
          minDistance={1.6}
          maxDistance={12}
          target={[0, 0, 0]}
        />
      </Canvas>

      <div className="absolute bottom-4 left-4 z-20 rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-xs text-slate-200 backdrop-blur">
        <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
          Risk Legend
        </div>
        <div className="mt-2 flex items-center gap-4">
          {['green', 'amber', 'red'].map((level) => (
            <div key={level} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: RISK_COLORS[level] }}
              />
              <span>{RISK_LABELS[level]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-xs text-slate-300 backdrop-blur">
        Rendering {processedSatellites.length.toLocaleString()} satellites in real-time from live catalog — color-coded by collision exposure (Green=Low, Amber=Elevated, Red=High)
      </div>
    </div>
  )
}

export default SatelliteVisualizationNASA