use crate::conjunction::ConjunctionAnalyzer;
use crate::ml::RiskModel;
use crate::tle::{Result, SatApiError, SatelliteData};
use chrono::{DateTime, Datelike, Duration, Timelike, Utc};
use nalgebra::Vector3;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::f64::consts::PI;
use std::sync::{Arc, RwLock};
use uuid::Uuid;

const EARTH_RADIUS_KM: f64 = 6378.137;
const MU_KM3_S2: f64 = 398_600.4418;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrbitReservation {
    pub id: Uuid,
    pub owner: String,
    pub reservation_type: ReservationType,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub center_tle: SatelliteData,
    pub protection_radius_km: f64,
    pub priority_level: PriorityLevel,
    pub status: ReservationStatus,
    pub created_at: DateTime<Utc>,
    pub constraints: ReservationConstraints,
    pub launch_profile: Option<LaunchProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ReservationType {
    LaunchCorridor,  // For launch vehicles
    OperationalSlot, // For operational satellites
    DeorbitPath,     // For controlled deorbits
    MaintenanceBBox, // For satellite servicing operations
    SafetyZone,      // General safety exclusion zone
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PriorityLevel {
    Critical, // Emergency/safety operations
    High,     // Important commercial/government
    Medium,   // Standard commercial
    Low,      // Research/experimental
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ReservationStatus {
    Pending,
    Active,
    Expired,
    Cancelled,
    Violated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReservationConstraints {
    pub max_conjunction_probability: f64,
    pub minimum_separation_km: f64,
    pub notification_threshold_hours: u64,
    pub allow_debris_tracking: bool,
    pub coordinate_system: CoordinateSystem,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CoordinateSystem {
    ECI,  // Earth-Centered Inertial
    ECEF, // Earth-Centered Earth-Fixed
    RTN,  // Radial-Tangential-Normal
}

#[derive(Debug, Clone, Serialize)]
pub struct ReservationConflict {
    pub conflict_id: Uuid,
    pub reservation_id: Uuid,
    pub conflicting_satellite: ConflictingSatellite,
    pub conflict_type: ConflictType,
    pub severity: ConflictSeverity,
    pub time_of_closest_approach: DateTime<Utc>,
    pub minimum_distance_km: f64,
    pub collision_probability: f64,
    pub analytical_probability: f64,
    pub ml_probability: f64,
    pub duration_seconds: u64,
    pub mitigation_suggestions: Vec<MitigationSuggestion>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConflictingSatellite {
    pub norad_id: u64,
    pub name: String,
    pub operator: String,
    pub object_type: ObjectType,
    pub trajectory_uncertainty_km: f64,
}

#[derive(Debug, Clone, Serialize)]
pub enum ConflictType {
    DirectCollision,         // Objects on collision course
    CloseApproach,           // Within safety threshold
    OperationalInterference, // Radio frequency/optical interference
    DebrisRisk,              // Debris cloud intersection
}

#[derive(Debug, Clone, Serialize, PartialEq, PartialOrd)]
pub enum ConflictSeverity {
    Low,      // Distance > 10km, Pc < 1e-6
    Medium,   // Distance 1-10km, Pc 1e-6 to 1e-4
    High,     // Distance 0.1-1km, Pc 1e-4 to 1e-2
    Critical, // Distance < 0.1km, Pc > 1e-2
}

#[derive(Debug, Clone, Serialize)]
pub enum ObjectType {
    ActiveSatellite,
    InactiveSatellite,
    DebrisLarge, // > 10cm
    DebrisSmall, // 1-10cm
    RocketBody,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct MitigationSuggestion {
    pub suggestion_type: MitigationType,
    pub description: String,
    pub delta_v_cost_m_s: Option<f64>,
    pub time_window_start: DateTime<Utc>,
    pub time_window_end: DateTime<Utc>,
    pub success_probability: f64,
}

#[derive(Debug, Clone, Serialize)]
pub enum MitigationType {
    ManeuverAvoidance,    // Satellite performs avoidance maneuver
    TimeShift,            // Delay/advance the operation
    PathAdjustment,       // Modify trajectory slightly
    CoordinatedOperation, // Coordinate with other operators
    WaitAndWatch,         // Monitor and reassess
    Abort,                // Cancel the operation
}

#[derive(Debug, Deserialize)]
pub struct CreateReservationRequest {
    pub owner: String,
    pub reservation_type: ReservationType,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub center_tle: Option<SatelliteData>,
    pub new_launch: Option<NewLaunchRequest>,
    pub protection_radius_km: f64,
    pub priority_level: PriorityLevel,
    pub constraints: Option<ReservationConstraints>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewLaunchRequest {
    pub vehicle_name: String,
    pub epoch: DateTime<Utc>,
    pub perigee_alt_km: f64,
    pub apogee_alt_km: f64,
    pub inclination_deg: f64,
    pub raan_deg: f64,
    pub arg_perigee_deg: f64,
    pub mean_anomaly_deg: f64,
    #[serde(default)]
    pub proposed_norad_id: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchProfile {
    pub vehicle_name: String,
    pub epoch: DateTime<Utc>,
    pub perigee_alt_km: f64,
    pub apogee_alt_km: f64,
    pub inclination_deg: f64,
    pub raan_deg: f64,
    pub arg_perigee_deg: f64,
    pub mean_anomaly_deg: f64,
    pub eccentricity: f64,
    pub mean_motion_rev_per_day: f64,
    pub assigned_norad_id: u64,
}

#[derive(Debug, Deserialize)]
pub struct LaunchFeasibilityRequest {
    pub customer: String,
    pub mission_name: String,
    pub launch: NewLaunchRequest,
    #[serde(default)]
    pub window_hours: Option<u64>,
    #[serde(default)]
    pub protection_radius_km: Option<f64>,
    #[serde(default)]
    pub max_conjunction_probability: Option<f64>,
    #[serde(default)]
    pub priority_level: Option<PriorityLevel>,
    #[serde(default)]
    pub rideshare: Option<bool>,
    #[serde(default)]
    pub constraints: Option<ReservationConstraints>,
}

#[derive(Debug, Serialize)]
pub struct LaunchFeasibilitySummary {
    pub conflicts_found: usize,
    pub highest_severity: ConflictSeverity,
    pub total_risk_score: f64,
    pub minimum_distance_km: Option<f64>,
    pub max_collision_probability: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct LaunchFeasibilityResult {
    pub safe_to_launch: bool,
    pub customer: String,
    pub mission_name: String,
    pub reservation_preview: OrbitReservation,
    pub launch_profile: LaunchProfile,
    pub assessment: ReservationCheckResponse,
    pub summary: LaunchFeasibilitySummary,
}

#[derive(Debug, Serialize)]
pub struct ReservationCheckResponse {
    pub reservation_id: Uuid,
    pub check_timestamp: DateTime<Utc>,
    pub conflicts_found: usize,
    pub highest_severity: ConflictSeverity,
    pub total_risk_score: f64,
    pub conflicts: Vec<ReservationConflict>,
    pub recommendations: Vec<String>,
}

pub struct OrbitReservationManager {
    reservations: HashMap<Uuid, OrbitReservation>,
    conjunction_analyzer: ConjunctionAnalyzer,
    conflict_history: Vec<ReservationConflict>,
    risk_model: Arc<RwLock<RiskModel>>,
}

impl OrbitReservationManager {
    pub fn new(risk_model: Arc<RwLock<RiskModel>>) -> Self {
        Self {
            reservations: HashMap::new(),
            conjunction_analyzer: ConjunctionAnalyzer::new(),
            conflict_history: Vec::new(),
            risk_model,
        }
    }

    fn resolve_center_satellite(
        request: &CreateReservationRequest,
    ) -> std::result::Result<(SatelliteData, Option<LaunchProfile>), String> {
        if let Some(tle) = request.center_tle.clone() {
            return Ok((tle, None));
        }

        if let Some(new_launch) = &request.new_launch {
            let (sat, profile) = Self::build_launch_satellite(new_launch)?;
            return Ok((sat, Some(profile)));
        }

        Err("Reservation requires either an existing TLE or a new_launch specification".to_string())
    }

    fn build_launch_satellite(
        launch: &NewLaunchRequest,
    ) -> std::result::Result<(SatelliteData, LaunchProfile), String> {
        if launch.apogee_alt_km < launch.perigee_alt_km {
            return Err(
                "apogee_alt_km must be greater than or equal to perigee_alt_km".to_string(),
            );
        }

        let perigee_radius = EARTH_RADIUS_KM + launch.perigee_alt_km;
        let apogee_radius = EARTH_RADIUS_KM + launch.apogee_alt_km;
        let semi_major_axis = (perigee_radius + apogee_radius) / 2.0;
        let eccentricity = ((apogee_radius - perigee_radius) / (apogee_radius + perigee_radius))
            .abs()
            .min(0.99);

        let mean_motion_rad_s = (MU_KM3_S2 / semi_major_axis.powi(3)).sqrt();
        let mean_motion_rev_per_day = mean_motion_rad_s * 86400.0 / (2.0 * PI);

        let norad_id = launch.proposed_norad_id.unwrap_or_else(|| {
            let timestamp = Utc::now().timestamp().abs() as u64;
            900_000 + (timestamp % 100_000)
        });

        let epoch_field = Self::format_epoch(&launch.epoch);
        let ecc_scaled = ((eccentricity * 1e7).round() as i64).abs();
        let ecc_field = format!("{:07}", ecc_scaled);

        let line1 = format!(
            "1 {:05}U {:>8} {:>14}  .00000000  00000-0  00000-0 0  9991",
            norad_id, "NX0000A", epoch_field
        );

        let line2 = format!(
            "2 {:05} {:8.4} {:8.4} {:7} {:8.4} {:8.4} {:11.8}",
            norad_id,
            launch.inclination_deg,
            launch.raan_deg,
            ecc_field,
            launch.arg_perigee_deg,
            launch.mean_anomaly_deg,
            mean_motion_rev_per_day,
        );

        let satellite = SatelliteData {
            norad_id,
            name: launch.vehicle_name.clone(),
            tle_line1: line1,
            tle_line2: line2,
            last_updated: launch.epoch,
        };

        let profile = LaunchProfile {
            vehicle_name: launch.vehicle_name.clone(),
            epoch: launch.epoch,
            perigee_alt_km: launch.perigee_alt_km,
            apogee_alt_km: launch.apogee_alt_km,
            inclination_deg: launch.inclination_deg,
            raan_deg: launch.raan_deg,
            arg_perigee_deg: launch.arg_perigee_deg,
            mean_anomaly_deg: launch.mean_anomaly_deg,
            eccentricity,
            mean_motion_rev_per_day,
            assigned_norad_id: norad_id,
        };

        Ok((satellite, profile))
    }

    fn format_epoch(epoch: &DateTime<Utc>) -> String {
        let year = (epoch.year() % 100) as u32;
        let day_of_year = epoch.ordinal();
        let seconds = epoch.num_seconds_from_midnight() as f64
            + (epoch.nanosecond() as f64 / 1_000_000_000.0);
        let fractional_day = (seconds / 86400.0).clamp(0.0, 0.99999999);
        let fractional_scaled = (fractional_day * 1e8).round() as u64;

        format!("{:02}{:03}.{:08}", year, day_of_year, fractional_scaled)
    }

    pub fn create_reservation(
        &mut self,
        request: CreateReservationRequest,
    ) -> Result<OrbitReservation> {
        let reservation_id = Uuid::new_v4();

        let (center_tle, launch_profile) = Self::resolve_center_satellite(&request)
            .map_err(|err| SatApiError::TleParseError(err))?;

        let constraints = request
            .constraints
            .unwrap_or_else(|| ReservationConstraints {
                max_conjunction_probability: match request.priority_level {
                    PriorityLevel::Critical => 1e-6,
                    PriorityLevel::High => 1e-5,
                    PriorityLevel::Medium => 1e-4,
                    PriorityLevel::Low => 1e-3,
                },
                minimum_separation_km: request.protection_radius_km,
                notification_threshold_hours: 24,
                allow_debris_tracking: true,
                coordinate_system: CoordinateSystem::ECI,
            });

        let reservation = OrbitReservation {
            id: reservation_id,
            owner: request.owner,
            reservation_type: request.reservation_type,
            start_time: request.start_time,
            end_time: request.end_time,
            center_tle,
            protection_radius_km: request.protection_radius_km,
            priority_level: request.priority_level,
            status: ReservationStatus::Pending,
            created_at: Utc::now(),
            constraints,
            launch_profile,
        };

        self.reservations
            .insert(reservation_id, reservation.clone());

        tracing::info!(
            "Created reservation {} for owner {}",
            reservation_id,
            reservation.owner
        );

        Ok(reservation)
    }

    pub fn check_reservation_conflicts(
        &mut self,
        reservation_id: Uuid,
        catalog_satellites: &[SatelliteData],
    ) -> Result<ReservationCheckResponse> {
        let reservation = self
            .reservations
            .get(&reservation_id)
            .cloned()
            .ok_or_else(|| SatApiError::SatelliteNotFound(reservation_id.as_u128() as u64))?;

        self.evaluate_conflicts_internal(&reservation, catalog_satellites, true)
    }

    fn evaluate_conflicts_internal(
        &mut self,
        reservation: &OrbitReservation,
        catalog_satellites: &[SatelliteData],
        record_history: bool,
    ) -> Result<ReservationCheckResponse> {
        tracing::info!(
            "Evaluating conflicts for reservation {} against {} satellites",
            reservation.id,
            catalog_satellites.len()
        );

        let mut conflicts = Vec::new();
        let mut total_risk_score = 0.0;
        let mut highest_severity = ConflictSeverity::Low;

        for satellite in catalog_satellites {
            if let Some(conflict) = self.check_satellite_conflict(reservation, satellite)? {
                if conflict.severity > highest_severity {
                    highest_severity = conflict.severity.clone();
                }
                total_risk_score += conflict.collision_probability;
                conflicts.push(conflict);
            }
        }

        for (other_id, other_reservation) in &self.reservations {
            if *other_id != reservation.id {
                if let Some(conflict) =
                    self.check_reservation_overlap(reservation, other_reservation)?
                {
                    conflicts.push(conflict);
                }
            }
        }

        let recommendations = self.generate_recommendations(&conflicts, reservation);

        if record_history {
            for conflict in &conflicts {
                self.conflict_history.push(conflict.clone());
            }
        }

        Ok(ReservationCheckResponse {
            reservation_id: reservation.id,
            check_timestamp: Utc::now(),
            conflicts_found: conflicts.len(),
            highest_severity,
            total_risk_score,
            conflicts,
            recommendations,
        })
    }

    pub fn evaluate_launch_feasibility(
        &mut self,
        request: LaunchFeasibilityRequest,
        catalog_satellites: &[SatelliteData],
    ) -> Result<LaunchFeasibilityResult> {
        let (center_tle, launch_profile) = Self::build_launch_satellite(&request.launch)
            .map_err(|err| SatApiError::TleParseError(err))?;

        let window_hours = request.window_hours.unwrap_or(6).clamp(1, 72);
        let start_time = request.launch.epoch;
        let end_time = start_time + Duration::hours(window_hours as i64);

        let rideshare = request.rideshare.unwrap_or(false);
        let protection_radius =
            request
                .protection_radius_km
                .unwrap_or_else(|| if rideshare { 5.0 } else { 25.0 });

        let probability_cap = request
            .max_conjunction_probability
            .unwrap_or_else(|| if rideshare { 1e-4 } else { 5e-5 })
            .clamp(1e-8, 1.0);

        let priority = request.priority_level.unwrap_or_else(|| {
            if rideshare {
                PriorityLevel::High
            } else {
                PriorityLevel::Medium
            }
        });

        let constraints = request
            .constraints
            .unwrap_or_else(|| ReservationConstraints {
                max_conjunction_probability: probability_cap,
                minimum_separation_km: protection_radius,
                notification_threshold_hours: 12,
                allow_debris_tracking: true,
                coordinate_system: CoordinateSystem::ECI,
            });

        let reservation = OrbitReservation {
            id: Uuid::new_v4(),
            owner: request.customer.clone(),
            reservation_type: if rideshare {
                ReservationType::OperationalSlot
            } else {
                ReservationType::LaunchCorridor
            },
            start_time,
            end_time,
            center_tle: center_tle.clone(),
            protection_radius_km: protection_radius,
            priority_level: priority,
            status: ReservationStatus::Pending,
            created_at: Utc::now(),
            constraints: constraints.clone(),
            launch_profile: Some(launch_profile.clone()),
        };

        let assessment =
            self.evaluate_conflicts_internal(&reservation, catalog_satellites, false)?;

        let (summary, safe_to_launch) =
            OrbitReservationManager::summarize_feasibility(&reservation, &assessment);

        Ok(LaunchFeasibilityResult {
            safe_to_launch,
            customer: request.customer,
            mission_name: request.mission_name,
            reservation_preview: reservation,
            launch_profile,
            assessment,
            summary,
        })
    }

    pub fn summarize_feasibility(
        reservation: &OrbitReservation,
        assessment: &ReservationCheckResponse,
    ) -> (LaunchFeasibilitySummary, bool) {
        let min_distance = if assessment.conflicts.is_empty() {
            None
        } else {
            let min_value = assessment
                .conflicts
                .iter()
                .map(|conflict| conflict.minimum_distance_km)
                .fold(f64::INFINITY, f64::min);
            if min_value.is_finite() {
                Some(min_value)
            } else {
                None
            }
        };

        let max_probability = if assessment.conflicts.is_empty() {
            None
        } else {
            let max_value = assessment
                .conflicts
                .iter()
                .map(|conflict| conflict.collision_probability)
                .fold(0.0, f64::max);
            if max_value.is_finite() {
                Some(max_value)
            } else {
                None
            }
        };

        let distance_ok = min_distance.map_or(true, |d| d >= reservation.protection_radius_km);
        let probability_ok = max_probability.map_or(true, |p| {
            p <= reservation.constraints.max_conjunction_probability
        });
        let severity_ok = assessment.highest_severity <= ConflictSeverity::Low;

        let summary = LaunchFeasibilitySummary {
            conflicts_found: assessment.conflicts_found,
            highest_severity: assessment.highest_severity.clone(),
            total_risk_score: assessment.total_risk_score,
            minimum_distance_km: min_distance,
            max_collision_probability: max_probability,
        };

        (summary, distance_ok && probability_ok && severity_ok)
    }

    fn check_satellite_conflict(
        &self,
        reservation: &OrbitReservation,
        satellite: &SatelliteData,
    ) -> Result<Option<ReservationConflict>> {
        let time_step = Duration::minutes(5);
        let mut current_time = reservation.start_time;
        let mut min_distance = f64::INFINITY;
        let mut tca = current_time;
        let mut reservation_pos_tca = Vector3::zeros();
        let mut satellite_pos_tca = Vector3::zeros();
        let mut max_probability: f64 = 0.0;

        // Sample the reservation time window
        while current_time <= reservation.end_time {
            // Propagate reservation center and satellite
            let reservation_pos = self.propagate_to_eci(&reservation.center_tle, &current_time)?;
            let satellite_pos = self.propagate_to_eci(satellite, &current_time)?;

            let distance = (reservation_pos - satellite_pos).norm();

            if distance < min_distance {
                min_distance = distance;
                tca = current_time;
                reservation_pos_tca = reservation_pos;
                satellite_pos_tca = satellite_pos;
            }

            // Estimate collision probability
            let uncertainty = self.estimate_position_uncertainty(satellite, &current_time);
            let prob = self.calculate_simple_collision_probability(distance, uncertainty, 0.01); // 10m hard body
            max_probability = max_probability.max(prob);

            current_time = current_time + time_step;
        }

        // Determine if this constitutes a conflict
        if min_distance <= reservation.protection_radius_km
            || max_probability >= reservation.constraints.max_conjunction_probability
        {
            let relative_velocity =
                self.estimate_relative_speed(&reservation.center_tle, satellite, &tca)?;

            let tle_age = self.estimate_tle_age_hours(&reservation.center_tle, satellite, &tca);
            let baseline_risk = self.estimate_baseline_risk(reservation_pos_tca, satellite_pos_tca);

            let analytical_probability = max_probability;
            let (ml_probability, fused_probability) = {
                let mut guard = self
                    .risk_model
                    .write()
                    .map_err(|_| SatApiError::TleParseError("Risk model unavailable".into()))?;

                let features = [
                    min_distance.max(0.001),
                    relative_velocity.max(0.001),
                    tle_age.max(0.0),
                    baseline_risk,
                ];

                let ml_probability = guard.predict(features);
                let label = if analytical_probability
                    >= reservation.constraints.max_conjunction_probability
                {
                    1.0
                } else {
                    0.0
                };
                guard.update(features, label);
                (ml_probability, analytical_probability.max(ml_probability))
            };

            let severity = self.classify_conflict_severity(min_distance, fused_probability);
            let conflict_type = self.classify_conflict_type(min_distance, fused_probability);

            let conflict = ReservationConflict {
                conflict_id: Uuid::new_v4(),
                reservation_id: reservation.id,
                conflicting_satellite: ConflictingSatellite {
                    norad_id: satellite.norad_id,
                    name: satellite.name.clone(),
                    operator: "Unknown".to_string(), // Would need operator database
                    object_type: ObjectType::ActiveSatellite, // Assumption
                    trajectory_uncertainty_km: self.estimate_position_uncertainty(satellite, &tca),
                },
                conflict_type,
                severity,
                time_of_closest_approach: tca,
                minimum_distance_km: min_distance,
                collision_probability: fused_probability,
                analytical_probability,
                ml_probability,
                duration_seconds: (reservation.end_time - reservation.start_time).num_seconds()
                    as u64,
                mitigation_suggestions: self.generate_mitigation_suggestions(
                    min_distance,
                    fused_probability,
                    &tca,
                    reservation,
                ),
            };

            Ok(Some(conflict))
        } else {
            Ok(None)
        }
    }

    fn check_reservation_overlap(
        &self,
        reservation: &OrbitReservation,
        other_reservation: &OrbitReservation,
    ) -> Result<Option<ReservationConflict>> {
        // Check time overlap
        if reservation.end_time < other_reservation.start_time
            || reservation.start_time > other_reservation.end_time
        {
            return Ok(None);
        }

        // Check spatial overlap during overlapping time
        let overlap_start = reservation.start_time.max(other_reservation.start_time);
        let overlap_end = reservation.end_time.min(other_reservation.end_time);

        let mid_time = overlap_start + (overlap_end - overlap_start) / 2;

        let pos_a = self.propagate_to_eci(&reservation.center_tle, &mid_time)?;
        let pos_b = self.propagate_to_eci(&other_reservation.center_tle, &mid_time)?;

        let distance = (pos_a - pos_b).norm();
        let combined_radius =
            reservation.protection_radius_km + other_reservation.protection_radius_km;

        if distance < combined_radius {
            // Priority-based conflict resolution
            let severity = if reservation.priority_level == PriorityLevel::Critical
                || other_reservation.priority_level == PriorityLevel::Critical
            {
                ConflictSeverity::High
            } else {
                ConflictSeverity::Medium
            };

            let conflict = ReservationConflict {
                conflict_id: Uuid::new_v4(),
                reservation_id: reservation.id,
                conflicting_satellite: ConflictingSatellite {
                    norad_id: other_reservation.center_tle.norad_id,
                    name: format!("Reservation: {}", other_reservation.owner),
                    operator: other_reservation.owner.clone(),
                    object_type: ObjectType::ActiveSatellite,
                    trajectory_uncertainty_km: 1.0,
                },
                conflict_type: ConflictType::OperationalInterference,
                severity,
                time_of_closest_approach: mid_time,
                minimum_distance_km: distance,
                collision_probability: 0.0,
                analytical_probability: 0.0,
                ml_probability: 0.0,
                duration_seconds: (overlap_end - overlap_start).num_seconds() as u64,
                mitigation_suggestions: vec![MitigationSuggestion {
                    suggestion_type: MitigationType::CoordinatedOperation,
                    description: "Coordinate with other reservation holder".to_string(),
                    delta_v_cost_m_s: None,
                    time_window_start: overlap_start,
                    time_window_end: overlap_end,
                    success_probability: 0.8,
                }],
            };

            Ok(Some(conflict))
        } else {
            Ok(None)
        }
    }

    // Helper methods
    fn propagate_to_eci(
        &self,
        sat_data: &SatelliteData,
        time: &DateTime<Utc>,
    ) -> Result<Vector3<f64>> {
        // Reuse the propagation logic from conjunction analyzer
        let current_time_seconds = time.timestamp() as f64;
        let line2 = &sat_data.tle_line2;
        let parts: Vec<&str> = line2.split_whitespace().collect();

        let inclination_deg = parts
            .get(2)
            .and_then(|value| value.parse::<f64>().ok())
            .or_else(|| line2.get(8..16).and_then(|s| s.trim().parse::<f64>().ok()))
            .unwrap_or(51.6);

        let mean_motion = parts
            .last()
            .and_then(|value| value.parse::<f64>().ok())
            .or_else(|| line2.get(52..63).and_then(|s| s.trim().parse::<f64>().ok()))
            .unwrap_or(15.5);

        let inclination = inclination_deg * std::f64::consts::PI / 180.0;

        let orbital_period_seconds = 86400.0 / mean_motion;
        let angular_velocity = 2.0 * std::f64::consts::PI / orbital_period_seconds;
        let orbital_angle =
            (current_time_seconds * angular_velocity) % (2.0 * std::f64::consts::PI);

        let altitude_km = 400.0 + (mean_motion - 15.0) * 20.0;
        let orbital_radius_km = 6371.0 + altitude_km;

        let x = orbital_radius_km * orbital_angle.cos();
        let y = orbital_radius_km * orbital_angle.sin() * inclination.cos();
        let z = orbital_radius_km * orbital_angle.sin() * inclination.sin();

        Ok(Vector3::new(x, y, z))
    }

    fn estimate_position_uncertainty(&self, sat_data: &SatelliteData, time: &DateTime<Utc>) -> f64 {
        let age_hours = (time.timestamp() - sat_data.last_updated.timestamp()) as f64 / 3600.0;
        let base_uncertainty = 0.1; // 100m
        let growth_rate = 0.01; // 1% per hour

        base_uncertainty * (1.0 + age_hours * growth_rate)
    }

    fn calculate_simple_collision_probability(
        &self,
        distance_km: f64,
        uncertainty_km: f64,
        hard_body_radius_km: f64,
    ) -> f64 {
        if distance_km <= hard_body_radius_km {
            return 1.0;
        }

        let collision_cross_section = std::f64::consts::PI * hard_body_radius_km.powi(2);
        let uncertainty_area = std::f64::consts::PI * uncertainty_km.powi(2);

        (collision_cross_section / uncertainty_area)
            * (-distance_km.powi(2) / (2.0 * uncertainty_km.powi(2))).exp()
    }

    fn estimate_relative_speed(
        &self,
        primary: &SatelliteData,
        secondary: &SatelliteData,
        time: &DateTime<Utc>,
    ) -> Result<f64> {
        let delta = Duration::seconds(60);
        let before = *time - delta;
        let after = *time + delta;
        let dt_seconds = (after - before).num_seconds() as f64;

        let primary_before = self.propagate_to_eci(primary, &before)?;
        let primary_after = self.propagate_to_eci(primary, &after)?;
        let secondary_before = self.propagate_to_eci(secondary, &before)?;
        let secondary_after = self.propagate_to_eci(secondary, &after)?;

        let velocity_primary = (primary_after - primary_before) * (1.0 / dt_seconds);
        let velocity_secondary = (secondary_after - secondary_before) * (1.0 / dt_seconds);

        Ok((velocity_primary - velocity_secondary).norm())
    }

    fn estimate_tle_age_hours(
        &self,
        reservation_center: &SatelliteData,
        satellite: &SatelliteData,
        time: &DateTime<Utc>,
    ) -> f64 {
        let reservation_age =
            (time.timestamp() - reservation_center.last_updated.timestamp()).abs() as f64 / 3600.0;
        let satellite_age =
            (time.timestamp() - satellite.last_updated.timestamp()).abs() as f64 / 3600.0;

        reservation_age.max(satellite_age)
    }

    fn estimate_baseline_risk(
        &self,
        reservation_pos: Vector3<f64>,
        satellite_pos: Vector3<f64>,
    ) -> f64 {
        let reservation_altitude = reservation_pos.norm().max(EARTH_RADIUS_KM) - EARTH_RADIUS_KM;
        let satellite_altitude = satellite_pos.norm().max(EARTH_RADIUS_KM) - EARTH_RADIUS_KM;
        let mean_altitude = (reservation_altitude + satellite_altitude) / 2.0;

        if mean_altitude < 400.0 {
            0.75
        } else if mean_altitude < 1200.0 {
            0.6
        } else if mean_altitude < 20000.0 {
            0.45
        } else {
            0.25
        }
    }

    fn classify_conflict_severity(&self, distance_km: f64, probability: f64) -> ConflictSeverity {
        if distance_km < 0.1 || probability > 1e-2 {
            ConflictSeverity::Critical
        } else if distance_km < 1.0 || probability > 1e-4 {
            ConflictSeverity::High
        } else if distance_km < 10.0 || probability > 1e-6 {
            ConflictSeverity::Medium
        } else {
            ConflictSeverity::Low
        }
    }

    fn classify_conflict_type(&self, distance_km: f64, probability: f64) -> ConflictType {
        if probability > 1e-3 {
            ConflictType::DirectCollision
        } else if distance_km < 5.0 {
            ConflictType::CloseApproach
        } else if distance_km < 50.0 {
            ConflictType::OperationalInterference
        } else {
            ConflictType::DebrisRisk
        }
    }

    fn generate_mitigation_suggestions(
        &self,
        _distance_km: f64,
        probability: f64,
        tca: &DateTime<Utc>,
        reservation: &OrbitReservation,
    ) -> Vec<MitigationSuggestion> {
        let mut suggestions = Vec::new();

        if probability > 1e-3 {
            suggestions.push(MitigationSuggestion {
                suggestion_type: MitigationType::ManeuverAvoidance,
                description: "Perform immediate avoidance maneuver".to_string(),
                delta_v_cost_m_s: Some(2.0), // Typical avoidance maneuver
                time_window_start: *tca - Duration::hours(2),
                time_window_end: *tca - Duration::minutes(30),
                success_probability: 0.95,
            });
        } else if probability > 1e-5 {
            suggestions.push(MitigationSuggestion {
                suggestion_type: MitigationType::TimeShift,
                description: "Delay operation by 1-2 orbits".to_string(),
                delta_v_cost_m_s: None,
                time_window_start: reservation.start_time,
                time_window_end: reservation.start_time + Duration::hours(3),
                success_probability: 0.8,
            });
        } else {
            suggestions.push(MitigationSuggestion {
                suggestion_type: MitigationType::WaitAndWatch,
                description: "Monitor conjunction and reassess".to_string(),
                delta_v_cost_m_s: None,
                time_window_start: *tca - Duration::hours(6),
                time_window_end: *tca + Duration::hours(1),
                success_probability: 0.9,
            });
        }

        suggestions
    }

    fn generate_recommendations(
        &self,
        conflicts: &[ReservationConflict],
        _reservation: &OrbitReservation,
    ) -> Vec<String> {
        let mut recommendations = Vec::new();

        if conflicts.is_empty() {
            recommendations
                .push("No conflicts detected. Reservation appears safe to proceed.".to_string());
        } else {
            let critical_conflicts = conflicts
                .iter()
                .filter(|c| c.severity == ConflictSeverity::Critical)
                .count();
            let high_conflicts = conflicts
                .iter()
                .filter(|c| c.severity == ConflictSeverity::High)
                .count();

            if critical_conflicts > 0 {
                recommendations.push(format!(
                    "CRITICAL: {} critical conflicts detected. Immediate action required.",
                    critical_conflicts
                ));
                recommendations.push(
                    "Consider aborting or significantly modifying the operation.".to_string(),
                );
            } else if high_conflicts > 0 {
                recommendations.push(format!(
                    "HIGH RISK: {} high-severity conflicts detected.",
                    high_conflicts
                ));
                recommendations.push(
                    "Review all mitigation suggestions and implement appropriate measures."
                        .to_string(),
                );
            } else {
                recommendations.push("Medium/low risk conflicts detected. Monitor closely and consider minor adjustments.".to_string());
            }

            recommendations.push(format!(
                "Total conflicts: {}. Recommend detailed review of each conflict.",
                conflicts.len()
            ));
        }

        recommendations
    }

    pub fn get_reservation(&self, reservation_id: &Uuid) -> Option<&OrbitReservation> {
        self.reservations.get(reservation_id)
    }

    pub fn list_reservations(&self) -> Vec<&OrbitReservation> {
        self.reservations.values().collect()
    }

    pub fn update_reservation_status(
        &mut self,
        reservation_id: Uuid,
        status: ReservationStatus,
    ) -> Result<()> {
        if let Some(reservation) = self.reservations.get_mut(&reservation_id) {
            reservation.status = status;
            Ok(())
        } else {
            Err(SatApiError::SatelliteNotFound(
                reservation_id.as_u128() as u64
            ))
        }
    }
}
