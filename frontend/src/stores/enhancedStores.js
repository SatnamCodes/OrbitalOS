import { create } from 'zustand'
import EnhancedSatelliteService from '../services/satelliteService_enhanced'
import toast from 'react-hot-toast'

const SATELLITE_CACHE_KEY = 'orbitalos_enhanced_satellite_cache_v1'
const SATELLITE_CACHE_TTL = 1000 * 60 * 15 // 15 minutes
const nowIso = () => new Date().toISOString()

// Enhanced Satellites Store - Real data only, no demo fallbacks
export const useEnhancedSatellitesStore = create((set, get) => ({
  satellites: [],
  isLoading: false,
  error: null,
  lastUpdated: null,
  satelliteService: new EnhancedSatelliteService(),
  loadStats: {
    lastLoadMs: null,
    lastSource: 'none',
    cacheHydrated: false,
    timestamp: null
  },

  // Load all satellites from enhanced API
  loadSatellites: async () => {
    set({ isLoading: true, error: null })

    let hydratedFromCache = false
    let cacheSnapshot = null

    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(SATELLITE_CACHE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && Array.isArray(parsed.data) && parsed.timestamp) {
            const age = Date.now() - parsed.timestamp
            if (age < SATELLITE_CACHE_TTL) {
              cacheSnapshot = parsed
              hydratedFromCache = true
              set({
                satellites: parsed.data,
                isLoading: true,
                lastUpdated: parsed.lastUpdated ?? nowIso(),
                loadStats: {
                  lastLoadMs: parsed.loadDurationMs ?? null,
                  lastSource: 'cache',
                  cacheHydrated: true,
                  timestamp: nowIso()
                }
              })
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ Failed to hydrate satellites from cache', error)
      }
    }

    const perfNow = typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now()
    const loadStart = perfNow()

    try {
      console.log('🚀 Loading satellites from enhanced API...')
      const satelliteService = get().satelliteService
      
      if (!hydratedFromCache) {
        try {
          const quickSatellites = await satelliteService.getSatellitesForVisualization(150)
          if (Array.isArray(quickSatellites) && quickSatellites.length > 0) {
            set({
              satellites: quickSatellites,
              lastUpdated: nowIso(),
              loadStats: {
                lastLoadMs: Math.round(perfNow() - loadStart),
                lastSource: 'visualization-snapshot',
                cacheHydrated: false,
                timestamp: nowIso()
              }
            })
          }
        } catch (snapshotError) {
          console.warn('⚠️ Quick satellite snapshot failed', snapshotError)
        }
      }

      const satellites = await satelliteService.fetchAllSatellites()
      const loadEnd = perfNow()

      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            SATELLITE_CACHE_KEY,
            JSON.stringify({
              data: satellites,
              timestamp: Date.now(),
              lastUpdated: nowIso(),
              loadDurationMs: Math.round(loadEnd - loadStart)
            })
          )
        } catch (cacheError) {
          console.warn('⚠️ Failed to persist satellite cache', cacheError)
        }
      }

      set({ 
        satellites, 
        isLoading: false, 
        error: null,
        lastUpdated: nowIso(),
        loadStats: {
          lastLoadMs: Math.round(loadEnd - loadStart),
          lastSource: 'api',
          cacheHydrated: hydratedFromCache,
          timestamp: nowIso()
        }
      })
      
      console.log(`✅ Loaded ${satellites.length} satellites successfully`)
      toast.success(`Loaded ${satellites.length} real satellites`, { id: 'satellites-loaded' })
      
      return satellites
    } catch (error) {
      console.error('❌ Failed to load satellites:', error)
      set({ 
        satellites: [], 
        isLoading: false, 
        error: error.message,
        lastUpdated: null,
        loadStats: {
          lastLoadMs: null,
          lastSource: hydratedFromCache ? 'cache' : 'api-error',
          cacheHydrated: hydratedFromCache,
          timestamp: nowIso()
        }
      })
      
      toast.error(`Failed to load satellites: ${error.message}`, { id: 'satellites-error' })
      if (cacheSnapshot) {
        return cacheSnapshot.data
      }
      throw error
    }
  },

  // Get satellites for visualization (performance optimized)
  getSatellitesForVisualization: async (limit = 100) => {
    try {
      const satelliteService = get().satelliteService
      return await satelliteService.getSatellitesForVisualization(limit)
    } catch (error) {
      console.error('❌ Failed to get satellites for visualization:', error)
      throw error
    }
  },

  // Refresh satellites
  refreshSatellites: async () => {
    const satelliteService = get().satelliteService
    satelliteService.clearCache()
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SATELLITE_CACHE_KEY)
    }
    return await get().loadSatellites()
  },

  // Get satellite by ID
  getSatelliteById: (id) => {
    const satellites = get().satellites
    return satellites.find(sat => sat.id === id || sat.norad_id === id)
  },

  // Get satellites by type
  getSatellitesByType: (type) => {
    const satellites = get().satellites
    return satellites.filter(sat => sat.type === type)
  },

  // Search satellites by name
  searchSatellites: (query) => {
    const satellites = get().satellites
    const queryLower = query.toLowerCase()
    return satellites.filter(sat => 
      sat.name.toLowerCase().includes(queryLower) ||
      sat.norad_id.toString().includes(query)
    )
  },

  // Get cache statistics
  getCacheStats: () => {
    const satelliteService = get().satelliteService
    return satelliteService.getCacheStats()
  }
}))

// Enhanced Risk Analysis Store
export const useEnhancedRiskStore = create((set, get) => ({
  riskData: [],
  isLoading: false,
  error: null,
  lastAnalysis: null,

  // Load risk data using conjunction analysis
  loadRiskData: async () => {
    set({ isLoading: true, error: null })
    
    try {
      console.log('🔍 Loading risk analysis data...')
      
      // This would integrate with the enhanced satellite service
      // For now, we'll set empty data since risk analysis needs specific satellite pairs
      set({ 
        riskData: [], 
        isLoading: false, 
        error: null,
        lastAnalysis: new Date().toISOString()
      })
      
      console.log('✅ Risk analysis data loaded')
      
    } catch (error) {
      console.error('❌ Failed to load risk data:', error)
      set({ 
        riskData: [], 
        isLoading: false, 
        error: error.message,
        lastAnalysis: null
      })
      
      toast.error(`Risk analysis failed: ${error.message}`)
      throw error
    }
  }
}))

// Enhanced Bookings Store (for orbit reservations)
export const useEnhancedBookingsStore = create((set, get) => ({
  reservations: [],
  isLoading: false,
  error: null,
  lastFeasibility: null,
  satelliteService: new EnhancedSatelliteService(),

  // Create orbit reservation
  createReservation: async (reservationData) => {
    set({ isLoading: true, error: null })
    
    try {
      console.log('🛰️ Creating orbit reservation...')
      const satelliteService = get().satelliteService
      
      const result = await satelliteService.createReservation(reservationData)
      
      const reservationEntry = {
        reservation: result?.reservation ?? null,
        safety: result?.safety ?? null
      }

      set(state => ({
        reservations: [reservationEntry, ...state.reservations],
        isLoading: false,
        error: null,
        lastFeasibility: result?.safety ?? state.lastFeasibility ?? null
      }))
      
      toast.success('Orbit reservation created successfully')
      return result
      
    } catch (error) {
      console.error('❌ Failed to create reservation:', error)
      set({ isLoading: false, error: error.message })
      
      toast.error(`Reservation failed: ${error.message}`)
      throw error
    }
  },

  assessLaunchFeasibility: async (payload) => {
    try {
      const satelliteService = get().satelliteService
      const assessment = await satelliteService.assessLaunchFeasibility(payload)

      set({ lastFeasibility: assessment, error: null })
      return assessment
    } catch (error) {
      console.error('❌ Launch feasibility check failed:', error)
      set(state => ({ lastFeasibility: state.lastFeasibility, error: error.message }))
      throw error
    }
  },

  // Check reservation conflicts
  checkConflicts: async (reservationId) => {
    try {
      const satelliteService = get().satelliteService
      return await satelliteService.checkReservationConflicts(reservationId)
    } catch (error) {
      console.error('❌ Failed to check conflicts:', error)
      throw error
    }
  }
}))

export default {
  useEnhancedSatellitesStore,
  useEnhancedRiskStore,
  useEnhancedBookingsStore
}