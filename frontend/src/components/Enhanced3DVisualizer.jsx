import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useEnhancedSatellitesStore } from '../stores/enhancedStores'
import { Viewer, Entity } from 'resium'
import * as Cesium from 'cesium'
import { motion } from 'framer-motion'
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Layers,
  RefreshCw,
  Satellite,
  Settings
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLat,
  degreesLong
} from 'satellite.js'

// Set Cesium base URL
window.CESIUM_BASE_URL = '/cesium/'

// Set up Cesium Ion token if available
const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
if (ionToken) {
  Cesium.Ion.defaultAccessToken = ionToken
}

const Enhanced3DVisualizer = () => {
  const { satellites, loadSatellites, isLoading, loadStats } = useEnhancedSatellitesStore()
  
  const viewerRef = useRef()
  const satrecCacheRef = useRef(new Map())
  const positionPropertyCacheRef = useRef(new Map())
  const satelliteDataRef = useRef(new Map())
  const alignmentRef = useRef({ lat: 0, lon: 0 })
  const lastClockUpdateRef = useRef(0)
  const pickMapRef = useRef(new Map())
  const hasAppliedTiltRef = useRef(false)
  const previousOffsetsRef = useRef({ lat: 0, lon: 0 })
  const clickHandlerRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [viewerReady, setViewerReady] = useState(false)
  const [selectedSatellite, setSelectedSatellite] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [visualizationSettings, setVisualizationSettings] = useState({
    maxSatellites: 200,
    showOrbits: false,
    showLabels: true,
    filterType: 'all',
    satelliteSize: 8
  })
  const [currentTime, setCurrentTime] = useState(() => new Date())

  // Initialize satellites on mount
  useEffect(() => {
    if (satellites.length === 0) {
      console.log('🚀 Loading enhanced satellites for 3D visualization...')
      loadSatellites()
    }
  }, [satellites.length, loadSatellites])

  useEffect(() => {
    satrecCacheRef.current.clear()
    positionPropertyCacheRef.current.clear()
    satelliteDataRef.current.clear()
  }, [satellites])

  // Get visualization data (limited for performance)
  const visualizationData = satellites
    .filter(sat => {
      // Filter out satellites without proper coordinates
      if (!sat.lat_deg || !sat.lon_deg || !sat.alt_km) return false
      
      // Apply type filter
      if (visualizationSettings.filterType === 'starlink') return sat.name?.toLowerCase().includes('starlink')
      if (visualizationSettings.filterType === 'gps') return sat.type === 'navigation'
      if (visualizationSettings.filterType === 'geo') return sat.type === 'communication'
      if (visualizationSettings.filterType === 'leo') return sat.alt_km && sat.alt_km < 2000
      return true
    })
    .slice(0, visualizationSettings.maxSatellites)

  const normalizeDegrees = (value) => {
    if (!Number.isFinite(value)) return 0
    let normalized = ((value + 180) % 360 + 360) % 360 - 180
    if (normalized === -180) {
      normalized = 180
    }
    return normalized
  }

  const computeSatellitePosition = (satellite, timestamp = currentTime) => {
    const targetTime = timestamp instanceof Cesium.JulianDate
      ? Cesium.JulianDate.toDate(timestamp)
      : timestamp

    const time = targetTime instanceof Date ? targetTime : new Date(targetTime)

    if (satellite?.tle_line1 && satellite?.tle_line2) {
      const cacheKey = satellite.norad_id || satellite.id
      let satrec = cacheKey ? satrecCacheRef.current.get(cacheKey) : null

      if (!satrec) {
        try {
          satrec = twoline2satrec(satellite.tle_line1.trim(), satellite.tle_line2.trim())
          if (cacheKey && satrec) {
            satrecCacheRef.current.set(cacheKey, satrec)
          }
        } catch (error) {
          console.warn('⚠️ Failed to parse TLE for satellite', satellite.name, error)
          satrec = null
        }
      }

      if (satrec) {
        try {
          const propagation = propagate(satrec, time)
          if (propagation.position) {
            const gmst = gstime(time)
            const geodetic = eciToGeodetic(propagation.position, gmst)
            const lat = degreesLat(geodetic.latitude)
            const lon = degreesLong(geodetic.longitude)
            const altKm = Number.isFinite(geodetic.height)
              ? geodetic.height
              : satellite.alt_km ?? satellite.altitude ?? 0

            return { lat, lon, altKm }
          }
        } catch (error) {
          console.warn('⚠️ SGP4 propagation failed for', satellite.name, error)
        }
      }
    }

    const lat = satellite.lat_deg ?? satellite.latitude ?? 0
    const lon = satellite.lon_deg ?? satellite.longitude ?? 0
    const altKm = satellite.alt_km ?? satellite.altitude ?? 0
    return { lat, lon, altKm }
  }

  const propagatedVisualizationData = useMemo(() => {
    return visualizationData
      .map((satellite, index) => {
        const { lat, lon, altKm } = computeSatellitePosition(satellite, currentTime)

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return null
        }

        const identifierSource = satellite.norad_id ?? satellite.id ?? satellite.name ?? `idx-${index}`
        const sanitizedIdentifier = String(identifierSource).replace(/\s+/g, '-').toLowerCase()
        const entityId = `sat-${sanitizedIdentifier}`

        return {
          ...satellite,
          entityId,
          propagatedLat: lat,
          propagatedLon: lon,
          propagatedAltKm: Number.isFinite(altKm) ? altKm : satellite.alt_km ?? satellite.altitude ?? 0,
          sourceLat: satellite.lat_deg ?? satellite.latitude ?? null,
          sourceLon: satellite.lon_deg ?? satellite.longitude ?? null
        }
      })
      .filter(Boolean)
  }, [visualizationData, currentTime])

  const alignmentOffsets = useMemo(() => {
    if (!propagatedVisualizationData.length) {
      return { lat: 0, lon: 0, samples: 0 }
    }

    let latDeltaSum = 0
    let lonDeltaSum = 0
    let samples = 0

    propagatedVisualizationData.forEach((satellite) => {
      if (!Number.isFinite(satellite.sourceLat) || !Number.isFinite(satellite.sourceLon)) {
        return
      }

      const latDelta = satellite.propagatedLat - satellite.sourceLat
      const lonDelta = normalizeDegrees(satellite.propagatedLon - satellite.sourceLon)

      if (Number.isFinite(latDelta) && Number.isFinite(lonDelta)) {
        latDeltaSum += latDelta
        lonDeltaSum += lonDelta
        samples += 1
      }
    })

    if (!samples) {
      return { lat: 0, lon: 0, samples: 0 }
    }

    return {
      lat: latDeltaSum / samples,
      lon: lonDeltaSum / samples,
      samples
    }
  }, [propagatedVisualizationData])

  const alignedVisualizationData = useMemo(() => {
    return propagatedVisualizationData.map((satellite) => {
      const correctedLat = satellite.propagatedLat - alignmentOffsets.lat
      const correctedLon = Cesium.Math.convertLongitudeRange(satellite.propagatedLon - alignmentOffsets.lon)
      const correctedAltKm = satellite.propagatedAltKm
      return {
        ...satellite,
        correctedLat,
        correctedLon,
        correctedAltKm
      }
    })
  }, [propagatedVisualizationData, alignmentOffsets])

  useEffect(() => {
    alignmentRef.current = {
      lat: alignmentOffsets.lat,
      lon: alignmentOffsets.lon
    }
  }, [alignmentOffsets.lat, alignmentOffsets.lon])

  useEffect(() => {
    if (!viewerReady || !viewerRef.current?.cesiumElement) return

    const viewer = viewerRef.current.cesiumElement
    const clock = viewer.clock

    const updateFromClock = (clockInstance) => {
      const now = Cesium.JulianDate.toDate(clockInstance.currentTime)
      const last = lastClockUpdateRef.current
      if (!last || now.getTime() - last >= 1000) {
        lastClockUpdateRef.current = now.getTime()
        setCurrentTime(now)
      }
    }

    clock.shouldAnimate = true
    return () => {
      clock.onTick.removeEventListener(updateFromClock)
    }
  }, [viewerReady])

  // Cesium viewer configuration
  const viewerOptions = {
    terrainProvider: Cesium.createWorldTerrain({
      requestWaterMask: true,
      requestVertexNormals: true
    }),
    imageryProvider: new Cesium.IonImageryProvider({ 
      assetId: 3845 // Blue Marble Next Generation
    }),
    skyBox: new Cesium.SkyBox({
      sources: {
        positiveX: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_px.jpg'),
        negativeX: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_mx.jpg'),
        positiveY: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_py.jpg'),
        negativeY: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_my.jpg'),
        positiveZ: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_pz.jpg'),
        negativeZ: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_mz.jpg')
      }
    }),
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    geocoder: false,
    baseLayerPicker: false,
    vrButton: false,
    infoBox: false,
    selectionIndicator: false
  }

  // Get satellite color based on type
  const getSatelliteColor = (satellite) => {
    const type = satellite.type?.toLowerCase() || 'unknown'
    const name = satellite.name?.toLowerCase() || ''
    
    if (name.includes('starlink')) return Cesium.Color.CYAN
    if (name.includes('oneweb')) return Cesium.Color.BLUE
    if (name.includes('gps') || type === 'navigation') return Cesium.Color.GREEN
    if (type === 'communication') return Cesium.Color.ORANGE
    if (type === 'weather') return Cesium.Color.YELLOW
    if (type === 'science') return Cesium.Color.PURPLE
    if (name.includes('iss') || type === 'station') return Cesium.Color.RED
    return Cesium.Color.WHITE
  }

  const getPositionProperty = (satellite) => {
    const entityId = satellite.entityId
    if (!entityId) return undefined

    const cachedProperty = positionPropertyCacheRef.current.get(entityId)
    if (cachedProperty) {
      return cachedProperty
    }

    const property = new Cesium.CallbackProperty((time, result) => {
      const activeSatellite = satelliteDataRef.current.get(entityId) || satellite
      const date = time ? Cesium.JulianDate.toDate(time) : currentTime
      const { lat, lon, altKm } = computeSatellitePosition(activeSatellite, date)
      const offsets = alignmentRef.current
      const correctedLat = lat - offsets.lat
      const correctedLon = Cesium.Math.convertLongitudeRange(lon - offsets.lon)
      const height = Number.isFinite(altKm) ? altKm * 1000 : 0

      return Cesium.Cartesian3.fromDegrees(correctedLon, correctedLat, height, result)
    }, false)

    positionPropertyCacheRef.current.set(entityId, property)
    return property
  }

  // Create satellite entities
  const createSatelliteEntities = () => {
    const pickMap = new Map()
    const entities = alignedVisualizationData.map((satellite) => {
      const color = getSatelliteColor(satellite)
      const entityId = satellite.entityId || `sat-${satellite.norad_id || satellite.id}`

      pickMap.set(entityId, satellite)
      satelliteDataRef.current.set(entityId, satellite)
      const positionProperty = getPositionProperty(satellite)

      return (
        <Entity
          key={entityId}
          id={entityId}
          position={positionProperty}
          point={{
            pixelSize: visualizationSettings.satelliteSize,
            color: color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.0, 1.5e7, 0.5)
          }}
          label={visualizationSettings.showLabels ? {
            text: satellite.name,
            font: '10pt Arial',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -40),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.0, 1.5e7, 0.0)
          } : undefined}
          onClick={() => setSelectedSatellite(satellite)}
        />
      )
    })

    pickMapRef.current = pickMap
    return entities
  }

  // Handle viewer ready
  const handleViewerReady = () => {
    setViewerReady(true)
    if (viewerRef.current?.cesiumElement) {
      const viewer = viewerRef.current.cesiumElement
      
      // Set initial camera position to show Earth from space
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, 30, 15000000)
      })

      viewer.clock.shouldAnimate = true
      viewer.clock.multiplier = 60
      setIsPlaying(true)

      const controller = viewer.scene.screenSpaceCameraController
      controller.inertiaSpin = 0.95
      controller.inertiaTranslate = 0.85
      controller.inertiaZoom = 0.85
      controller.maximumZoomDistance = 6.0e7
      controller.minimumZoomDistance = 400000

      // Enable lighting for realistic day/night
      viewer.scene.globe.enableLighting = true
      viewer.scene.globe.dynamicAtmosphereLighting = true
      viewer.scene.globe.atmospher.showSunGlow = true
      
      console.log('🌍 Enhanced 3D viewer ready with', alignedVisualizationData.length, 'satellites')
      toast.success(`Loaded ${alignedVisualizationData.length} satellites on 3D globe`)
    }
  }

  useEffect(() => {
    if (!viewerReady || !viewerRef.current?.cesiumElement) return

    if (clickHandlerRef.current) {
      clickHandlerRef.current.destroy()
      clickHandlerRef.current = null
    }

    const viewer = viewerRef.current.cesiumElement
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)

    handler.setInputAction((movement) => {
      const picked = viewer.scene.pick(movement.position)

      if (Cesium.defined(picked) && picked.id) {
        const entity = picked.id
        const entityId = typeof entity === 'string'
          ? entity
          : (typeof entity.id === 'string' ? entity.id : entity.id?.id || entity.name)

        if (entityId) {
          const matchedSatellite = pickMapRef.current.get(entityId)
          if (matchedSatellite) {
            setSelectedSatellite(matchedSatellite)
            return
          }
        }
      }

      setSelectedSatellite(null)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    clickHandlerRef.current = handler

    return () => {
      handler.destroy()
      clickHandlerRef.current = null
    }
  }, [viewerReady])

  useEffect(() => {
    if (!selectedSatellite) return

    const match = alignedVisualizationData.find((sat) => {
      if (selectedSatellite.entityId && sat.entityId === selectedSatellite.entityId) return true
      if (selectedSatellite.norad_id && sat.norad_id === selectedSatellite.norad_id) return true
      if (selectedSatellite.id && sat.id === selectedSatellite.id) return true
      return false
    })

    if (!match) return

    const prevLat = selectedSatellite.correctedLat ?? selectedSatellite.propagatedLat ?? selectedSatellite.lat_deg ?? selectedSatellite.latitude
    const prevLon = selectedSatellite.correctedLon ?? selectedSatellite.propagatedLon ?? selectedSatellite.lon_deg ?? selectedSatellite.longitude
    const prevAlt = selectedSatellite.correctedAltKm ?? selectedSatellite.propagatedAltKm ?? selectedSatellite.alt_km ?? selectedSatellite.altitude

    const nextLat = match.correctedLat ?? match.propagatedLat ?? match.lat_deg ?? match.latitude
    const nextLon = match.correctedLon ?? match.propagatedLon ?? match.lon_deg ?? match.longitude
    const nextAlt = match.correctedAltKm ?? match.propagatedAltKm ?? match.alt_km ?? match.altitude

    const hasChanged =
      Math.abs((prevLat ?? 0) - (nextLat ?? 0)) > 1e-6 ||
      Math.abs((prevLon ?? 0) - (nextLon ?? 0)) > 1e-6 ||
      Math.abs((prevAlt ?? 0) - (nextAlt ?? 0)) > 1e-6

    if (!hasChanged) return

    setSelectedSatellite((prev) => (prev ? { ...prev, ...match } : match))
  }, [
    alignedVisualizationData,
    selectedSatellite?.entityId,
    selectedSatellite?.norad_id,
    selectedSatellite?.id,
    selectedSatellite?.correctedLat,
    selectedSatellite?.correctedLon,
    selectedSatellite?.correctedAltKm
  ])

  const selectedAltitudeKm = selectedSatellite
    ? selectedSatellite.correctedAltKm ?? selectedSatellite.propagatedAltKm ?? selectedSatellite.alt_km ?? selectedSatellite.altitude ?? null
    : null
  const selectedLatitude = selectedSatellite
    ? selectedSatellite.correctedLat ?? selectedSatellite.propagatedLat ?? selectedSatellite.lat_deg ?? selectedSatellite.latitude ?? null
    : null
  const selectedLongitude = selectedSatellite
    ? selectedSatellite.correctedLon ?? selectedSatellite.propagatedLon ?? selectedSatellite.lon_deg ?? selectedSatellite.longitude ?? null
    : null

  useEffect(() => {
    const prev = previousOffsetsRef.current
    const deltaLat = Math.abs(prev.lat - alignmentOffsets.lat)
    const deltaLon = Math.abs(prev.lon - alignmentOffsets.lon)

    if (deltaLat > 0.05 || deltaLon > 0.05) {
      hasAppliedTiltRef.current = false
    }

    previousOffsetsRef.current = { lat: alignmentOffsets.lat, lon: alignmentOffsets.lon }
  }, [alignmentOffsets.lat, alignmentOffsets.lon])

  useEffect(() => {
    if (!viewerReady) return
    if (!viewerRef.current?.cesiumElement) return
    if (hasAppliedTiltRef.current) return

    const needsAdjustment =
      Math.abs(alignmentOffsets.lat) > 0.05 || Math.abs(alignmentOffsets.lon) > 0.05

    if (!needsAdjustment) return

    const viewer = viewerRef.current.cesiumElement
    const camera = viewer.camera

    camera.setView({
      destination: camera.position,
      orientation: {
        heading: camera.heading - Cesium.Math.toRadians(alignmentOffsets.lon),
        pitch: camera.pitch,
        roll: Cesium.Math.toRadians(alignmentOffsets.lat)
      }
    })

    hasAppliedTiltRef.current = true
  }, [alignmentOffsets, viewerReady])

  // Toggle animation
  const toggleAnimation = () => {
    if (viewerRef.current?.cesiumElement) {
      const viewer = viewerRef.current.cesiumElement
      setIsPlaying((prev) => {
        const next = !prev
        viewer.clock.shouldAnimate = next
        toast.success(next ? 'Animation playing' : 'Animation paused')
        return next
      })
    }
  }

  // Reset view
  const resetView = () => {
    if (viewerRef.current?.cesiumElement) {
      const viewer = viewerRef.current.cesiumElement
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, 30, 15000000)
      })
      setSelectedSatellite(null)
      hasAppliedTiltRef.current = false
      positionPropertyCacheRef.current.clear()
      toast.success('View reset to Earth overview')
    }
  }

  // Refresh satellites
  const refreshSatellites = () => {
    console.log('🔄 Refreshing 3D satellite data...')
    positionPropertyCacheRef.current.clear()
    satelliteDataRef.current.clear()
    loadSatellites()
    toast.success('Refreshing satellite data...')
  }

  useEffect(() => {
    const validIds = new Set(alignedVisualizationData.map((sat) => sat.entityId))

    positionPropertyCacheRef.current.forEach((_, key) => {
      if (!validIds.has(key)) {
        positionPropertyCacheRef.current.delete(key)
      }
    })

    pickMapRef.current.forEach((_, key) => {
      if (!validIds.has(key)) {
        pickMapRef.current.delete(key)
      }
    })

    satelliteDataRef.current.forEach((_, key) => {
      if (!validIds.has(key)) {
        satelliteDataRef.current.delete(key)
      }
    })
  }, [alignedVisualizationData])

  useEffect(() => {
    if (!viewerReady || !viewerRef.current?.cesiumElement) return
    if (!selectedSatellite) return

    const viewer = viewerRef.current.cesiumElement
    const activeSatellite = satelliteDataRef.current.get(selectedSatellite.entityId) || selectedSatellite
    const date = Cesium.JulianDate.toDate(viewer.clock.currentTime)
    const { lat, lon, altKm } = computeSatellitePosition(activeSatellite, date)
    const offsets = alignmentRef.current
    const correctedLat = lat - offsets.lat
    const correctedLon = Cesium.Math.convertLongitudeRange(lon - offsets.lon)
    const height = Number.isFinite(altKm) ? (altKm + 500) * 1000 : 500000

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(correctedLon, correctedLat, height),
      duration: 1.5,
      easingFunction: Cesium.EasingFunction.QUADRATIC_OUT
    })
  }, [selectedSatellite?.entityId, viewerReady])

  return (
    <div className="h-screen w-full bg-black relative overflow-hidden">
      {/* Enhanced Controls */}
      <div className="absolute top-4 left-4 z-50 space-y-4">
        {/* Stats Card */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-slate-900/90 backdrop-blur-xl rounded-xl p-4 border border-slate-700/50"
        >
          <div className="flex items-center gap-2 mb-2">
            <Satellite className="w-5 h-5 text-blue-400" />
            <span className="text-white font-semibold">Enhanced 3D Globe</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-gray-400">Available</div>
              <div className="text-blue-400 font-bold">{satellites.length.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-gray-400">Visualizing</div>
              <div className="text-green-400 font-bold">{alignedVisualizationData.length}</div>
            </div>
            <div className="col-span-2 text-[11px] text-gray-400">
              Last load: {loadStats?.lastLoadMs != null ? `${loadStats.lastLoadMs} ms` : '—'}
              {loadStats?.lastSource ? ` · ${loadStats.lastSource}` : ''}
            </div>
          </div>
        </motion.div>

        {/* Control Buttons */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-900/90 backdrop-blur-xl rounded-xl p-3 border border-slate-700/50 flex gap-2"
        >
          <button
            onClick={toggleAnimation}
            className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          
          <button
            onClick={resetView}
            className="p-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          
          <button
            onClick={refreshSatellites}
            className="p-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            title="Refresh Satellites"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </motion.div>

        {/* Settings Panel */}
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-slate-900/90 backdrop-blur-xl rounded-xl p-4 border border-slate-700/50 w-64"
          >
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4" />
              3D Visualization Settings
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Max Satellites</label>
                <input
                  type="range"
                  min="50"
                  max="500"
                  step="50"
                  value={visualizationSettings.maxSatellites}
                  onChange={(e) => setVisualizationSettings({
                    ...visualizationSettings,
                    maxSatellites: parseInt(e.target.value)
                  })}
                  className="w-full"
                />
                <div className="text-xs text-gray-400">{visualizationSettings.maxSatellites}</div>
              </div>
              
              <div>
                <label className="block text-sm text-gray-300 mb-1">Satellite Size</label>
                <input
                  type="range"
                  min="4"
                  max="16"
                  step="2"
                  value={visualizationSettings.satelliteSize}
                  onChange={(e) => setVisualizationSettings({
                    ...visualizationSettings,
                    satelliteSize: parseInt(e.target.value)
                  })}
                  className="w-full"
                />
                <div className="text-xs text-gray-400">{visualizationSettings.satelliteSize}px</div>
              </div>
              
              <div>
                <label className="block text-sm text-gray-300 mb-1">Filter Type</label>
                <select
                  value={visualizationSettings.filterType}
                  onChange={(e) => setVisualizationSettings({
                    ...visualizationSettings,
                    filterType: e.target.value
                  })}
                  className="w-full p-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                >
                  <option value="all">All Satellites</option>
                  <option value="starlink">Starlink</option>
                  <option value="gps">GPS/Navigation</option>
                  <option value="geo">Communication</option>
                  <option value="leo">LEO (Low Earth Orbit)</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showLabels"
                  checked={visualizationSettings.showLabels}
                  onChange={(e) => setVisualizationSettings({
                    ...visualizationSettings,
                    showLabels: e.target.checked
                  })}
                  className="rounded"
                />
                <label htmlFor="showLabels" className="text-sm text-gray-300">Show Labels</label>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Selected Satellite Info */}
      {selectedSatellite && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-4 right-4 z-50 bg-slate-900/90 backdrop-blur-xl rounded-xl p-4 border border-slate-700/50 max-w-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-semibold">Satellite Details</h3>
            <button
              onClick={() => setSelectedSatellite(null)}
              className="text-gray-400 hover:text-white"
            >
              ×
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-400">Name:</span>
              <span className="text-white ml-2">{selectedSatellite.name}</span>
            </div>
            <div>
              <span className="text-gray-400">NORAD ID:</span>
              <span className="text-white ml-2">{selectedSatellite.norad_id}</span>
            </div>
            <div>
              <span className="text-gray-400">Type:</span>
              <span className="text-white ml-2">{selectedSatellite.type || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-gray-400">Altitude:</span>
              <span className="text-white ml-2">
                {selectedAltitudeKm !== null ? `${selectedAltitudeKm.toFixed(1)} km` : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Velocity:</span>
              <span className="text-white ml-2">{selectedSatellite.velocity_km_s?.toFixed(2)} km/s</span>
            </div>
            <div>
              <span className="text-gray-400">Position:</span>
              <span className="text-white ml-2">
                {selectedLatitude !== null ? `${selectedLatitude.toFixed(2)}°` : '—'}, {selectedLongitude !== null ? `${selectedLongitude.toFixed(2)}°` : '—'}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-40 bg-black/50 flex items-center justify-center">
          <div className="bg-slate-900/90 backdrop-blur-xl rounded-xl p-6 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-white">Loading enhanced satellite data...</span>
            </div>
          </div>
        </div>
      )}

      {/* 3D Cesium Globe */}
      <Viewer 
        ref={viewerRef}
        {...viewerOptions}
        onReady={handleViewerReady}
        className="w-full h-full"
      >
        {viewerReady && createSatelliteEntities()}
      </Viewer>
    </div>
  )
}

export default Enhanced3DVisualizer