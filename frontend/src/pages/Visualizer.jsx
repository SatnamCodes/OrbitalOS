import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Viewer, Entity, PolylineGraphics } from 'resium'
import * as Cesium from 'cesium'
import * as satellite from 'satellite.js'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Layers,
  RefreshCw,
} from 'lucide-react'
import { useEnhancedSatellitesStore, useEnhancedRiskStore } from '../stores/enhancedStores'
import EnhancedConjunctionAnalysis from '../components/EnhancedConjunctionAnalysis'
import EnhancedSatelliteService from '../services/satelliteService_enhanced'
import toast from 'react-hot-toast'

// Set Cesium base URL
window.CESIUM_BASE_URL = '/cesium/'

const TLE_REFRESH_INTERVAL_MS = 60_000

const Visualizer = () => {
  const viewerRef = useRef()
  const viewerConfiguredRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [viewerReady, setViewerReady] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [selectedSatellite, setSelectedSatellite] = useState(null)
  const [showRiskOverlay, setShowRiskOverlay] = useState(true)
  const [showRealTimeLayer, setShowRealTimeLayer] = useState(true)
  const [showCatalogLayer, setShowCatalogLayer] = useState(true)
  const [showGroundStations, setShowGroundStations] = useState(false)
  const [timeSpeed, setTimeSpeed] = useState(1)
  const [showConjunctionAnalysis, setShowConjunctionAnalysis] = useState(false)
  const [conjunctionResults, setConjunctionResults] = useState(null)

  const [realTimeSatellites, setRealTimeSatellites] = useState([])
  const [isLoadingRealTime, setIsLoadingRealTime] = useState(false)
  const [tleRecords, setTleRecords] = useState([])

  const observerLocation = useMemo(() => ({ lat: 40.7128, lng: -74.0060 }), [])
  const satelliteService = useMemo(() => new EnhancedSatelliteService(), [])
  
  const { satellites, loadSatellites } = useEnhancedSatellitesStore()
  const { riskData, loadRiskData } = useEnhancedRiskStore()
  const catalogSatellites = useMemo(() => satellites ?? [], [satellites])

  const formatNumber = (value, fractionDigits = 2, suffix = '') => {
    if (value === null || value === undefined) {
      return '—'
    }
    const numeric = Number(value)
    if (Number.isNaN(numeric)) {
      return '—'
    }
    return `${numeric.toFixed(fractionDigits)}${suffix}`
  }

  const propagateTleRecords = useCallback((recordsOverride) => {
    const recordsToPropagate = recordsOverride ?? tleRecords

    if (!recordsToPropagate.length) {
      return
    }

    const timestamp = new Date()
    const gmst = satellite.gstime(timestamp)

    const propagated = recordsToPropagate.map((record) => {
      try {
        const { position } = satellite.propagate(record.satrec, timestamp)
        if (!position) {
          return null
        }

        const geodetic = satellite.eciToGeodetic(position, gmst)
        const latitude = satellite.degreesLat(geodetic.latitude)
        const longitude = satellite.degreesLong(geodetic.longitude)
        const altitudeKm = geodetic.height

        if (
          Number.isNaN(latitude) ||
          Number.isNaN(longitude) ||
          Number.isNaN(altitudeKm)
        ) {
          return null
        }

        return {
          satid: record.id,
          satname: record.name,
          satlat: latitude,
          satlng: longitude,
          satalt: altitudeKm,
          inclination: record.inclination,
        }
      } catch (error) {
        console.warn(`Propagation failed for ${record.name}`, error)
        return null
      }
    }).filter(Boolean)

    setRealTimeSatellites(propagated)
  }, [tleRecords])

  // Fetch live satellites from secure local backend
  const fetchLiveSatellites = useCallback(async () => {
    setIsLoadingRealTime(true)
    try {
      console.log('🚀 Fetching live satellites from enhanced API...')
      
      // Use the real satellite data from our enhanced API
      const realSatellites = await satelliteService.fetchSatellites({
        observerLat: observerLocation.lat,
        observerLng: observerLocation.lng,
        maxSatellites: 50
      })
      
      console.log(`📡 Received ${realSatellites.length} satellites from enhanced API`)
      
      if (realSatellites && realSatellites.length > 0) {
        // Transform backend data to match frontend expectations
        const transformedSatellites = realSatellites.slice(0, 50).map(sat => ({
          satid: sat.norad_id,
          satname: sat.name,
          satlat: sat.latitude,
          satlng: sat.longitude,
          satalt: sat.altitude,
          inclination: sat.inclination || 0,
          source: 'enhanced-api'
        }))
        
        console.log(`✅ Displaying ${transformedSatellites.length} real satellites:`, transformedSatellites.slice(0, 3).map(s => s.satname))
        
        setRealTimeSatellites(transformedSatellites)
        toast.success(`Updated ${transformedSatellites.length} live satellite positions from enhanced API`, { id: 'live-satellites' })
      } else {
        console.log('⚠️ No satellites received, using fallback')
        // Use propagated TLE data as fallback
        if (tleRecords.length > 0) {
          const currentTime = new Date()
          const propagated = tleRecords.slice(0, 20).map((tle, index) => {
            try {
              const satrec = satellite.twoline2satrec(tle.tle_line1, tle.tle_line2)
              const positionAndVelocity = satellite.propagate(satrec, currentTime)
              const positionEci = positionAndVelocity.position
              
              if (positionEci) {
                const gmst = satellite.gstime(currentTime)
                const positionGd = satellite.eciToGeodetic(positionEci, gmst)
                
                return {
                  satid: tle.norad_cat_id,
                  satname: tle.object_name,
                  satlat: satellite.degreesLat(positionGd.latitude),
                  satlng: satellite.degreesLong(positionGd.longitude),
                  satalt: positionGd.height,
                  inclination: tle.inclination || 0,
                  source: 'tle-propagation'
                }
              }
            } catch (error) {
              console.warn(`Failed to propagate satellite ${tle.object_name}:`, error)
            }
            return null
          }).filter(Boolean)
          
          setRealTimeSatellites(propagated)
          toast('Using TLE propagation for satellite positions', { icon: '🛰️', id: 'live-satellites' })
        } else {
          setRealTimeSatellites([])
          toast.warn('No satellite data available', { id: 'live-satellites' })
        }
      }
      
    } catch (error) {
      console.error('Failed to fetch live satellites:', error)
      toast.error('Live satellite feed unavailable - check backend connection', { id: 'live-satellites' })
      setRealTimeSatellites([])
    } finally {
      setIsLoadingRealTime(false)
    }
  }, [observerLocation, satelliteService, tleRecords])

  const refreshLeoSatellites = useCallback(async () => {
    await fetchLiveSatellites()
  }, [fetchLiveSatellites])

  useEffect(() => {
    loadSatellites()
    loadRiskData()
  }, [loadSatellites, loadRiskData])

  useEffect(() => {
    refreshLeoSatellites()
    const satelliteTimer = setInterval(refreshLeoSatellites, TLE_REFRESH_INTERVAL_MS)
    return () => clearInterval(satelliteTimer)
  }, [refreshLeoSatellites])



  useEffect(() => {
    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
    if (ionToken) {
      Cesium.Ion.defaultAccessToken = ionToken
    }
  }, [])

  const loadEarthModel = async (viewer) => {
    // Load NASA Earth GLTF model
    try {
      const earthModel = await Cesium.Model.fromGltfAsync({
        url: 'https://solarsystem.nasa.gov/gltf_embed/2393/',
        scale: 1.0,
        allowPicking: false
      })
      
      viewer.scene.primitives.add(earthModel)
      console.log('✅ NASA Earth GLTF model loaded successfully')
    } catch (error) {
      console.warn('⚠️ Could not load NASA Earth model, using fallback imagery:', error)
      
      // Fallback to high-resolution Blue Marble imagery
      viewer.scene.imageryLayers.removeAll()
      viewer.scene.imageryLayers.addImageryProvider(
        new Cesium.IonImageryProvider({ assetId: 3845 }) // Blue Marble Next Generation
      )
      
      // Add night lights
      const nightLights = viewer.scene.imageryLayers.addImageryProvider(
        new Cesium.IonImageryProvider({ assetId: 3812 }) // Earth at Night
      )
      nightLights.dayAlpha = 0.0
      nightLights.nightAlpha = 1.0
    }
  }

  useEffect(() => {
    if (!viewerReady || !viewerRef.current) {
      return
    }

    const viewer = viewerRef.current.cesiumElement

    if (!viewerConfiguredRef.current) {
      // Enhanced Earth appearance with NASA GLTF model
      viewer.scene.globe.enableLighting = true
      viewer.scene.globe.dynamicAtmosphereLighting = true
      viewer.scene.globe.atmosphereLightIntensity = 2.0
      viewer.scene.globe.showWaterEffect = true
      viewer.scene.globe.maximumScreenSpaceError = 1
      
      // Load Earth model asynchronously
      loadEarthModel(viewer)
      
      // Enhanced atmosphere
      viewer.scene.skyAtmosphere.brightnessShift = 0.4
      viewer.scene.skyAtmosphere.saturationShift = 0.25
      
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000),
        orientation: {
          heading: 0.0,
          pitch: Cesium.Math.toRadians(-90),
          roll: 0.0,
        },
      })
      viewerConfiguredRef.current = true
    }

    const clickHandler = (event) => {
      const pickedObject = viewer.scene.pick(event.position)
      if (pickedObject && pickedObject.id) {
        const entity = pickedObject.id
        if (entity.name && entity.name.includes('SAT')) {
          const satelliteKey = entity.name.replace('SAT-', '')
          const catalogSatellite = satellites.find(
            (s) => s.id === satelliteKey || String(s.norad_id) === satelliteKey
          )

          if (catalogSatellite) {
            setSelectedSatellite({ ...catalogSatellite, source: 'catalog' })
            return
          }

          const realTimeSatellite = realTimeSatellites.find(
            (sat) => String(sat.satid) === satelliteKey
          )

          if (realTimeSatellite) {
            setSelectedSatellite({
              id: `rt-${realTimeSatellite.satid}`,
              name: realTimeSatellite.satname,
              norad_id: realTimeSatellite.satid,
              operator: 'Real-time feed',
              altitude: realTimeSatellite.satalt ?? 0,
              inclination: realTimeSatellite.inclination ?? 0,
              longitude: realTimeSatellite.satlng ?? observerLocation.lng,
              latitude: realTimeSatellite.satlat ?? observerLocation.lat,
              source: 'real-time',
            })
          }
        }
      }
    }

    const eventHandler = viewer.cesiumWidget.screenSpaceEventHandler
    eventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
    eventHandler.setInputAction(clickHandler, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    return () => {
      eventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
    }
  }, [viewerReady, satellites, realTimeSatellites, observerLocation])

  useEffect(() => {
    if (!viewerReady || !viewerRef.current) {
      return
    }

    const viewer = viewerRef.current.cesiumElement

    const updateTime = () => {
      setCurrentTime(Cesium.JulianDate.toDate(viewer.clock.currentTime))
    }

    viewer.clock.onTick.addEventListener(updateTime)
    updateTime()

    return () => {
      viewer.clock.onTick.removeEventListener(updateTime)
    }
  }, [viewerReady])

  useEffect(() => {
    if (viewerReady && viewerRef.current) {
      viewerRef.current.cesiumElement.clock.multiplier = timeSpeed
    }
  }, [timeSpeed, viewerReady])

  const togglePlayPause = () => {
    if (!viewerReady || !viewerRef.current) {
      return
    }

    const viewer = viewerRef.current.cesiumElement
    if (isPlaying) {
      viewer.clock.shouldAnimate = false
    } else {
      viewer.clock.shouldAnimate = true
      viewer.clock.multiplier = timeSpeed
    }
    setIsPlaying(!isPlaying)
  }

  const resetTime = () => {
    if (!viewerReady || !viewerRef.current) {
      return
    }

      const viewer = viewerRef.current.cesiumElement
    viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date())
    viewer.clock.shouldAnimate = false
    setIsPlaying(false)
      setCurrentTime(new Date())
  }

  const getRiskColor = (satellite) => {
    const risk = riskData.find(r => r.satellite_id === satellite.id)
    if (!risk) return '#00ff00' // Green for safe
    
    switch (risk.risk_level) {
      case 'critical': return '#ff0000' // Red
      case 'warning': return '#ffaa00' // Amber
      default: return '#00ff00' // Green
    }
  }

  const getRiskIcon = (satellite) => {
    const risk = riskData.find(r => r.satellite_id === satellite.id)
    if (!risk) return CheckCircle
    
    switch (risk.risk_level) {
      case 'critical': return AlertTriangle
      case 'warning': return AlertTriangle
      default: return CheckCircle
    }
  }

  // Generate enhanced orbit trace for satellites
  const generateEnhancedOrbitTrace = (satellite) => {
    const positions = []
    const steps = 64
    const radius = 6371000 + (satellite.satalt * 1000) // Earth radius + altitude
    const inclination = (satellite.inclination || 0) * Math.PI / 180
    
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * 2 * Math.PI
      const x = radius * Math.cos(angle)
      const y = radius * Math.sin(angle) * Math.cos(inclination)
      const z = radius * Math.sin(angle) * Math.sin(inclination)
      
      // Convert to Cartesian3
      positions.push(new Cesium.Cartesian3(x, y, z))
    }
    
    return positions
  }

  return (
    <div className="relative flex h-screen w-full overflow-hidden text-white">
      <div className="absolute inset-0 -z-[40] bg-[#01010a]" />
      <div className="absolute inset-0 -z-[30] bg-[radial-gradient(circle_at_top,_rgba(79,70,229,0.24),_transparent_65%)] pointer-events-none" />
      <div className="absolute inset-0 -z-[20] bg-[radial-gradient(circle_at_bottom,_rgba(59,130,246,0.18),_transparent_60%)] pointer-events-none" />

      {/* Main 3D Viewer */}
      <div className="relative flex-1">
        <Viewer
          ref={viewerRef}
          full
          timeline={false}
          animation={false}
          baseLayerPicker={false}
          fullscreenButton={false}
          vrButton={false}
          geocoder={false}
          homeButton={false}
          infoBox={false}
          sceneModePicker={false}
          selectionIndicator={false}
          navigationHelpButton={false}
          navigationInstructionsInitiallyVisible={false}
          onReady={() => setViewerReady(true)}
        >
          {/* Render real-time satellites */}
          {showRealTimeLayer && realTimeSatellites.map((satellite) => {
            const altitudeMeters = (satellite.satalt ?? 550) * 1000
            const latitude = satellite.satlat ?? observerLocation.lat
            const longitude = satellite.satlng ?? observerLocation.lng
            const isSelected =
              selectedSatellite?.norad_id === satellite.satid ||
              selectedSatellite?.id === `rt-${satellite.satid}`
            
            // Enhanced satellite visualization
            const getSatelliteColor = () => {
              if (satellite.satname.includes('ISS')) return '#ff6b6b'
              if (satellite.satname.includes('Starlink')) return '#4ecdc4'
              if (satellite.satname.includes('OneWeb')) return '#45b7d1'
              return '#60a5fa'
            }
            
            const colorHex = getSatelliteColor()

            return (
              <Entity
                key={satellite.satid}
                name={`SAT-${satellite.satid}`}
                position={Cesium.Cartesian3.fromDegrees(longitude, latitude, altitudeMeters)}
                point={{
                  pixelSize: isSelected ? 14 : 10,
                  color: Cesium.Color.fromCssColorString(colorHex),
                  outlineColor: Cesium.Color.WHITE,
                  outlineWidth: 2,
                  scaleByDistance: new Cesium.NearFarScalar(1.5e2, 2.0, 1.5e7, 0.5),
                }}
                label={{
                  text: satellite.satname,
                  font: '12pt Roboto, sans-serif',
                  fillColor: Cesium.Color.WHITE,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 2,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                  pixelOffset: new Cesium.Cartesian2(0, -35),
                  scale: 0.8,
                  scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.3),
                }}
                billboard={{
                  image: '/satellite-icon.svg',
                  scale: isSelected ? 0.8 : 0.6,
                  scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.2),
                }}
              >
                {/* Enhanced orbit trace */}
                <PolylineGraphics
                  positions={generateEnhancedOrbitTrace(satellite)}
                  width={3}
                  material={new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.2,
                    color: Cesium.Color.fromCssColorString(colorHex).withAlpha(0.7),
                  })}
                  clampToGround={false}
                />
              </Entity>
            )
          })}

          {/* Render catalog or fallback satellites */}
          {showCatalogLayer && satellites.map((satellite) => {
            const riskColor = getRiskColor(satellite)
            const displayColor = showRiskOverlay ? riskColor : '#60a5fa'
            const isSelected =
              selectedSatellite?.id === satellite.id ||
              selectedSatellite?.norad_id === satellite.norad_id
            
            return (
              <Entity
                key={satellite.id}
                name={`SAT-${satellite.id}`}
                position={Cesium.Cartesian3.fromDegrees(
                  satellite.longitude || 0,
                  satellite.latitude || 0,
                  (satellite.altitude || 0) * 1000
                )}
                point={{
                  pixelSize: isSelected ? 11 : 8,
                  color: Cesium.Color.fromCssColorString(displayColor),
                  outlineColor: Cesium.Color.WHITE,
                  outlineWidth: 2,
                }}
                label={{
                  text: satellite.name,
                  font: '12pt sans-serif',
                  fillColor: Cesium.Color.WHITE,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 2,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                  pixelOffset: new Cesium.Cartesian2(0, -30),
                  scale: 0.8,
                }}
              >
                {showRiskOverlay && (
                  <PolylineGraphics
                    positions={generateOrbitTrace(satellite)}
                    width={2}
                    material={Cesium.Color.fromCssColorString(displayColor).withAlpha(0.6)}
                  />
                )}
              </Entity>
            )
          })}

          {/* Conjunction Analysis Visualization */}
          {conjunctionResults && conjunctionResults.conjunctions && conjunctionResults.conjunctions.map((conjunction, index) => {
            // Find satellite positions for conjunction visualization
            const sat1 = catalogSatellites.find(s => s.norad_id === conjunction.primary_satellite.norad_id) ||
                        realTimeSatellites.find(s => s.satid === conjunction.primary_satellite.norad_id)
            const sat2 = catalogSatellites.find(s => s.norad_id === conjunction.secondary_satellite.norad_id) ||
                        realTimeSatellites.find(s => s.satid === conjunction.secondary_satellite.norad_id)

            if (!sat1 || !sat2) return null

            // Get positions
            const pos1 = sat1.position || Cesium.Cartesian3.fromDegrees(
              sat1.satlng || sat1.longitude || 0,
              sat1.satlat || sat1.latitude || 0,
              (sat1.satalt || sat1.altitude || 550) * 1000
            )
            const pos2 = sat2.position || Cesium.Cartesian3.fromDegrees(
              sat2.satlng || sat2.longitude || 0,
              sat2.satlat || sat2.latitude || 0,
              (sat2.satalt || sat2.altitude || 550) * 1000
            )

            // Color based on risk level
            const getRiskColor = (riskLevel) => {
              switch(riskLevel?.toLowerCase()) {
                case 'high': return '#ef4444' // red
                case 'medium': return '#f59e0b' // amber  
                case 'low': return '#22c55e' // green
                default: return '#6b7280' // gray
              }
            }

            const riskColor = getRiskColor(conjunction.risk_level)

            return (
              <Entity key={`conjunction-${index}`} name={`Conjunction-${index}`}>
                <PolylineGraphics
                  positions={[pos1, pos2]}
                  width={4}
                  material={Cesium.Color.fromCssColorString(riskColor).withAlpha(0.8)}
                  clampToGround={false}
                />
              </Entity>
            )
          })}
        </Viewer>

        {/* Time Controls */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-panel absolute top-6 left-6 z-20 w-80 p-6 text-white/90"
        >
          <div className="relative z-10 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Orbital timeline</h2>
                <p className="mt-1 text-xs uppercase tracking-[0.28em] text-white/50">{currentTime.toLocaleTimeString()}</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60">
                <span className={`h-2 w-2 rounded-full ${isLoadingRealTime ? 'bg-amber-300 animate-pulse' : 'bg-emerald-300'}`} />
                {isLoadingRealTime ? 'Syncing' : 'Live'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <button
                onClick={togglePlayPause}
                className="btn btn-primary justify-start px-4 py-2 text-xs"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isPlaying ? 'Pause orbit' : 'Resume orbit'}
              </button>
              <button
                onClick={resetTime}
                className="btn btn-secondary justify-start px-4 py-2 text-xs"
              >
                <RotateCcw className="h-4 w-4" />
                Reset clock
              </button>
              <button
                onClick={refreshLeoSatellites}
                disabled={isLoadingRealTime}
                className="btn btn-secondary justify-start px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingRealTime ? 'animate-spin' : ''}`} />
                Refresh feed
              </button>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">
                <p className="uppercase tracking-[0.32em] text-white/40">Speed</p>
                <p className="mt-2 text-lg font-semibold text-white/90">{timeSpeed.toFixed(1)}x</p>
              </div>
            </div>

            <div>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={timeSpeed}
                onChange={(e) => setTimeSpeed(parseFloat(e.target.value))}
                className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20"
              />
              <div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-[0.28em] text-white/40">
                <span>0.1x</span>
                <span>Realtime</span>
                <span>10x</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Layer Controls */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-panel absolute top-6 right-6 z-20 w-80 p-6 text-white/80"
        >
          <div className="relative z-10 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.32em] text-white/50">
                  Visualization layers
                </h3>
                <p className="mt-1 text-xs text-white/50">Toggle overlays in the orbital scene.</p>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/60">
                <Layers className="h-4 w-4" />
              </span>
            </div>

            <div className="space-y-3 text-sm text-white/80">
              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Risk overlay</span>
                <input
                  type="checkbox"
                  checked={showRiskOverlay}
                  onChange={(e) => setShowRiskOverlay(e.target.checked)}
                  className="h-4 w-4 rounded-md border border-white/30 bg-transparent accent-rose-400"
                />
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Live overhead</span>
                <input
                  type="checkbox"
                  checked={showRealTimeLayer}
                  onChange={(e) => setShowRealTimeLayer(e.target.checked)}
                  className="h-4 w-4 rounded-md border border-white/30 bg-transparent accent-sky-400"
                />
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Conjunction analysis</span>
                <input
                  type="checkbox"
                  checked={showConjunctionAnalysis}
                  onChange={(e) => setShowConjunctionAnalysis(e.target.checked)}
                  className="h-4 w-4 rounded-md border border-white/30 bg-transparent accent-violet-400"
                />
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Catalog orbits</span>
                <input
                  type="checkbox"
                  checked={showCatalogLayer}
                  onChange={(e) => setShowCatalogLayer(e.target.checked)}
                  className="h-4 w-4 rounded-md border border-white/30 bg-transparent accent-emerald-400"
                />
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Ground stations</span>
                <input
                  type="checkbox"
                  checked={showGroundStations}
                  onChange={(e) => setShowGroundStations(e.target.checked)}
                  className="h-4 w-4 rounded-md border border-white/30 bg-transparent accent-purple-400"
                />
              </label>
            </div>

            {showGroundStations && (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/60">
                Ground station layer is being calibrated and will be available soon.
              </div>
            )}
          </div>
        </motion.div>

        {/* Legend */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel absolute bottom-6 left-6 z-20 w-72 p-6 text-white/85"
        >
          <div className="relative z-10 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.4em] text-white/50">Risk levels</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                  <span>Safe corridor</span>
                </div>
                <span className="text-white/40"><CheckCircle className="h-4 w-4" /></span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-amber-400" />
                  <span>Watch</span>
                </div>
                <span className="text-white/40">Δv advisory</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-500" />
                  <span>Critical</span>
                </div>
                <span className="text-white/40">Immediate response</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Conjunction Analysis Panel */}
      <AnimatePresence>
        {showConjunctionAnalysis && (
          <motion.div
            initial={{ x: -400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -400, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="glass-panel m-6 ml-0 w-96 overflow-y-auto px-6 py-6 text-white/85"
          >
            <EnhancedConjunctionAnalysis
              satelliteService={satelliteService}
              onAnalysisComplete={(results) => setConjunctionResults(results)}
              onClose={() => setShowConjunctionAnalysis(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Satellite Info Panel */}
      <AnimatePresence>
        {selectedSatellite && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="glass-panel m-6 mr-0 w-80 overflow-y-auto px-6 py-6 text-white/90"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold tracking-tight text-white/90">Satellite details</h2>
              <button
                onClick={() => setSelectedSatellite(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/60 transition hover:border-white/40 hover:bg-white/20 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <h3 className="text-xs uppercase tracking-[0.28em] text-white/40">Name</h3>
                <p className="mt-2 text-sm font-semibold text-white/90">{selectedSatellite.name}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <h3 className="text-xs uppercase tracking-[0.28em] text-white/40">NORAD ID</h3>
                <p className="mt-2 font-mono text-white/90">{selectedSatellite.norad_id}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <h3 className="text-xs uppercase tracking-[0.28em] text-white/40">Operator</h3>
                <p className="mt-2 text-sm text-white/80">{selectedSatellite.operator || 'Not available'}</p>
              </div>

              {selectedSatellite.source && (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <h3 className="text-xs uppercase tracking-[0.28em] text-white/40">Source</h3>
                  <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.32em] text-amber-200">
                    {selectedSatellite.source === 'real-time' ? 'Real-time stream' : 'Mission catalog'}
                  </p>
                </div>
              )}

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <h3 className="text-xs uppercase tracking-[0.28em] text-white/40">Altitude</h3>
                <p className="mt-2 font-mono text-white/90">{formatNumber(selectedSatellite.altitude, 2, ' km')}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <h3 className="text-xs uppercase tracking-[0.28em] text-white/40">Inclination</h3>
                <p className="mt-2 font-mono text-white/90">{formatNumber(selectedSatellite.inclination, 2, '°')}</p>
              </div>

              {/* Risk Assessment */}
              {(() => {
                const risk = riskData.find(r => r.satellite_id === selectedSatellite.id)
                if (!risk) return null
                const RiskIcon = getRiskIcon(selectedSatellite)
                const riskLevelClass =
                  risk.risk_level === 'critical'
                    ? 'text-rose-300'
                    : risk.risk_level === 'warning'
                    ? 'text-amber-300'
                    : 'text-emerald-300'

                return (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                    <h3 className="text-xs uppercase tracking-[0.28em] text-white/40">Risk assessment</h3>
                    <div className="mt-3 space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Risk level</span>
                        <span className={`flex items-center gap-2 text-sm font-semibold ${riskLevelClass}`}>
                          <RiskIcon className="h-4 w-4" />
                          {risk.risk_level.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-white/70">
                        <span>Risk score</span>
                        <span className="font-mono text-white/90">{formatNumber(risk.risk_score * 100, 1, '%')}</span>
                      </div>
                      <div className="flex items-center justify-between text-white/70">
                        <span>Collision probability</span>
                        <span className="font-mono text-white/90">{formatNumber(risk.collision_probability * 100, 2, '%')}</span>
                      </div>
                    </div>

                    {risk.suggested_maneuver && (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
                        {risk.suggested_maneuver}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
// Helper function to generate orbit trace
function generateOrbitTrace(satellite) {
  const positions = []
  const steps = 100
  const altitudeKm = satellite.altitude ?? 0
  const inclination = Cesium.Math.toRadians(satellite.inclination ?? 0)
  
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    const radius = (6371 + altitudeKm) * 1000 // Earth radius + altitude
    
    const x = radius * Math.cos(angle)
    const y = radius * Math.sin(angle) * Math.cos(inclination)
    const z = radius * Math.sin(angle) * Math.sin(inclination)
    
    positions.push(new Cesium.Cartesian3(x, y, z))
  }
  
  return positions
}

export default Visualizer
