import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Viewer, Entity, Billboard, Label } from 'resium'
import * as Cesium from 'cesium'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play,
  Pause,
  RotateCcw,
  Globe,
  Satellite,
  RefreshCw,
  Settings,
  Eye,
  Layers,
  MapPin
} from 'lucide-react'
import toast from 'react-hot-toast'

// Set Cesium base URL
window.CESIUM_BASE_URL = '/cesium/'

const SATELLITE_UPDATE_INTERVAL = 30000 // 30 seconds

const SatelliteVisualizer = () => {
  const viewerRef = useRef()
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [satellites, setSatellites] = useState([])
  const [selectedSatellite, setSelectedSatellite] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showSatellites, setShowSatellites] = useState(true)
  const [showOrbits, setShowOrbits] = useState(false)
  const [showGroundTrack, setShowGroundTrack] = useState(false)

  // Enhanced Earth imagery using Cesium Ion assets
  const imageryProvider = useMemo(() => {
    return new Cesium.IonImageryProvider({ 
      assetId: 3845, // Blue Marble Next Generation
      accessToken: import.meta.env.VITE_CESIUM_ION_TOKEN 
    })
  }, [])

  // Fetch satellite data from our own API
  const fetchSatelliteData = useCallback(async () => {
    setIsLoading(true)
    try {
      // Use our own backend API
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080'
      
      // Get visible satellites from our location
      const response = await fetch(
        `${apiUrl}/api/satellites/visible?observer_lat=40.7128&observer_lon=-74.0060&limit=50`
      )
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`)
      }
      
      const data = await response.json()
      const satelliteData = data.satellites.map(sat => ({
        id: sat.id,
        name: sat.name,
        latitude: sat.latitude,
        longitude: sat.longitude,
        altitude: sat.altitude,
        velocity: sat.velocity,
        type: sat.satellite_type.replace('-', '_').toLowerCase(),
        status: sat.status
      }))
      
      setSatellites(satelliteData)
      toast.success(`Loaded ${satelliteData.length} satellites from OrbitalOS API`)
      
    } catch (error) {
      console.error('Failed to fetch satellite data from API:', error)
      
      // Fallback to demo data if API fails
      const demoSatellites = [
        {
          id: 'iss',
          name: 'International Space Station',
          latitude: Math.random() * 60 - 30,
          longitude: Math.random() * 360 - 180,
          altitude: 408,
          velocity: 7.66,
          type: 'space_station',
          status: 'active'
        },
        {
          id: 'starlink-001',
          name: 'Starlink-1001',
          latitude: Math.random() * 60 - 30,
          longitude: Math.random() * 360 - 180,
          altitude: 550,
          velocity: 7.53,
          type: 'communication',
          status: 'active'
        },
        {
          id: 'gps-001',
          name: 'GPS-III-01',
          latitude: Math.random() * 60 - 30,
          longitude: Math.random() * 360 - 180,
          altitude: 20180,
          velocity: 3.87,
          type: 'navigation',
          status: 'active'
        }
      ]
      
      setSatellites(demoSatellites)
      toast.error('API unavailable - using demo data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Get satellite color based on type
  const getSatelliteColor = (type) => {
    const colors = {
      'earth_observation': Cesium.Color.CYAN,
      'earthobservation': Cesium.Color.CYAN,
      'communication': Cesium.Color.YELLOW,
      'weather': Cesium.Color.GREEN,
      'navigation': Cesium.Color.ORANGE,
      'military': Cesium.Color.RED,
      'scientific': Cesium.Color.PURPLE,
      'space_station': Cesium.Color.WHITE,
      'spacestation': Cesium.Color.WHITE,
      'debris': Cesium.Color.GRAY,
      'other': Cesium.Color.LIGHTGRAY,
      'default': Cesium.Color.WHITE
    }
    return colors[type] || colors.default
  }

  // Get satellite icon based on type
  const getSatelliteIcon = (type) => {
    return '/satellite-icon.svg' // You'll need to create this icon
  }

  // Configure viewer settings
  const configureViewer = useCallback(() => {
    if (!viewerRef.current?.cesiumElement || viewerConfiguredRef.current) return

    const viewer = viewerRef.current.cesiumElement
    
    // Configure scene
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1000
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 50000000
    
    // Enable lighting
    viewer.scene.globe.enableLighting = true
    viewer.scene.globe.atmosphereHueShift = 0.1
    viewer.scene.globe.atmosphereSaturationShift = 0.1
    viewer.scene.globe.atmosphereBrightnessShift = 0.1
    
    // Enhanced Earth appearance
    viewer.scene.skyAtmosphere.hueShift = 0.0
    viewer.scene.skyAtmosphere.saturationShift = 0.0
    viewer.scene.skyAtmosphere.brightnessShift = 0.0
    
    // Configure imagery
    if (imageryProvider) {
      viewer.imageryLayers.removeAll()
      viewer.imageryLayers.addImageryProvider(imageryProvider)
    }
    
  viewerConfiguredRef.current = true
  }, [imageryProvider])

  const viewerConfiguredRef = useRef(false)

  // Handle viewer ready
  const handleViewerReady = useCallback(() => {
    configureViewer()
  }, [configureViewer])

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (!viewerRef.current?.cesiumElement) return
    
    const viewer = viewerRef.current.cesiumElement
    if (isPlaying) {
      viewer.clock.shouldAnimate = false
    } else {
      viewer.clock.shouldAnimate = true
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  // Reset time
  const resetTime = useCallback(() => {
    if (!viewerRef.current?.cesiumElement) return
    
    const viewer = viewerRef.current.cesiumElement
    viewer.clock.currentTime = Cesium.JulianDate.now()
    setCurrentTime(new Date())
  }, [])

  // Handle satellite selection
  const handleSatelliteSelect = useCallback((satellite) => {
    setSelectedSatellite(satellite)
    
    if (viewerRef.current?.cesiumElement && satellite) {
      const viewer = viewerRef.current.cesiumElement
      const position = Cesium.Cartesian3.fromDegrees(
        satellite.longitude,
        satellite.latitude,
        satellite.altitude * 1000 // Convert km to meters
      )
      
      viewer.camera.flyTo({
        destination: position,
        duration: 2.0,
        offset: new Cesium.HeadingPitchRange(0, -90, satellite.altitude * 2000)
      })
    }
  }, [])

  // Update satellite positions (simulate movement)
  const updateSatellitePositions = useCallback(() => {
    setSatellites(prev => prev.map(sat => ({
      ...sat,
      latitude: sat.latitude + (Math.random() - 0.5) * 0.1,
      longitude: sat.longitude + (Math.random() - 0.5) * 0.1
    })))
  }, [])

  // Initialize data
  useEffect(() => {
    fetchSatelliteData()
  }, [fetchSatelliteData])

  // Update satellite positions periodically
  useEffect(() => {
    const interval = setInterval(updateSatellitePositions, SATELLITE_UPDATE_INTERVAL)
    return () => clearInterval(interval)
  }, [updateSatellitePositions])

  // Time update effect
  useEffect(() => {
    if (!isPlaying) return
    
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    
    return () => clearInterval(interval)
  }, [isPlaying])

  return (
    <div className="relative h-screen w-full overflow-hidden text-white">
      <div className="absolute inset-0 -z-[30] bg-[#01010a]" />
      <div className="absolute inset-0 -z-[20] bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_65%)] pointer-events-none" />
      <div className="absolute inset-0 -z-[10] bg-[radial-gradient(circle_at_bottom,_rgba(14,116,144,0.18),_transparent_60%)] pointer-events-none" />

      {/* Cesium Viewer */}
      <Viewer
        ref={viewerRef}
        full
        timeline={false}
        animation={false}
        baseLayerPicker={false}
        fullscreenButton={false}
        geocoder={false}
        homeButton={false}
        infoBox={false}
        navigationHelpButton={false}
        sceneModePicker={false}
        selectionIndicator={false}
        onReady={handleViewerReady}
        terrainProvider={Cesium.createWorldTerrain()}
        imageryProvider={imageryProvider}
      >
        {/* Render satellites */}
        {showSatellites && satellites.map((satellite) => (
          <Entity
            key={satellite.id}
            position={Cesium.Cartesian3.fromDegrees(
              satellite.longitude,
              satellite.latitude,
              satellite.altitude * 1000
            )}
            onClick={() => handleSatelliteSelect(satellite)}
          >
            <Billboard
              image={getSatelliteIcon(satellite.type)}
              scale={0.8}
              color={getSatelliteColor(satellite.type)}
              heightReference={Cesium.HeightReference.NONE}
              scaleByDistance={new Cesium.NearFarScalar(1000, 1.0, 10000000, 0.1)}
            />
            <Label
              text={satellite.name}
              font="12pt sans-serif"
              pixelOffset={new Cesium.Cartesian2(0, -40)}
              fillColor={Cesium.Color.WHITE}
              outlineColor={Cesium.Color.BLACK}
              outlineWidth={2}
              style={Cesium.LabelStyle.FILL_AND_OUTLINE}
              showBackground={true}
              backgroundColor={Cesium.Color.BLACK.withAlpha(0.7)}
              scaleByDistance={new Cesium.NearFarScalar(1000, 1.0, 10000000, 0.0)}
            />
          </Entity>
        ))}
      </Viewer>

      {/* Control Panel */}
      <motion.div
        initial={{ opacity: 0, x: -100 }}
        animate={{ opacity: 1, x: 0 }}
        className="glass-panel absolute top-6 left-6 w-80 p-6 text-white/90"
      >
        <div className="relative z-10 space-y-5">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Satellite className="h-5 w-5 text-sky-400" />
              Satellite Control
            </h2>
            <p className="mt-1 text-sm text-white/60">
              Fine-tune the orbital view and refresh live telemetry.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={togglePlayPause}
              className="btn btn-primary text-sm px-4 py-2"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? 'Pause orbit' : 'Resume orbit'}
            </button>

            <div className="flex gap-2">
              <button
                onClick={resetTime}
                className="btn btn-secondary text-sm px-4 py-2 flex-1"
              >
                <RotateCcw className="h-4 w-4" />
                Reset time
              </button>
              <button
                onClick={fetchSatelliteData}
                disabled={isLoading}
                className="btn btn-secondary text-sm px-4 py-2 flex-1 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh data
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-white/40">
              Layers
            </p>
            <div className="space-y-3 text-sm text-white/80">
              <label className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-sky-300" />
                  <span>Show satellites</span>
                </div>
                <input
                  type="checkbox"
                  checked={showSatellites}
                  onChange={(e) => setShowSatellites(e.target.checked)}
                  className="h-4 w-4 rounded-md border border-white/30 bg-transparent accent-sky-400"
                />
              </label>

              <label className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-indigo-300" />
                  <span>Show orbits</span>
                </div>
                <input
                  type="checkbox"
                  checked={showOrbits}
                  onChange={(e) => setShowOrbits(e.target.checked)}
                  className="h-4 w-4 rounded-md border border-white/30 bg-transparent accent-sky-400"
                />
              </label>

              <label className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-purple-300" />
                  <span>Ground track</span>
                </div>
                <input
                  type="checkbox"
                  checked={showGroundTrack}
                  onChange={(e) => setShowGroundTrack(e.target.checked)}
                  className="h-4 w-4 rounded-md border border-white/30 bg-transparent accent-sky-400"
                />
              </label>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Status Panel */}
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel absolute top-6 right-6 w-80 p-6"
      >
        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between text-sm text-white/70">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-emerald-300" />
              <span>Current time</span>
            </div>
            <span className="font-semibold text-white/90">
              {currentTime.toLocaleTimeString()}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm text-white/70">
            <div className="flex items-center gap-2">
              <Satellite className="h-5 w-5 text-sky-300" />
              <span>Tracked satellites</span>
            </div>
            <span className="font-semibold text-white/90">
              {satellites.length}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm text-white/70">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-indigo-300" />
              <span>Data status</span>
            </div>
            <span className="flex items-center gap-2 font-semibold text-white/90">
              <span className={`h-2.5 w-2.5 rounded-full ${isLoading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
              {isLoading ? 'Refreshing' : 'Live'}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Satellite Info Panel */}
      <AnimatePresence>
        {selectedSatellite && (
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="glass-panel absolute bottom-6 right-6 w-96 p-6"
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white/90">
                  {selectedSatellite.name}
                </h3>
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                  {selectedSatellite.type.replace('-', ' ')}
                </p>
              </div>
              <button
                onClick={() => setSelectedSatellite(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/60 transition hover:border-white/40 hover:bg-white/20 hover:text-white"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/40">Latitude</p>
                  <p className="mt-1 font-mono text-white/90">{selectedSatellite.latitude.toFixed(4)}°</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/40">Longitude</p>
                  <p className="mt-1 font-mono text-white/90">{selectedSatellite.longitude.toFixed(4)}°</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/40">Altitude</p>
                  <p className="mt-1 font-mono text-white/90">{selectedSatellite.altitude.toFixed(1)} km</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/40">Velocity</p>
                  <p className="mt-1 font-mono text-white/90">{selectedSatellite.velocity.toFixed(2)} km/s</p>
                </div>
              </div>
              
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.25em] text-white/40">Status</p>
                <div className="mt-2 flex items-center gap-2 text-sm font-medium text-white/80">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      selectedSatellite.status === 'active' ? 'bg-emerald-400' : 'bg-rose-400'
                    }`}
                  />
                  <span className="capitalize">{selectedSatellite.status}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="glass-panel relative z-10 flex items-center gap-3 px-6 py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-sky-300" />
            <span className="text-sm font-medium text-white/80">Loading satellite data...</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default SatelliteVisualizer