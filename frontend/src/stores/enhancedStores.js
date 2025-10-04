import { create } from 'zustand'
import EnhancedSatelliteService from '../services/satelliteService_enhanced'
import toast from 'react-hot-toast'

// Enhanced Satellites Store - Real data only, no demo fallbacks
export const useEnhancedSatellitesStore = create((set, get) => ({
  satellites: [],
  isLoading: false,
  error: null,
  lastUpdated: null,
  satelliteService: new EnhancedSatelliteService(),

  // Load all satellites from enhanced API
  loadSatellites: async () => {
    set({ isLoading: true, error: null })
    
    try {
      console.log('🚀 Loading satellites from enhanced API...')
      const satelliteService = get().satelliteService
      
      const satellites = await satelliteService.fetchAllSatellites()
      
      set({ 
        satellites, 
        isLoading: false, 
        error: null,
        lastUpdated: new Date().toISOString()
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
        lastUpdated: null
      })
      
      toast.error(`Failed to load satellites: ${error.message}`, { id: 'satellites-error' })
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