import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLat,
  degreesLong
} from 'satellite.js'

// Enhanced Satellite Service - Real data only, no demo fallbacks
const API_BASE_URL = (import.meta.env?.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '')
const CELESTRAK_TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle'
const FALLBACK_SAMPLE_SIZE = 800

class EnhancedSatelliteService {
  constructor() {
    this.apiUrl = API_BASE_URL
    this.cache = new Map()
    this.cacheTimeout = 30000 // 30 seconds
  }

  // Health check for the enhanced API
  async checkHealth() {
    try {
      const response = await fetch(`${this.apiUrl}/health`, {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) throw new Error(`Health check failed: ${response.status}`)
      const data = await response.json()
      console.log('🏥 Enhanced API Health:', data)
      return data.status === 'healthy'
    } catch (error) {
      console.error('❌ Enhanced API health check failed:', error)
      return false
    }
  }

  // Fetch all satellites from enhanced API (13,028 real satellites)
  async fetchAllSatellites() {
    const cacheKey = 'all_satellites'
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`📦 Using cached ${cached.data.length} satellites`)
        return cached.data
      }
    }

    try {
      console.log('🚀 Fetching all satellites from enhanced API...')
      
      const isHealthy = await this.checkHealth()
      if (!isHealthy) {
        throw new Error('Enhanced API is not healthy')
      }

      const response = await fetch(`${this.apiUrl}/api/v1/satellites?limit=1000`, {
        signal: AbortSignal.timeout(30000) // 30 second timeout for large dataset
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`)
      }

      const satellites = await response.json()
      console.log(`📡 Received ${satellites.length} satellites from enhanced API`)

      if (!Array.isArray(satellites) || satellites.length === 0) {
        throw new Error('No satellites received from enhanced API')
      }

      // Transform to frontend format
      const transformedSatellites = satellites.map((sat) => {
        const riskLevel = typeof sat.risk_level === 'string'
          ? sat.risk_level.toLowerCase()
          : 'unknown'

        return {
          id: `enhanced_${sat.norad_id}`,
          norad_id: sat.norad_id,
          name: sat.name,
          latitude: sat.lat_deg,
          longitude: sat.lon_deg,
          altitude: sat.alt_km,
          alt_km: sat.alt_km,
          velocity: sat.velocity_km_s,
          velocity_km_s: sat.velocity_km_s,
          tle_line1: sat.tle_line1 || null,
          tle_line2: sat.tle_line2 || null,
          type: this.categorizeSatellite(sat.name),
          status: 'active',
          source: 'enhanced-api',
          timestamp: sat.timestamp,
          riskLevel,
          riskScore: typeof sat.risk_score === 'number' ? sat.risk_score : null,
          riskReason: sat.risk_reason || 'No risk metadata provided'
        }
      })

      // Cache the result
      this.cache.set(cacheKey, {
        data: transformedSatellites,
        timestamp: Date.now()
      })

      console.log(`✅ Successfully processed ${transformedSatellites.length} real satellites`)
      return transformedSatellites

    } catch (error) {
      console.error('❌ Failed to fetch satellites from enhanced API:', error)
      console.warn('🌐 Falling back to Celestrak TLE feed...')
      return await this.handleFallback(cacheKey, FALLBACK_SAMPLE_SIZE)
    }
  }

  // Fetch the complete satellite catalog (~22k objects) for high-density visualizations
  async fetchFullCatalog({ forceRefresh = false } = {}) {
    const cacheKey = 'full_catalog'

    if (!forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`📦 Using cached full catalog with ${cached.data.length} satellites`)
        return cached.data
      }
    }

    try {
      console.log('🌍 Fetching full satellite catalog from enhanced API...')

      const isHealthy = await this.checkHealth()
      if (!isHealthy) {
        throw new Error('Enhanced API is not healthy')
      }

      const response = await fetch(`${this.apiUrl}/api/v1/satellites`, {
        signal: AbortSignal.timeout(60000) // Longer timeout for large dataset
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`)
      }

      const rawSatellites = await response.json()
      console.log(`🛰️ Received ${rawSatellites.length} satellites from catalog endpoint`)

      if (!Array.isArray(rawSatellites) || rawSatellites.length === 0) {
        throw new Error('No satellites received from enhanced API')
      }

      const transformed = rawSatellites.map((sat) => {
        const riskLevel = typeof sat.risk_level === 'string'
          ? sat.risk_level.toLowerCase()
          : 'unknown'

        return {
          id: `catalog_${sat.norad_id}`,
          norad_id: sat.norad_id,
          name: sat.name,
          latitude: sat.lat_deg,
          longitude: sat.lon_deg,
          altitude: sat.alt_km,
          alt_km: sat.alt_km,
          velocity: sat.velocity_km_s,
          velocity_km_s: sat.velocity_km_s,
          tle_line1: sat.tle_line1 || null,
          tle_line2: sat.tle_line2 || null,
          type: this.categorizeSatellite(sat.name),
          timestamp: sat.timestamp,
          riskLevel,
          riskScore: typeof sat.risk_score === 'number' ? sat.risk_score : null,
          riskReason: sat.risk_reason || 'No risk metadata provided'
        }
      })

      this.cache.set(cacheKey, {
        data: transformed,
        timestamp: Date.now()
      })

      console.log(`✅ Catalog ready with ${transformed.length} satellites`)
      return transformed
    } catch (error) {
      console.error('❌ Failed to fetch full satellite catalog:', error)
      console.warn('🌐 Falling back to Celestrak TLE feed for catalog...')
      return await this.handleFallback(cacheKey, 2000)
    }
  }

  // Get satellites for visualization (limit for performance)
  async getSatellitesForVisualization(limit = 100) {
    try {
      const allSatellites = await this.fetchAllSatellites()
      const limitedSatellites = allSatellites.slice(0, limit)
      
      console.log(`🎯 Using ${limitedSatellites.length} satellites for visualization`)
      return limitedSatellites
    } catch (error) {
      console.error('❌ Failed to get satellites for visualization:', error)
      throw error
    }
  }

  // Conjunction analysis with enhanced API
  async analyzeConjunctions(request) {
    try {
      console.log('🔍 Starting conjunction analysis with enhanced API...')
      console.log('📋 Request:', request)

      const response = await fetch(`${this.apiUrl}/api/v1/conjunctions/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(30000) // 30s timeout for analysis
      })

      if (!response.ok) {
        throw new Error(`Conjunction analysis failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      console.log('✅ Conjunction analysis completed:', result)
      return result

    } catch (error) {
      console.error('❌ Conjunction analysis failed:', error)
      throw error
    }
  }

  async predictRisk(request) {
    try {
      console.log('🧠 Requesting ML risk prediction...', request)

      const response = await fetch(`${this.apiUrl}/api/v1/risk/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(20000)
      })

      if (!response.ok) {
        throw new Error(`Risk prediction failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      console.log('✅ ML risk prediction result:', result)
      return result
    } catch (error) {
      console.error('❌ ML risk prediction failed:', error)
      throw error
    }
  }

  // Create proper conjunction request for enhanced API
  createConjunctionRequest(options = {}) {
    const request = {
      satellite_ids: options.satelliteIds || [],
      horizon_hours: options.windowHours || 24,
      screening_distance_km: options.distanceThreshold || 5.0,
      probability_threshold: options.probabilityThreshold || 0.001
    }
    
    console.log('📝 Created conjunction request:', request)
    return request
  }

  async assessLaunchFeasibility(feasibilityRequest) {
    try {
      console.log('🧪 Assessing launch feasibility...', feasibilityRequest)

      const response = await fetch(`${this.apiUrl}/api/v1/missions/launch/feasibility`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(feasibilityRequest),
        signal: AbortSignal.timeout(15000)
      })

      if (!response.ok) {
        throw new Error(`Launch feasibility failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      console.log('✅ Launch feasibility assessment:', result)
      return result
    } catch (error) {
      console.error('❌ Launch feasibility check failed:', error)
      throw error
    }
  }

  // Orbit reservation with enhanced API
  async createReservation(reservationRequest) {
    try {
      console.log('🛰️ Creating orbit reservation...')
      console.log('📋 Reservation request:', reservationRequest)

      const response = await fetch(`${this.apiUrl}/api/v1/reservations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reservationRequest),
        signal: AbortSignal.timeout(15000)
      })

      if (!response.ok) {
        throw new Error(`Reservation creation failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      console.log('✅ Orbit reservation created:', result)
      return result

    } catch (error) {
      console.error('❌ Orbit reservation failed:', error)
      throw error
    }
  }

  // Check reservation conflicts
  async checkReservationConflicts(reservationId) {
    try {
      const response = await fetch(`${this.apiUrl}/api/v1/reservations/${reservationId}/conflicts`, {
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        throw new Error(`Conflict check failed: ${response.status}`)
      }

      const result = await response.json()
      console.log('🔍 Conflict check completed:', result)
      return result

    } catch (error) {
      console.error('❌ Conflict check failed:', error)
      throw error
    }
  }

  async handleFallback(cacheKey, limit = FALLBACK_SAMPLE_SIZE) {
    try {
      const satellites = await this.fetchFromCelestrak(limit)

      if (!Array.isArray(satellites) || satellites.length === 0) {
        throw new Error('Celestrak fallback returned no satellites')
      }

      this.cache.set(cacheKey, {
        data: satellites,
        timestamp: Date.now()
      })

      console.log(`✅ Loaded ${satellites.length} satellites via Celestrak fallback`)
      return satellites
    } catch (fallbackError) {
      console.error('❌ Celestrak fallback failed:', fallbackError)
      throw fallbackError
    }
  }

  async fetchFromCelestrak(limit = FALLBACK_SAMPLE_SIZE) {
    const controller = AbortSignal.timeout?.(15000)

    const response = await fetch(CELESTRAK_TLE_URL, {
      signal: controller
    })

    if (!response.ok) {
      throw new Error(`Celestrak fetch failed: ${response.status} ${response.statusText}`)
    }

    const tleText = await response.text()
    const lines = tleText.trim().split(/\r?\n/)
    const now = new Date()
    const satellites = []

    for (let i = 0; i < lines.length && satellites.length < limit; i += 3) {
      if (i + 2 >= lines.length) break

      const name = lines[i].trim()
      const line1 = lines[i + 1]
      const line2 = lines[i + 2]

      const snapshot = this.createSnapshotFromTLE(name, line1, line2, now)
      if (snapshot) {
        satellites.push(snapshot)
      }
    }

    return satellites
  }

  createSnapshotFromTLE(name, line1, line2, timestamp) {
    try {
      const satrec = twoline2satrec(line1, line2)
      const positionVelocity = propagate(satrec, timestamp)

      if (!positionVelocity.position) {
        return null
      }

      const gmst = gstime(timestamp)
      const geodetic = eciToGeodetic(positionVelocity.position, gmst)

      const latitude = degreesLat(geodetic.latitude)
      const longitude = degreesLong(geodetic.longitude)
      const altitude = geodetic.height

      let velocity = null
      if (positionVelocity.velocity) {
        const { x, y, z } = positionVelocity.velocity
        velocity = Math.sqrt(x * x + y * y + z * z)
      }

      const noradIdString = line1.substring(2, 7).trim()
      const noradId = Number.parseInt(noradIdString, 10)
      const idBase = Number.isFinite(noradId) ? noradId : noradIdString || name

      return {
        id: `celestrak_${idBase}`,
        norad_id: idBase,
        name,
        latitude,
        longitude,
        altitude,
        alt_km: altitude,
        velocity,
        velocity_km_s: velocity || null,
        tle_line1: line1,
        tle_line2: line2,
        type: this.categorizeSatellite(name),
        status: 'active',
        source: 'celestrak',
        timestamp: timestamp.toISOString()
      }
    } catch (error) {
      console.warn(`⚠️ Failed to process TLE for ${name}:`, error)
      return null
    }
  }

  // Categorize satellite based on name
  categorizeSatellite(name) {
    const nameUpper = name.toUpperCase()
    
    if (nameUpper.includes('STARLINK')) return 'communication'
    if (nameUpper.includes('ONEWEB')) return 'communication'
    if (nameUpper.includes('GPS') || nameUpper.includes('GALILEO') || nameUpper.includes('GLONASS') || nameUpper.includes('BEIDOU')) return 'navigation'
    if (nameUpper.includes('ISS') || nameUpper.includes('SPACE STATION')) return 'space-station'
    if (nameUpper.includes('WEATHER') || nameUpper.includes('NOAA') || nameUpper.includes('GOES')) return 'weather'
    if (nameUpper.includes('MILITARY') || nameUpper.includes('CLASSIFIED')) return 'military'
    if (nameUpper.includes('SCIENCE') || nameUpper.includes('RESEARCH')) return 'scientific'
    if (nameUpper.includes('EARTH') || nameUpper.includes('OBSERVATION')) return 'earth-observation'
    
    return 'other'
  }

  // Clear cache
  clearCache() {
    this.cache.clear()
    console.log('🧹 Cache cleared')
  }

  // Get cache stats
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }
}

export default EnhancedSatelliteService