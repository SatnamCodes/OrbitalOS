import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { Calendar, Clock, AlertCircle, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../stores/authStore'
import { useEnhancedBookingsStore, useEnhancedSatellitesStore } from '../stores/enhancedStores'

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
  const [orbitRecommendation, setOrbitRecommendation] = useState(null)
  const [isRecommending, setIsRecommending] = useState(false)
  const [recommendationError, setRecommendationError] = useState(null)

  const activeSafety = useMemo(
    () => safetyReport ?? lastFeasibility,
    [safetyReport, lastFeasibility]
  )
  const minSeparationKm = activeSafety?.summary?.minimum_distance_km ?? null
  const maxCollisionProbability = activeSafety?.summary?.max_collision_probability ?? null
  const recommendedActions = activeSafety?.assessment?.recommendations ?? []

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    getValues,
    formState: { errors }
  } = useForm({
    defaultValues: {
      planner_mode: '',
      is_rideshare: false
    },
    shouldUnregister: true
  })

  const plannerMode = watch('planner_mode')
  const watchedSatellite = watch('satellite_id')
  const watchedStartTime = watch('start_time')
  const watchedEndTime = watch('end_time')
  const watchedPerigee = watch('perigee_alt_km')
  const watchedInclination = watch('inclination_deg')

  useEffect(() => {
    if (!plannerMode) {
      return
    }

    setConflictCheck(null)
    setAnalysisError(null)
    setSafetyReport(null)
    setRecommendationError(null)
    setOrbitRecommendation(null)

    if (plannerMode === 'new') {
      setValue('satellite_id', '')
      setValue('operation_type', 'launch_window', { shouldValidate: true })
    } else {
      setValue('launch_vehicle_name', '')
      setValue('payload_mass_kg', undefined)
      setValue('perigee_alt_km', undefined)
      setValue('apogee_alt_km', undefined)
      setValue('inclination_deg', undefined)
      setValue('raan_deg', undefined)
      setValue('arg_perigee_deg', undefined)
      setValue('mean_anomaly_deg', undefined)
      setValue('launch_site_lat_deg', undefined)
      setValue('launch_site_lon_deg', undefined)
    }
  }, [plannerMode, setValue])

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

  const canRunExistingAnalysis = Boolean(
    plannerMode === 'existing' && watchedSatellite && watchedStartTime && watchedEndTime
  )

  const hasNewOrbitInputs = useMemo(() => {
    if (plannerMode !== 'new') {
      return false
    }
    if (!watchedStartTime || !watchedEndTime) {
      return false
    }
    const perigeeValue = Number(watchedPerigee)
    const inclinationValue = Number(watchedInclination)
    return Number.isFinite(perigeeValue) && perigeeValue > 0 && Number.isFinite(inclinationValue)
  }, [plannerMode, watchedStartTime, watchedEndTime, watchedPerigee, watchedInclination])

  const canRunAnalysis = plannerMode === 'existing' ? canRunExistingAnalysis : hasNewOrbitInputs

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
      second: '2-digit'
    })
  }

  const formatNumber = (value, digits = 2) => {
    return Number.isFinite(value) ? Number(value).toFixed(digits) : '—'
  }

  const mapOperationToReservationType = (operationType) => {
    const mapping = {
      launch_window: 'LaunchCorridor',
      orbit_shift: 'OperationalSlot',
      payload_activation: 'OperationalSlot',
      maneuver: 'MaintenanceBBox'
    }
    return mapping[operationType] || 'OperationalSlot'
  }

  const buildLaunchProfile = (data, sat, mode) => {
    const isNewMission = mode === 'new'

    const fallbackAltitude = sat?.altitude ?? sat?.alt_km ?? 500
    const perigeeInput = Number(data.perigee_alt_km ?? data.target_altitude_km)
    const apogeeInput = Number(data.apogee_alt_km ?? data.target_altitude_km)
    const inclinationInput = Number(data.inclination_deg)
    const raanInput = Number(data.raan_deg)
    const argPerigeeInput = Number(data.arg_perigee_deg)
    const meanAnomalyInput = Number(data.mean_anomaly_deg)

    const perigee = isNewMission && Number.isFinite(perigeeInput) ? perigeeInput : fallbackAltitude
    const apogee = isNewMission && Number.isFinite(apogeeInput) ? apogeeInput : perigee
    const inclination = isNewMission && Number.isFinite(inclinationInput)
      ? inclinationInput
      : sat?.inclination ?? sat?.inclination_deg ?? 53
    const raan = isNewMission && Number.isFinite(raanInput)
      ? raanInput
      : sat?.raan ?? sat?.raan_deg ?? 0
    const argPerigee = isNewMission && Number.isFinite(argPerigeeInput)
      ? argPerigeeInput
      : sat?.arg_perigee_deg ?? 0
    const meanAnomaly = isNewMission && Number.isFinite(meanAnomalyInput)
      ? meanAnomalyInput
      : sat?.mean_anomaly_deg ?? 0

    const vehicleName = isNewMission
      ? data.launch_vehicle_name || data.mission_name || 'Orbital Launch Vehicle'
      : sat?.name || 'Orbital Launch Vehicle'

    const epochSource = data.start_time ? new Date(data.start_time) : new Date()

    return {
      vehicle_name: vehicleName,
      epoch: epochSource.toISOString(),
      perigee_alt_km: Number.isFinite(perigee) ? perigee : fallbackAltitude,
      apogee_alt_km: Number.isFinite(apogee) ? apogee : Number.isFinite(perigee) ? perigee : fallbackAltitude,
      inclination_deg: Number.isFinite(inclination) ? inclination : 53,
      raan_deg: Number.isFinite(raan) ? raan : 0,
      arg_perigee_deg: Number.isFinite(argPerigee) ? argPerigee : 0,
      mean_anomaly_deg: Number.isFinite(meanAnomaly) ? meanAnomaly : 0,
      proposed_norad_id: isNewMission ? undefined : sat?.norad_id ?? undefined
    }
  }

  const buildFeasibilityPayload = (data, sat, mode, windowMinutesValue) => {
    const launchProfile = buildLaunchProfile(data, sat, mode)
    const defaultMissionName = sat?.name
      ? `${sat.name} ${data.operation_type || ''}`.trim()
      : `Mission ${data.operation_type || ''}`.trim()

    return {
      customer: data.customer_name || 'OrbitalOS Customer',
      mission_name: data.mission_name || defaultMissionName || 'Mission Proposal',
      launch: {
        ...launchProfile,
        proposed_norad_id: launchProfile.proposed_norad_id
      },
      window_hours: windowMinutesValue ? Math.ceil(windowMinutesValue / 60) || 1 : 1,
      protection_radius_km: 5,
      max_conjunction_probability: 0.001,
      priority_level: 'Medium',
      rideshare: data.is_rideshare || false
    }
  }

  const runConflictAnalysis = async (analysisPayload, contextLabel = 'existing', { silentToast = false } = {}) => {
    setIsAnalyzing(true)
    setAnalysisError(null)

    try {
      const response = await api.post('/tle/analyze', analysisPayload)
      const analysis = response.data
      const hasConflict = Array.isArray(analysis.conflicts) && analysis.conflicts.length > 0

      setConflictCheck({
        hasConflict,
        analysis,
        context: contextLabel
      })

      if (!silentToast) {
        toast.success('Risk analysis completed with SGP4 propagation')
      }

      return analysis
    } catch (error) {
      console.error('Launch analysis failed', error)
      setAnalysisError('Unable to analyze launch window. Please try again.')
      if (!silentToast) {
        toast.error('Conflict analysis failed')
      }
      throw error
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleNewMissionPlan = async (data) => {
    const perigee = Number(data.perigee_alt_km)
    const apogee = Number(data.apogee_alt_km ?? data.perigee_alt_km)
    const inclination = Number(data.inclination_deg)

    if (!Number.isFinite(perigee) || !Number.isFinite(inclination)) {
      toast.error('Please provide orbital parameters for the new mission.')
      return
    }

    if (!data.start_time || !data.end_time) {
      toast.error('Please provide a launch window.')
      return
    }

    setIsRecommending(true)
    setRecommendationError(null)

    try {
      const feasibilityPayload = buildFeasibilityPayload(data, undefined, 'new', windowMinutes)
      let feasibilityAssessment = null

      try {
        feasibilityAssessment = await assessLaunchFeasibility(feasibilityPayload)
        setSafetyReport(feasibilityAssessment)
      } catch (error) {
        console.error('Launch feasibility assessment failed', error)
        toast.error('Launch feasibility assessment failed')
      }

      const riskAnalysis = await runConflictAnalysis(
        {
          launch_vehicle: data.launch_vehicle_name || 'OrbitalOS Launcher',
          launch_time: new Date(data.start_time).toISOString(),
          desired_altitude_km: perigee,
          desired_inclination_deg: inclination,
          launch_site_lat_deg: data.launch_site_lat_deg ? Number(data.launch_site_lat_deg) : null,
          launch_site_lon_deg: data.launch_site_lon_deg ? Number(data.launch_site_lon_deg) : null,
          payload_mass_kg: data.payload_mass_kg ? Number(data.payload_mass_kg) : undefined,
          window_minutes: windowMinutes ?? undefined
        },
        'new',
        { silentToast: true }
      )

      const effectiveApogee = Number.isFinite(apogee) ? apogee : perigee
      const meanAltitude = (perigee + effectiveApogee) / 2
      const earthRadiusKm = 6378.137
      const mu = 398600.4418
      const semiMajorAxis = earthRadiusKm + meanAltitude
      const orbitalPeriodSeconds = semiMajorAxis > 0
        ? 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / mu)
        : null
      const orbitalPeriodMinutes = orbitalPeriodSeconds ? orbitalPeriodSeconds / 60 : null
      const circularVelocity = semiMajorAxis > 0 ? Math.sqrt(mu / semiMajorAxis) : null

      setOrbitRecommendation({
        orbit: {
          perigee_km: Number(perigee.toFixed(2)),
          apogee_km: Number(effectiveApogee.toFixed(2)),
          mean_altitude_km: Number(meanAltitude.toFixed(2)),
          inclination_deg: Number(inclination.toFixed(2)),
          raan_deg: Number((Number(data.raan_deg) || 0).toFixed(2)),
          arg_perigee_deg: Number((Number(data.arg_perigee_deg) || 0).toFixed(2)),
          mean_anomaly_deg: Number((Number(data.mean_anomaly_deg) || 0).toFixed(2)),
          orbital_period_min: orbitalPeriodMinutes ? Number(orbitalPeriodMinutes.toFixed(2)) : null,
          circular_velocity_km_s: circularVelocity ? Number(circularVelocity.toFixed(3)) : null
        },
        feasibility: feasibilityAssessment || null,
        risk: riskAnalysis || null
      })

      toast.success('Orbit recommendation generated')
    } catch (error) {
      console.error('Mission planning failed:', error)
      setRecommendationError('Unable to generate orbit recommendation. Please review your inputs and try again.')
      toast.error('Mission planning failed')
    } finally {
      setIsRecommending(false)
    }
  }

  const onSubmit = async (data) => {
    if (plannerMode === 'new') {
      await handleNewMissionPlan(data)
      return
    }

    if (plannerMode !== 'existing') {
      toast.error('Please choose whether to modify an existing mission or plan a new one.')
      return
    }

    try {
      const sat = satellites.find((s) => s.id === data.satellite_id)
      if (!sat) {
        toast.error('Please select a valid satellite')
        return
      }

      const feasibilityPayload = buildFeasibilityPayload(data, sat, plannerMode, windowMinutes)

      try {
        setFeasibilityPending(true)
        const feasibilityAssessment = await assessLaunchFeasibility(feasibilityPayload)
        setSafetyReport(feasibilityAssessment)
      } catch (error) {
        toast.error('Launch feasibility assessment failed')
      } finally {
        setFeasibilityPending(false)
      }

      const reservationRequest = {
        owner: 'OrbitalOS User',
        reservation_type: mapOperationToReservationType(data.operation_type),
        start_time: new Date(data.start_time).toISOString(),
        end_time: new Date(data.end_time).toISOString(),
        center_tle: {
          norad_id: sat.norad_id || sat.id,
          name: sat.name,
          tle_line1: sat.tle_line1 || '',
          tle_line2: sat.tle_line2 || ''
        },
        protection_radius_km: 5,
        priority_level: 'Medium',
        constraints: {
          max_conjunction_probability: 0.001,
          minimum_separation_km: 1.0,
          notification_threshold_hours: 24,
          allow_debris_tracking: true,
          coordinate_system: 'ECI'
        },
        new_launch: buildLaunchProfile(data, sat, plannerMode)
      }

      const result = await createReservation(reservationRequest)
      setSafetyReport(result?.safety ?? null)

      const reservationId = result?.reservation?.id || result?.reservation_id
      if (reservationId) {
        const conflictDetails = await checkReservationConflicts(reservationId)
        if (conflictDetails.conflicts_found > 0) {
          setConflictCheck({
            hasConflict: true,
            reason: `Found ${conflictDetails.conflicts_found} potential conflicts. Risk score: ${formatNumber(conflictDetails.total_risk_score, 2)}`
          })
        } else {
          setConflictCheck({ hasConflict: false })
        }
      }

      toast.success('Orbital reservation created successfully')
      reset()
      setOrbitRecommendation(null)
    } catch (error) {
      console.error('Reservation failed:', error)
      toast.error('Failed to create orbital reservation')
    }
  }

  const checkConflicts = async () => {
    if (!plannerMode) {
      toast.error('Please choose a mission planning mode first.')
      return
    }

    if (!watchedStartTime || !watchedEndTime) {
      toast.error('Please provide start and end times for your window.')
      return
    }

    if (plannerMode === 'existing') {
      if (!watchedSatellite || !selectedSatellite) {
        toast.error('Select a satellite to analyze its conflicts.')
        return
      }

      await runConflictAnalysis({
        launch_vehicle: selectedSatellite?.name || 'Orbital launch',
        launch_time: new Date(watchedStartTime).toISOString(),
        desired_altitude_km: selectedSatellite?.altitude ?? 550,
        desired_inclination_deg: selectedSatellite?.inclination ?? 53,
        launch_site_lat_deg: null,
        launch_site_lon_deg: null,
        payload_mass_kg: undefined,
        window_minutes: windowMinutes ?? undefined
      }, 'existing')

      return
    }

    const values = getValues()
    const perigee = Number(values.perigee_alt_km)
    const inclination = Number(values.inclination_deg)

    if (!Number.isFinite(perigee) || !Number.isFinite(inclination)) {
      toast.error('Provide orbital parameters to run the risk analysis.')
      return
    }

    await runConflictAnalysis({
      launch_vehicle: values.launch_vehicle_name || 'OrbitalOS Launcher',
      launch_time: new Date(watchedStartTime).toISOString(),
      desired_altitude_km: perigee,
      desired_inclination_deg: inclination,
      launch_site_lat_deg: values.launch_site_lat_deg ? Number(values.launch_site_lat_deg) : null,
      launch_site_lon_deg: values.launch_site_lon_deg ? Number(values.launch_site_lon_deg) : null,
      payload_mass_kg: values.payload_mass_kg ? Number(values.payload_mass_kg) : undefined,
      window_minutes: windowMinutes ?? undefined
    }, 'new')
  }

  return (
    <div className="min-h-screen bg-gray-900">
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
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <h2 className="text-lg font-semibold text-white mb-6">Operation Details</h2>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div>
                  <label className="label">Mission Planning Mode</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label
                      className={`cursor-pointer rounded-xl border px-4 py-3 transition-colors ${
                        plannerMode === 'existing'
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-white/10 hover:border-blue-400/60'
                      }`}
                    >
                      <input
                        type="radio"
                        value="existing"
                        className="sr-only"
                        {...register('planner_mode', { required: 'Select a mission planning mode' })}
                      />
                      <div>
                        <p className="font-semibold text-white">Modify Existing Mission</p>
                        <p className="text-sm text-gray-300">
                          Select an on-orbit asset to tweak timelines, windows, and maneuvers.
                        </p>
                      </div>
                    </label>
                    <label
                      className={`cursor-pointer rounded-xl border px-4 py-3 transition-colors ${
                        plannerMode === 'new'
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-white/10 hover:border-purple-400/60'
                      }`}
                    >
                      <input
                        type="radio"
                        value="new"
                        className="sr-only"
                        {...register('planner_mode', { required: 'Select a mission planning mode' })}
                      />
                      <div>
                        <p className="font-semibold text-white">Plan a New Mission</p>
                        <p className="text-sm text-gray-300">
                          Provide orbital targets and let SGP4 recommend a safe corridor.
                        </p>
                      </div>
                    </label>
                  </div>
                  {errors.planner_mode && (
                    <p className="text-red-400 text-sm mt-2">{errors.planner_mode.message}</p>
                  )}
                </div>

                {plannerMode !== 'new' ? (
                  <div>
                    <label className="label">Select Satellite</label>
                    <select
                      disabled={plannerMode !== 'existing'}
                      {...register('satellite_id', {
                        ...(plannerMode === 'existing'
                          ? { required: 'Please select a satellite' }
                          : {})
                      })}
                      className="input disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed"
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
                ) : (
                  <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-4 text-sm text-gray-300">
                    Define your target orbit below to generate recommendations for a brand-new mission profile.
                  </div>
                )}

                <div>
                  <label className="label">Operation Type</label>
                  <select
                    disabled={plannerMode === 'new'}
                    {...register('operation_type', {
                      ...(plannerMode === 'existing'
                        ? { required: 'Please select operation type' }
                        : {})
                    })}
                    className="input disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed"
                  >
                    <option value="">Select operation...</option>
                    <option value="orbit_shift">Orbit Shift</option>
                    <option value="payload_activation">Payload Activation</option>
                    <option value="launch_window">Launch Window</option>
                    <option value="maneuver">Maneuver</option>
                  </select>
                  {plannerMode === 'new' && (
                    <p className="mt-1 text-xs text-gray-400">
                      New mission planning defaults to the Launch Window workflow.
                    </p>
                  )}
                  {errors.operation_type && plannerMode !== 'new' && (
                    <p className="text-red-400 text-sm mt-1">{errors.operation_type.message}</p>
                  )}
                </div>

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

                {plannerMode === 'new' && (
                  <div className="space-y-4 rounded-xl border border-purple-500/40 bg-purple-900/10 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-purple-200">
                        New Mission Orbital Targets
                      </h3>
                      <span className="text-xs text-purple-200/80">Powered by SGP4 propagation</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="label">Launch Vehicle</label>
                        <input
                          type="text"
                          placeholder="e.g., Orbital Lifter III"
                          {...register('launch_vehicle_name', {
                            ...(plannerMode === 'new'
                              ? { required: 'Launch vehicle name is required' }
                              : {})
                          })}
                          className="input"
                        />
                        {errors.launch_vehicle_name && (
                          <p className="text-red-400 text-sm mt-1">{errors.launch_vehicle_name.message}</p>
                        )}
                      </div>
                      <div>
                        <label className="label">Payload Mass (kg)</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          {...register('payload_mass_kg', { valueAsNumber: true })}
                          className="input"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="label">Perigee Altitude (km)</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          {...register('perigee_alt_km', {
                            valueAsNumber: true,
                            ...(plannerMode === 'new'
                              ? { required: 'Perigee altitude is required' }
                              : {})
                          })}
                          className="input"
                        />
                        {errors.perigee_alt_km && (
                          <p className="text-red-400 text-sm mt-1">{errors.perigee_alt_km.message}</p>
                        )}
                      </div>
                      <div>
                        <label className="label">Apogee Altitude (km)</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          {...register('apogee_alt_km', { valueAsNumber: true })}
                          className="input"
                        />
                        <p className="mt-1 text-xs text-gray-400">Leave blank for circular orbit.</p>
                      </div>
                      <div>
                        <label className="label">Inclination (deg)</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max="180"
                          {...register('inclination_deg', {
                            valueAsNumber: true,
                            ...(plannerMode === 'new'
                              ? { required: 'Inclination is required' }
                              : {})
                          })}
                          className="input"
                        />
                        {errors.inclination_deg && (
                          <p className="text-red-400 text-sm mt-1">{errors.inclination_deg.message}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="label">RAAN (deg)</label>
                        <input
                          type="number"
                          step="any"
                          {...register('raan_deg', { valueAsNumber: true })}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label">Argument of Perigee (deg)</label>
                        <input
                          type="number"
                          step="any"
                          {...register('arg_perigee_deg', { valueAsNumber: true })}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label">Mean Anomaly (deg)</label>
                        <input
                          type="number"
                          step="any"
                          {...register('mean_anomaly_deg', { valueAsNumber: true })}
                          className="input"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="label">Launch Site Latitude (deg)</label>
                        <input
                          type="number"
                          step="any"
                          min="-90"
                          max="90"
                          {...register('launch_site_lat_deg', { valueAsNumber: true })}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label">Launch Site Longitude (deg)</label>
                        <input
                          type="number"
                          step="any"
                          min="-180"
                          max="180"
                          {...register('launch_site_lon_deg', { valueAsNumber: true })}
                          className="input"
                        />
                      </div>
                    </div>

                    <p className="text-xs text-purple-100/70">
                      Provide as much fidelity as possible to generate precise recommendations and risk insights.
                    </p>
                  </div>
                )}

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

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={checkConflicts}
                    className="btn btn-secondary"
                    disabled={!canRunAnalysis || isAnalyzing}
                  >
                    {isAnalyzing
                      ? 'Analyzing…'
                      : plannerMode === 'new'
                        ? 'Run SGP4 Analysis'
                        : 'Check for Conflicts'}
                  </button>

                  <button
                    type="submit"
                    disabled={
                      plannerMode === 'new'
                        ? isRecommending || !hasNewOrbitInputs
                        : isLoading || feasibilityPending
                    }
                    className="btn btn-primary"
                  >
                    {plannerMode === 'new'
                      ? (isRecommending ? 'Generating…' : 'Generate Recommendation')
                      : feasibilityPending
                        ? 'Assessing…'
                        : isLoading
                          ? 'Submitting...'
                          : 'Submit Request'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>

          <div className="space-y-6">
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
                    <span className="text-xs uppercase tracking-wide text-gray-400">
                      {conflictCheck.context === 'new' ? 'New mission analysis' : 'Existing mission asset'}
                    </span>
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
                    {formatTimestamp(conflictCheck.analysis?.requested_window_start)}
                    {' — '}
                    {formatTimestamp(conflictCheck.analysis?.requested_window_end)}
                  </div>
                  <div>
                    <span className="font-medium text-white">Recommended window:</span>
                    <br />
                    {formatTimestamp(conflictCheck.analysis?.recommended_window_start)}
                    {' — '}
                    {formatTimestamp(conflictCheck.analysis?.recommended_window_end)}
                  </div>
                  {conflictCheck.analysis?.suggested_orbit && (
                    <div>
                      <span className="font-medium text-white">Suggested orbit:</span>
                      <br />
                      {formatNumber(conflictCheck.analysis.suggested_orbit.altitude_km, 1)} km @{' '}
                      {formatNumber(conflictCheck.analysis.suggested_orbit.inclination_deg, 2)}°
                      {conflictCheck.analysis.suggested_orbit.notes && (
                        <p className="text-xs text-gray-400 mt-1">
                          {conflictCheck.analysis.suggested_orbit.notes}
                        </p>
                      )}
                    </div>
                  )}

                  {(conflictCheck.analysis?.conflicts?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <span className="font-medium text-white">
                        Conflicts ({conflictCheck.analysis?.conflicts?.length ?? 0}):
                      </span>
                      <div className="space-y-2">
                        {conflictCheck.analysis?.conflicts?.slice(0, 3).map((conflict) => (
                          <div
                            key={`${conflict.norad_id}-${conflict.time_utc}`}
                            className="rounded-lg border border-white/10 bg-black/40 p-3"
                          >
                            <div className="flex items-center justify-between text-xs text-gray-300">
                              <span>{conflict.name}</span>
                              <span>{formatNumber(conflict.miss_distance_km, 2)} km miss</span>
                            </div>
                            <div className="mt-1 text-[11px] text-gray-400">
                              {formatTimestamp(conflict.time_utc)} · {formatNumber(conflict.relative_speed_km_s, 2)} km/s
                            </div>
                          </div>
                        ))}
                        {(conflictCheck.analysis?.conflicts?.length ?? 0) > 3 && (
                          <p className="text-xs text-gray-500">
                            +{(conflictCheck.analysis?.conflicts?.length ?? 0) - 3} additional conflicts
                          </p>
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

            {recommendationError && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                {recommendationError}
              </div>
            )}

            {orbitRecommendation && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card border border-purple-500/40 bg-purple-900/10"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">Orbit Recommendation</h3>
                  <span className="text-xs uppercase tracking-wide text-purple-200">Generated via SGP4</span>
                </div>

                <div className="mt-4 space-y-3 text-sm text-gray-200">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                      <span className="text-gray-400 block text-[11px] uppercase tracking-wide">Perigee</span>
                      <span className="text-sm font-semibold text-white">
                        {formatNumber(orbitRecommendation.orbit.perigee_km, 2)} km
                      </span>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                      <span className="text-gray-400 block text-[11px] uppercase tracking-wide">Apogee</span>
                      <span className="text-sm font-semibold text-white">
                        {formatNumber(orbitRecommendation.orbit.apogee_km, 2)} km
                      </span>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                      <span className="text-gray-400 block text-[11px] uppercase tracking-wide">Inclination</span>
                      <span className="text-sm font-semibold text-white">
                        {formatNumber(orbitRecommendation.orbit.inclination_deg, 2)}°
                      </span>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                      <span className="text-gray-400 block text-[11px] uppercase tracking-wide">Mean Altitude</span>
                      <span className="text-sm font-semibold text-white">
                        {formatNumber(orbitRecommendation.orbit.mean_altitude_km, 2)} km
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-gray-400 block text-[11px] uppercase tracking-wide">
                        Orbital Period
                      </span>
                      <span className="text-sm font-semibold text-white">
                        {orbitRecommendation.orbit.orbital_period_min != null
                          ? `${formatNumber(orbitRecommendation.orbit.orbital_period_min, 2)} min`
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[11px] uppercase tracking-wide">
                        Circular Velocity
                      </span>
                      <span className="text-sm font-semibold text-white">
                        {orbitRecommendation.orbit.circular_velocity_km_s != null
                          ? `${formatNumber(orbitRecommendation.orbit.circular_velocity_km_s, 3)} km/s`
                          : '—'}
                      </span>
                    </div>
                  </div>

                  {orbitRecommendation.risk && (
                    <div className="space-y-1 text-xs text-gray-300">
                      <span className="font-medium text-white">Suggested launch window:</span>
                      <div>
                        {formatTimestamp(orbitRecommendation.risk.recommended_window_start)} {' — '}
                        {formatTimestamp(orbitRecommendation.risk.recommended_window_end)}
                      </div>
                      {orbitRecommendation.risk.conflicts?.length > 0 && (
                        <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                          <span className="font-medium text-white block mb-2">
                            Closest approaches ({orbitRecommendation.risk.conflicts.length})
                          </span>
                          <div className="space-y-1">
                            {orbitRecommendation.risk.conflicts.slice(0, 2).map((conflict) => (
                              <div key={`${conflict.norad_id}-${conflict.time_utc}`} className="flex justify-between text-[11px] text-gray-300">
                                <span>{conflict.name}</span>
                                <span>{conflict.miss_distance_km.toFixed(2)} km</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {orbitRecommendation.feasibility && (
                    <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-gray-300">
                      <span className="font-semibold text-white block mb-1">Feasibility Snapshot</span>
                      <div>Conflicts: {orbitRecommendation.feasibility.summary?.conflicts_found ?? 0}</div>
                      <div>
                        Peak Risk Score:{' '}
                        {(orbitRecommendation.feasibility.summary?.total_risk_score ?? 0).toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

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
