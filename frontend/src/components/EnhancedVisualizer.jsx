import React, { useState, useEffect, useRef } from 'react'
import { useEnhancedSatellitesStore } from '../stores/enhancedStores'
import { Viewer, Entity, PolylineGraphics } from 'resium'
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

// Set Cesium base URL
window.CESIUM_BASE_URL = '/cesium/'

const EnhancedVisualizer = () => {
  const { satellites, loadSatellites, isLoading } = useEnhancedSatellitesStore()
  
  const viewerRef = useRef()
  const [isPlaying, setIsPlaying] = useState(false)
  const [viewerReady, setViewerReady] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [selectedSatellite, setSelectedSatellite] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [visualizationSettings, setVisualizationSettings] = useState({
    maxSatellites: 150,
    showOrbits: true,
    showLabels: false,
    filterType: 'all',
    earthTexture: 'nasa'
  })

  // Initialize satellites on mount
  useEffect(() => {
    if (satellites.length === 0) {
      console.log('🚀 Loading enhanced satellites for visualization...')
      loadSatellites()
    }
  }, [satellites.length, loadSatellites])

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Get visualization data (limited for performance)
  const visualizationData = satellites
    .filter(sat => {
      if (visualizationSettings.filterType === 'all') return true
      if (visualizationSettings.filterType === 'starlink') return sat.name?.toLowerCase().includes('starlink')
      if (visualizationSettings.filterType === 'gps') return sat.type === 'navigation'
      if (visualizationSettings.filterType === 'geo') return sat.type === 'communication'
      return true
    })
    .slice(0, visualizationSettings.maxSatellites)

  // Cesium viewer configuration
  const viewerOptions = {
    terrainProvider: Cesium.createWorldTerrain({
      requestWaterMask: true,
      requestVertexNormals: true
    }),
    imageryProvider: new Cesium.TileMapServiceImageryProvider({
      url: visualizationSettings.earthTexture === 'nasa' 
        ? 'https://solarsystem.nasa.gov/gltf_embed/2393/' 
        : Cesium.buildModuleUrl('Assets/Textures/Earth/')
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

  // Create satellite entities
  const createSatelliteEntities = () => {
    return visualizationData.map((satellite) => {
      const color = getSatelliteColor(satellite)
      const position = Cesium.Cartesian3.fromDegrees(
        satellite.lon_deg || 0,
        satellite.lat_deg || 0,
        (satellite.alt_km || 400) * 1000 // Convert to meters
      )

      return (
        <Entity
          key={satellite.norad_id}
          position={position}
          point={{
            pixelSize: 8,
            color: color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }}
          label={visualizationSettings.showLabels ? {
            text: satellite.name,
            font: '10pt Arial',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -40),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          } : undefined}
          onClick={() => setSelectedSatellite(satellite)}
        />
      )
    })
  }

  // Handle viewer ready
  const handleViewerReady = () => {
    setViewerReady(true)
    if (viewerRef.current?.cesiumElement) {
      const viewer = viewerRef.current.cesiumElement
      
      // Set initial camera position
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, 30, 20000000)
      })

      // Enable lighting
      viewer.scene.globe.enableLighting = true
      viewer.scene.globe.dynamicAtmosphereLighting = true
      
      console.log('🌍 Enhanced 3D viewer ready with', visualizationData.length, 'satellites')
    }
  }

  // Toggle animation
  const toggleAnimation = () => {
    setIsPlaying(!isPlaying)
    if (viewerRef.current?.cesiumElement) {
      const viewer = viewerRef.current.cesiumElement
      if (isPlaying) {
        viewer.clock.shouldAnimate = false
      } else {
        viewer.clock.shouldAnimate = true
      }
    }
  }

  // Reset view
  const resetView = () => {
    if (viewerRef.current?.cesiumElement) {
      const viewer = viewerRef.current.cesiumElement
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, 30, 20000000)
      })
      setSelectedSatellite(null)
      toast.success('View reset')
    }
  }

  // Refresh satellites
  const refreshSatellites = () => {
    console.log('🔄 Refreshing satellite data...')
    loadSatellites()
    toast.success('Refreshing satellite data...')
  }

  return (
    <div className="relative h-screen w-full overflow-hidden text-white">
      <div className="absolute inset-0 -z-[30] bg-[#01010a]" />
      <div className="absolute inset-0 -z-[20] bg-[radial-gradient(circle_at_top,_rgba(79,70,229,0.24),_transparent_65%)] pointer-events-none" />
      <div className="absolute inset-0 -z-[10] bg-[radial-gradient(circle_at_bottom,_rgba(14,165,233,0.2),_transparent_60%)] pointer-events-none" />

      <div className="absolute top-6 left-6 z-30 grid w-[460px] gap-4">
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-panel px-6 py-5 text-white/90"
        >
          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Enhanced satellite tracking</h2>
                <p className="text-sm text-white/60">Visualize our curated catalog with cinematic clarity.</p>
              </div>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.32em] text-white/50">
                live
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">Catalog</p>
                <div className="mt-2 flex items-end gap-2 text-2xl font-semibold text-white/90">
                  <Satellite className="h-4 w-4 text-sky-300" />
                  <span>{satellites.length.toLocaleString()}</span>
                </div>
                <p className="mt-2 text-xs text-white/40">Updated at {currentTime.toLocaleTimeString()}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">Rendered</p>
                <div className="mt-2 text-2xl font-semibold text-white/90">{visualizationData.length}</div>
                <p className="mt-2 text-xs text-white/40">Tailored for performance</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.28em] text-white/40">Scene controls</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={toggleAnimation}
                  className="btn btn-primary justify-start px-3 py-2 text-xs"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {isPlaying ? 'Pause motion' : 'Resume motion'}
                </button>
                <button
                  onClick={resetView}
                  className="btn btn-secondary justify-start px-3 py-2 text-xs"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset view
                </button>
                <button
                  onClick={refreshSatellites}
                  disabled={isLoading}
                  className="btn btn-secondary justify-start px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh data
                </button>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="btn btn-secondary justify-start px-3 py-2 text-xs"
                >
                  <Settings className="h-4 w-4" />
                  Adjust layers
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {showSettings && (
          <motion.div
            initial={{ opacity: 0, x: -35 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass-panel px-5 py-4 text-white/80"
          >
            <div className="relative z-10 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.32em] text-white/60">
                Visualization settings
              </h3>

              <div className="space-y-3 text-sm">
                <div>
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>Max satellites</span>
                    <span>{visualizationSettings.maxSatellites}</span>
                  </div>
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
                    className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20"
                  />
                </div>

                <div>
                  <label className="text-xs uppercase tracking-[0.3em] text-white/50">
                    Filter type
                  </label>
                  <select
                    value={visualizationSettings.filterType}
                    onChange={(e) => setVisualizationSettings({
                      ...visualizationSettings,
                      filterType: e.target.value
                    })}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white/80 focus:border-sky-400 focus:outline-none"
                  >
                    <option value="all">All satellites</option>
                    <option value="starlink">Starlink</option>
                    <option value="gps">GPS/Navigation</option>
                    <option value="geo">Communication</option>
                  </select>
                </div>

                <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                  <span>Show labels</span>
                  <input
                    type="checkbox"
                    checked={visualizationSettings.showLabels}
                    onChange={(e) => setVisualizationSettings({
                      ...visualizationSettings,
                      showLabels: e.target.checked
                    })}
                    className="h-4 w-4 rounded-md border border-white/30 bg-transparent accent-sky-400"
                  />
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {selectedSatellite && (
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-panel absolute bottom-6 right-6 z-30 w-96 px-6 py-5 text-white/90"
        >
          <div className="relative z-10 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{selectedSatellite.name}</h3>
                <p className="text-xs uppercase tracking-[0.32em] text-white/50">NORAD {selectedSatellite.norad_id}</p>
              </div>
              <button
                onClick={() => setSelectedSatellite(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/60 transition hover:border-white/40 hover:bg-white/20 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">Type</p>
                <p className="mt-2 capitalize text-white/90">{selectedSatellite.type || 'Unknown'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">Altitude</p>
                <p className="mt-2 font-mono text-white/90">{selectedSatellite.alt_km?.toFixed(1)} km</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">Latitude</p>
                <p className="mt-2 font-mono text-white/90">{selectedSatellite.lat_deg?.toFixed(3)}°</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">Longitude</p>
                <p className="mt-2 font-mono text-white/90">{selectedSatellite.lon_deg?.toFixed(3)}°</p>
              </div>
              {selectedSatellite.velocity_km_s && (
                <div className="col-span-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/40">Velocity</p>
                  <p className="mt-2 font-mono text-white/90">{selectedSatellite.velocity_km_s?.toFixed(2)} km/s</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {isLoading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="glass-panel relative z-10 px-6 py-4 text-sm font-medium text-white/80">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 animate-spin text-sky-300" />
              <span>Loading enhanced satellite data...</span>
            </div>
          </div>
        </div>
      )}

      <Viewer
        ref={viewerRef}
        {...viewerOptions}
        onReady={handleViewerReady}
        className="h-full w-full"
      >
        {viewerReady && createSatelliteEntities()}
      </Viewer>
    </div>
  )
}

export default EnhancedVisualizer