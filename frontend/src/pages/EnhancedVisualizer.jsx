import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Viewer, Entity, PointGraphics, LabelGraphics, PolylineGraphics } from 'resium'
import * as Cesium from 'cesium'
import { useEnhancedSatellitesStore } from '../stores/enhancedStores'
import { Clock, Satellite, Activity, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

const VISUALIZATION_LIMIT = 150 // Limit for performance

const EnhancedVisualizer = () => {
  const viewerRef = useRef()
  const [viewerReady, setViewerReady] = useState(false)
  const [isLoadingRealTime, setIsLoadingRealTime] = useState(false)
  const [realTimeSatellites, setRealTimeSatellites] = useState([])
  const [selectedSatellite, setSelectedSatellite] = useState(null)
  const viewerConfiguredRef = useRef(false)

  const { 
    satellites, 
    isLoading, 
    error, 
    lastUpdated,
    loadSatellites, 
    getSatellitesForVisualization 
  } = useEnhancedSatellitesStore()

  // Initialize Cesium viewer
  const initializeViewer = useCallback(() => {
    if (!viewerRef.current || viewerConfiguredRef.current) return

    const viewer = viewerRef.current.cesiumElement
    
    // Enhanced Earth appearance
    viewer.scene.globe.enableLighting = true
    viewer.scene.globe.dynamicAtmosphereLighting = true
    viewer.scene.globe.atmosphereLightIntensity = 2.0
    viewer.scene.globe.showWaterEffect = true
    viewer.scene.globe.maximumScreenSpaceError = 1

    // High-resolution imagery
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

    // Enhanced atmosphere
    viewer.scene.skyAtmosphere.brightnessShift = 0.4
    viewer.scene.skyAtmosphere.saturationShift = 0.25

    // Camera controls
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-74.0, 40.7, 2000000)
    })

    viewerConfiguredRef.current = true
    console.log('✅ Enhanced Cesium viewer initialized')
  }, [])

  // Load satellites for visualization
  const loadVisualizationData = useCallback(async () => {
    setIsLoadingRealTime(true)
    
    try {
      console.log('🚀 Loading satellites for visualization...')
      
      const visualizationSatellites = await getSatellitesForVisualization(VISUALIZATION_LIMIT)
      
      // Transform for Cesium
      const transformedSatellites = visualizationSatellites.map(sat => ({
        id: sat.id,
        satid: sat.norad_id,
        satname: sat.name,
        satlat: sat.latitude,
        satlng: sat.longitude,
        satalt: sat.altitude,
        velocity: sat.velocity,
        type: sat.type,
        source: 'enhanced-api'
      }))
      
      setRealTimeSatellites(transformedSatellites)
      console.log(`✅ Loaded ${transformedSatellites.length} satellites for visualization`)
      
      toast.success(`Displaying ${transformedSatellites.length} real satellites`, { 
        id: 'visualization-loaded' 
      })
      
    } catch (error) {
      console.error('❌ Failed to load visualization data:', error)
      toast.error('Failed to load satellite visualization', { id: 'visualization-error' })
    } finally {
      setIsLoadingRealTime(false)
    }
  }, [getSatellitesForVisualization])

  // Get satellite color based on type
  const getSatelliteColor = useCallback((type) => {
    const colors = {
      'communication': Cesium.Color.CYAN,
      'navigation': Cesium.Color.GREEN,
      'space-station': Cesium.Color.YELLOW,
      'weather': Cesium.Color.ORANGE,
      'military': Cesium.Color.RED,
      'scientific': Cesium.Color.PURPLE,
      'earth-observation': Cesium.Color.BLUE,
      'other': Cesium.Color.WHITE
    }
    return colors[type] || Cesium.Color.WHITE
  }, [])

  // Create satellite entity
  const createSatelliteEntity = useCallback((satellite) => {
    const position = Cesium.Cartesian3.fromDegrees(
      satellite.satlng,
      satellite.satlat,
      satellite.satalt * 1000 // Convert km to meters
    )

    return (
      <Entity
        key={satellite.id}
        id={satellite.id}
        position={position}
        onClick={() => setSelectedSatellite(satellite)}
      >
        <PointGraphics
          pixelSize={6}
          color={getSatelliteColor(satellite.type)}
          outlineColor={Cesium.Color.WHITE}
          outlineWidth={1}
          heightReference={Cesium.HeightReference.NONE}
        />
        <LabelGraphics
          text={satellite.satname}
          font="12px monospace"
          fillColor={Cesium.Color.WHITE}
          outlineColor={Cesium.Color.BLACK}
          outlineWidth={2}
          style={Cesium.LabelStyle.FILL_AND_OUTLINE}
          pixelOffset={new Cesium.Cartesian2(0, -30)}
          show={selectedSatellite?.id === satellite.id}
        />
      </Entity>
    )
  }, [getSatelliteColor, selectedSatellite])

  // Load satellites on mount
  useEffect(() => {
    loadSatellites()
  }, [loadSatellites])

  // Initialize viewer when ready
  useEffect(() => {
    if (viewerReady) {
      initializeViewer()
      loadVisualizationData()
    }
  }, [viewerReady, initializeViewer, loadVisualizationData])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isLoadingRealTime) {
        loadVisualizationData()
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [loadVisualizationData, isLoadingRealTime])

  const formattedLastUpdated = lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'
  const combinedLoading = isLoadingRealTime || isLoading

  return (
    <div className="relative h-screen w-full overflow-hidden text-white">
      <div className="absolute inset-0 -z-[30] bg-[#01010a]" />
      <div className="absolute inset-0 -z-[20] bg-[radial-gradient(circle_at_top,_rgba(79,70,229,0.2),_transparent_65%)] pointer-events-none" />
      <div className="absolute inset-0 -z-[10] bg-[radial-gradient(circle_at_bottom,_rgba(14,165,233,0.18),_transparent_60%)] pointer-events-none" />

      {/* Header Stats */}
      <div className="glass-panel absolute top-6 left-6 z-10 w-[420px] p-6 text-white/90">
        <div className="relative z-10 space-y-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Orbital snapshot</h2>
            <p className="mt-1 text-sm text-white/60">
              Monitor the live catalog and currently rendered satellites in this scene.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm text-white/80">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.28em] text-white/40">Catalogued</p>
              <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-white/90">
                <Satellite className="h-4 w-4 text-sky-300" />
                <span>{satellites.length.toLocaleString()}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.28em] text-white/40">In view</p>
              <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-white/90">
                <Activity className="h-4 w-4 text-emerald-300" />
                <span>{realTimeSatellites.length}</span>
              </div>
            </div>
            <div className="col-span-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.28em] text-white/40">Last sync</p>
              <div className="mt-2 flex items-center justify-between text-sm font-medium text-white/80">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-indigo-300" />
                  <span>{formattedLastUpdated}</span>
                </div>
                {combinedLoading && (
                  <span className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-white/60">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-ping" />
                    syncing
                  </span>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Satellite Info Panel */}
      {selectedSatellite && (
        <div className="glass-panel absolute top-6 right-6 z-10 w-80 p-6 text-white/90">
          <div className="relative z-10 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{selectedSatellite.satname}</h3>
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">NORAD {selectedSatellite.satid}</p>
              </div>
              <button
                onClick={() => setSelectedSatellite(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/60 transition hover:border-white/40 hover:bg-white/20 hover:text-white"
                aria-label="Close satellite details"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 text-sm text-white/80">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">Type</p>
                <p className="mt-2 capitalize text-white/90">{selectedSatellite.type || 'unknown'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">Altitude</p>
                <p className="mt-2 font-mono text-white/90">{selectedSatellite.satalt?.toFixed(1)} km</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/40">Latitude</p>
                  <p className="mt-2 font-mono text-white/90">{selectedSatellite.satlat?.toFixed(3)}°</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/40">Longitude</p>
                  <p className="mt-2 font-mono text-white/90">{selectedSatellite.satlng?.toFixed(3)}°</p>
                </div>
              </div>
              {selectedSatellite.velocity && (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/40">Velocity</p>
                  <p className="mt-2 font-mono text-white/90">{selectedSatellite.velocity?.toFixed(2)} km/s</p>
                </div>
              )}
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/60">
                <span className="uppercase tracking-[0.28em] text-white/40">Source</span>
                <p className="mt-2 font-medium text-white/80">{selectedSatellite.source}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="glass-panel absolute bottom-6 left-6 z-10 w-72 p-6 text-white/80">
        <div className="relative z-10">
          <h4 className="text-xs font-semibold uppercase tracking-[0.4em] text-white/50">Legend</h4>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-cyan-400" />
                <span>Communication</span>
              </div>
              <span className="text-white/40">Freq relay</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-green-400" />
                <span>Navigation</span>
              </div>
              <span className="text-white/40">GNSS</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <span>Space station</span>
              </div>
              <span className="text-white/40">Habitats</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-orange-400" />
                <span>Weather</span>
              </div>
              <span className="text-white/40">Climate</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-blue-400" />
                <span>Earth observation</span>
              </div>
              <span className="text-white/40">Imagery</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-purple-400" />
                <span>Scientific</span>
              </div>
              <span className="text-white/40">Research</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cesium Viewer */}
      <Viewer
        ref={viewerRef}
        full
        animation={false}
        timeline={false}
        navigationHelpButton={false}
        homeButton={false}
        sceneModePicker={false}
        baseLayerPicker={false}
        geocoder={false}
        infoBox={false}
        selectionIndicator={false}
        onReady={() => {
          console.log('🎯 Cesium viewer ready')
          setViewerReady(true)
        }}
      >
        {/* Render satellite entities */}
        {realTimeSatellites.map(satellite => createSatelliteEntity(satellite))}
      </Viewer>
    </div>
  )
}

export default EnhancedVisualizer