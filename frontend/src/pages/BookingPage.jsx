import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { Calendar, Clock, AlertCircle, CheckCircle } from 'lucide-react'
import { useEnhancedBookingsStore, useEnhancedSatellitesStore } from '../stores/enhancedStores'
import toast from 'react-hot-toast'
import { api } from '../stores/authStore'

const BookingPage = () => {
  const {
    createReservation,
    assessLaunchFeasibility,
    checkConflicts: checkReservationConflicts,
    lastFeasibility,
    isLoading
  } = useEnhancedBookingsStore()
  const { satellites } = useEnhancedSatellitesStore()
  const [conflictCheck, setConflictCheck] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)
  const [safetyReport, setSafetyReport] = useState(null)
  const [feasibilityPending, setFeasibilityPending] = useState(false)
  const activeSafety = useMemo(() => safetyReport ?? lastFeasibility, [safetyReport, lastFeasibility])
  const minSeparationKm = activeSafety?.summary?.minimum_distance_km ?? null
  const maxCollisionProbability = activeSafety?.summary?.max_collision_probability ?? null
  const recommendedActions = activeSafety?.assessment?.recommendations ?? []
  
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm()
  
  const watchedSatellite = watch('satellite_id')
  const watchedStartTime = watch('start_time')
  const watchedEndTime = watch('end_time')

  const selectedSatellite = useMemo(
    () => satellites.find((sat) => sat.id === watchedSatellite),
    [satellites, watchedSatellite]
  )

  const windowMinutes = useMemo(() => {
    if (!watchedStartTime || !watchedEndTime) {
      return null
    }
    const start = new Date(watchedStartTime)
    const end = new Date(watchedEndTime)
    const diff = (end.getTime() - start.getTime()) / 60000
    return Number.isFinite(diff) && diff > 0 ? Math.max(10, Math.round(diff)) : null
  }, [watchedStartTime, watchedEndTime])

  const formatTimestamp = (value) => {
    if (!value) {
      return '—'
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return '—'
    }
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  // Map operation types to reservation types
  const mapOperationToReservationType = (operationType) => {
    const mapping = {
      'launch_window': 'LaunchCorridor',
      'orbit_shift': 'OperationalSlot',
      'payload_activation': 'OperationalSlot',
      'maneuver': 'MaintenanceBBox'
    }
    return mapping[operationType] || 'OperationalSlot'
  }

  const buildLaunchProfile = (data, selectedSat) => {
    const altitude = selectedSat?.altitude ?? selectedSat?.alt_km ?? 500
    const inclination = selectedSat?.inclination ?? selectedSat?.inclination_deg ?? 53

    return {
      vehicle_name: selectedSat?.name || 'Orbital Launch Vehicle',
      epoch: new Date(data.start_time).toISOString(),
      perigee_alt_km: altitude,
      apogee_alt_km: altitude,
      inclination_deg: inclination,
      raan_deg: selectedSat?.raan ?? selectedSat?.raan_deg ?? 0,
      arg_perigee_deg: selectedSat?.arg_perigee_deg ?? 0,
      mean_anomaly_deg: selectedSat?.mean_anomaly_deg ?? 0,
      proposed_norad_id: selectedSat?.norad_id ?? undefined
    }
  }

  const buildFeasibilityPayload = (data, selectedSat) => {
    const launchProfile = buildLaunchProfile(data, selectedSat)

    return {
      customer: data.customer_name || 'OrbitalOS Customer',
      mission_name: data.mission_name || `${selectedSat?.name || 'Mission'} ${data.operation_type || ''}`.trim(),
      launch: {
        ...launchProfile,
        // Backend expects without proposed_norad_id when undefined
        proposed_norad_id: launchProfile.proposed_norad_id
      },
      window_hours: windowMinutes ? Math.ceil(windowMinutes / 60) || 1 : 1,
      protection_radius_km: 5,
      max_conjunction_probability: 0.001,
      priority_level: 'Medium',
      rideshare: data.is_rideshare || false
    }
  }

  const onSubmit = async (data) => {
    try {
      const selectedSat = satellites.find(s => s.id === data.satellite_id)
      if (!selectedSat) {
        toast.error('Please select a valid satellite')
        return
      }

      const feasibilityPayload = buildFeasibilityPayload(data, selectedSat)

      try {
        setFeasibilityPending(true)
        const feasibilityAssessment = await assessLaunchFeasibility(feasibilityPayload)
        setSafetyReport(feasibilityAssessment)
      } catch (error) {
        toast.error('Launch feasibility assessment failed')
      } finally {
        setFeasibilityPending(false)
      }

      // Create reservation request using enhanced API structure
      const reservationRequest = {
        owner: "OrbitalOS User", // TODO: Get from auth
        reservation_type: mapOperationToReservationType(data.operation_type),
        start_time: new Date(data.start_time).toISOString(),
        end_time: new Date(data.end_time).toISOString(),
        center_tle: {
          norad_id: selectedSat.norad_id || selectedSat.id,
          name: selectedSat.name,
          tle_line1: selectedSat.tle_line1 || "",
          tle_line2: selectedSat.tle_line2 || ""
        },
        protection_radius_km: 5.0, // Default 5km protection radius
        priority_level: "Medium",
        constraints: {
          max_conjunction_probability: 0.001,
          minimum_separation_km: 1.0,
          notification_threshold_hours: 24,
          allow_debris_tracking: true,
          coordinate_system: "ECI"
        },
        new_launch: buildLaunchProfile(data, selectedSat)
      }

      const result = await createReservation(reservationRequest)
      setSafetyReport(result?.safety ?? null)
      
      // Check for conflicts immediately after creation
      const reservationId = result?.reservation?.id || result?.reservation_id
      if (reservationId) {
        const conflictCheck = await checkReservationConflicts(reservationId)
        if (conflictCheck.conflicts_found > 0) {
          setConflictCheck({
            hasConflict: true,
            reason: `Found ${conflictCheck.conflicts_found} potential conflicts. Risk score: ${conflictCheck.total_risk_score.toFixed(2)}`
          })
        } else {
          setConflictCheck({ hasConflict: false })
        }
      }

      toast.success('Orbital reservation created successfully')
      reset()
    } catch (error) {
      console.error('Reservation failed:', error)
      toast.error('Failed to create orbital reservation')
    }
  }

  const checkConflicts = async () => {
    if (!watchedSatellite || !watchedStartTime || !watchedEndTime) {
      return
    }

    setIsAnalyzing(true)
    setAnalysisError(null)

    try {
      const launchTimeIso = new Date(watchedStartTime).toISOString()

      const response = await api.post('/tle/analyze', {
        launch_vehicle: selectedSatellite?.name || 'Orbital launch',
        launch_time: launchTimeIso,
        desired_altitude_km: selectedSatellite?.altitude ?? 550,
        desired_inclination_deg: selectedSatellite?.inclination ?? 53,
        launch_site_lat_deg: null,
        launch_site_lon_deg: null,
        payload_mass_kg: undefined,
        window_minutes: windowMinutes ?? undefined,
      })

      const analysis = response.data
      const hasConflict = Array.isArray(analysis.conflicts) && analysis.conflicts.length > 0

      setConflictCheck({
        hasConflict,
        analysis,
      })

      toast.success('Launch window analyzed with SGP4 propagation')
    } catch (error) {
      console.error('Launch analysis failed', error)
      setAnalysisError('Unable to analyze launch window. Please try again.')
      toast.error('Conflict analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div>
              <h1 className="text-2xl font-bold text-white">Booking Request</h1>
              <p className="text-gray-400">Schedule satellite operations and maneuvers</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Booking Form */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <h2 className="text-lg font-semibold text-white mb-6">Operation Details</h2>
              
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Satellite Selection */}
                <div>
                  <label className="label">Select Satellite</label>
                  <select
                    {...register('satellite_id', { required: 'Please select a satellite' })}
                    className="input"
                  >
                    <option value="">Choose a satellite...</option>
                    {satellites.map((satellite) => (
                      <option key={satellite.id} value={satellite.id}>
                        {satellite.name} ({satellite.operator})
                      </option>
                    ))}
                  </select>
                  {errors.satellite_id && (
                    <p className="text-red-400 text-sm mt-1">{errors.satellite_id.message}</p>
                  )}
                </div>

                {/* Operation Type */}
                <div>
                  <label className="label">Operation Type</label>
                  <select
                    {...register('operation_type', { required: 'Please select operation type' })}
                    className="input"
                  >
                    <option value="">Select operation...</option>
                    <option value="orbit_shift">Orbit Shift</option>
                    <option value="payload_activation">Payload Activation</option>
                    <option value="launch_window">Launch Window</option>
                    <option value="maneuver">Maneuver</option>
                  </select>
                  {errors.operation_type && (
                    <p className="text-red-400 text-sm mt-1">{errors.operation_type.message}</p>
                  )}
                </div>

                {/* Mission Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Mission Name</label>
                    <input
                      type="text"
                      {...register('mission_name')}
                      placeholder="e.g., Aurora Deployment"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Customer Name</label>
                    <input
                      type="text"
                      {...register('customer_name')}
                      placeholder="e.g., Skylink Systems"
                      className="input"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    id="rideshare"
                    type="checkbox"
                    {...register('is_rideshare')}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-400"
                  />
                  <label htmlFor="rideshare" className="label text-sm font-normal text-gray-300">
                    This is a rideshare mission
                  </label>
                </div>

                {/* Time Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Start Time</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="datetime-local"
                        {...register('start_time', { required: 'Start time is required' })}
                        className="input pl-10"
                      />
                    </div>
                    {errors.start_time && (
                      <p className="text-red-400 text-sm mt-1">{errors.start_time.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="label">End Time</label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="datetime-local"
                        {...register('end_time', { required: 'End time is required' })}
                        className="input pl-10"
                      />
                    </div>
                    {errors.end_time && (
                      <p className="text-red-400 text-sm mt-1">{errors.end_time.message}</p>
                    )}
                  </div>
                </div>

                {/* Conflict Check Button */}
                <div className="flex justify-between items-center">
                  <button
                    type="button"
                    onClick={checkConflicts}
                    className="btn btn-secondary"
                    disabled={
                      !watchedSatellite || !watchedStartTime || !watchedEndTime || isAnalyzing
                    }
                  >
                    {isAnalyzing ? 'Analyzing…' : 'Check for Conflicts'}
                  </button>
                  
                  <button
                    type="submit"
                    disabled={isLoading || feasibilityPending}
                    className="btn btn-primary"
                  >
                    {feasibilityPending ? 'Assessing…' : isLoading ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Conflict Status */}
            {conflictCheck && conflictCheck.analysis && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`card border-l-4 ${
                  conflictCheck.hasConflict
                    ? 'border-red-500 bg-red-900/20'
                    : 'border-green-500 bg-green-900/20'
                }`}
              >
                <div className="flex items-center space-x-3">
                  {conflictCheck.hasConflict ? (
                    <AlertCircle className="h-6 w-6 text-red-400" />
                  ) : (
                    <CheckCircle className="h-6 w-6 text-green-400" />
                  )}
                  <div>
                    <h3 className="font-semibold text-white">
                      {conflictCheck.hasConflict ? 'Conflict Detected' : 'No Conflicts'}
                    </h3>
                    <p className="text-sm text-gray-300">
                      {conflictCheck.hasConflict
                        ? 'Potential conjunctions identified inside your requested window.'
                        : 'Requested launch window is clear.'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-sm text-gray-300">
                  <div>
                    <span className="font-medium text-white">Requested window:</span>
                    <br />
                    {formatTimestamp(conflictCheck.analysis.requested_window_start)}
                    {' — '}
                    {formatTimestamp(conflictCheck.analysis.requested_window_end)}
                  </div>
                  <div>
                    <span className="font-medium text-white">Recommended window:</span>
                    <br />
                    {formatTimestamp(conflictCheck.analysis.recommended_window_start)}
                    {' — '}
                    {formatTimestamp(conflictCheck.analysis.recommended_window_end)}
                  </div>
                  <div>
                    <span className="font-medium text-white">Suggested orbit:</span>
                    <br />
                    {conflictCheck.analysis.suggested_orbit.altitude_km.toFixed(1)} km @{' '}
                    {conflictCheck.analysis.suggested_orbit.inclination_deg.toFixed(2)}°
                    <p className="text-xs text-gray-400 mt-1">
                      {conflictCheck.analysis.suggested_orbit.notes}
                    </p>
                  </div>

                  {conflictCheck.analysis.conflicts.length > 0 && (
                    <div className="space-y-2">
                      <span className="font-medium text-white">Conflicts ({conflictCheck.analysis.conflicts.length}):</span>
                      <div className="space-y-2">
                        {conflictCheck.analysis.conflicts.slice(0, 3).map((conflict) => (
                          <div key={`${conflict.norad_id}-${conflict.time_utc}`} className="rounded-lg border border-white/10 bg-black/40 p-3">
                            <div className="flex items-center justify-between text-xs text-gray-300">
                              <span>{conflict.name}</span>
                              <span>{conflict.miss_distance_km.toFixed(2)} km miss</span>
                            </div>
                            <div className="mt-1 text-[11px] text-gray-400">
                              {formatTimestamp(conflict.time_utc)} · {conflict.relative_speed_km_s.toFixed(2)} km/s
                            </div>
                          </div>
                        ))}
                        {conflictCheck.analysis.conflicts.length > 3 && (
                          <p className="text-xs text-gray-500">+{conflictCheck.analysis.conflicts.length - 3} additional conflicts</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {analysisError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                {analysisError}
              </div>
            )}

            {/* Launch Feasibility */}
            {activeSafety && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card border border-blue-500/30 bg-blue-900/10"
              >
                <div className="flex items-center space-x-3">
                  {activeSafety?.safe_to_launch
                    ? <CheckCircle className="h-6 w-6 text-emerald-400" />
                    : <AlertCircle className="h-6 w-6 text-amber-400" />}
                  <div>
                    <h3 className="font-semibold text-white">Launch Feasibility</h3>
                    <p className="text-sm text-gray-300">
                      {activeSafety?.safe_to_launch
                        ? 'Launch corridor meets safety thresholds.'
                        : 'Additional mitigation recommended before launch.'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-sm text-gray-200">
                  <div>
                    <span className="font-medium text-white">Conflicts Found:</span>
                    <p className="mt-1 text-base font-semibold">
                      {activeSafety?.summary?.conflicts_found ?? 0}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs text-gray-300">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <span className="block text-[11px] uppercase tracking-wide text-gray-400">Highest Severity</span>
                      <span className="mt-1 text-sm font-semibold">
                        {activeSafety?.summary?.highest_severity || 'Unknown'}
                      </span>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <span className="block text-[11px] uppercase tracking-wide text-gray-400">Total Risk Score</span>
                      <span className="mt-1 text-sm font-semibold">
                        {(activeSafety?.summary?.total_risk_score ?? 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="font-medium text-white">Minimum Separation:</span>
                    <p className="mt-1 text-sm">
                      {minSeparationKm != null
                        ? `${minSeparationKm.toFixed(2)} km`
                        : 'Not available'}
                    </p>
                  </div>

                  <div>
                    <span className="font-medium text-white">Max Collision Probability:</span>
                    <p className="mt-1 text-sm">
                      {maxCollisionProbability != null
                        ? maxCollisionProbability.toExponential(2)
                        : 'Not available'}
                    </p>
                  </div>

                  {recommendedActions.length > 0 && (
                    <div>
                      <span className="font-medium text-white">Recommended Actions:</span>
                      <ul className="mt-1 list-disc list-inside space-y-1 text-gray-300">
                        {recommendedActions.slice(0, 3).map((action, idx) => (
                          <li key={idx}>{action}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Operation Guidelines */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="card"
            >
              <h3 className="font-semibold text-white mb-4">Operation Guidelines</h3>
              <div className="space-y-3 text-sm text-gray-300">
                <div className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                  <p>Minimum 2-hour advance notice required</p>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                  <p>Operations are subject to risk assessment</p>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                  <p>Emergency operations may override conflicts</p>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                  <p>All operations are logged and monitored</p>
                </div>
              </div>
            </motion.div>

            {/* Quick Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="card"
            >
              <h3 className="font-semibold text-white mb-4">Quick Stats</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Active Satellites</span>
                  <span className="text-white">{satellites.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Pending Requests</span>
                  <span className="text-white">3</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Success Rate</span>
                  <span className="text-green-400">94.2%</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BookingPage
