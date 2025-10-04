use crate::alerts::{AlertCategory, AlertHub, AlertSeverity, LiveAlert};
use crate::api::SatelliteApi;
use crate::conjunction::{ConjunctionAnalyzer, ConjunctionRequest};
use crate::ml::RiskModel;
use crate::reservation::{
    CreateReservationRequest, LaunchFeasibilityRequest, LaunchFeasibilitySummary, OrbitReservation,
    OrbitReservationManager, ReservationCheckResponse,
};
use crate::tle::{RiskLevel, SatellitePosition};
use actix_web::web::Bytes;
use actix_web::{http::header, web, HttpRequest, HttpResponse, Result as ActixResult};
use chrono::{DateTime, Utc};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use tokio_stream::wrappers::BroadcastStream;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub satellite_api: Arc<SatelliteApi>,
    pub conjunction_analyzer: Arc<Mutex<ConjunctionAnalyzer>>,
    pub reservation_manager: Arc<Mutex<OrbitReservationManager>>,
    pub alert_hub: Arc<AlertHub>,
    pub risk_model: Arc<RwLock<RiskModel>>,
}

#[derive(Deserialize)]
pub struct PaginationQuery {
    pub page: Option<usize>,
    pub limit: Option<usize>,
}

#[derive(Deserialize)]
pub struct GroupQuery {
    pub name: String,
}

#[derive(Deserialize)]
pub struct PropagationQuery {
    pub minutes: Option<i64>,
    pub limit: Option<usize>,
}

#[derive(Deserialize)]
pub struct RiskPredictionRequestPayload {
    pub satellite_ids: Vec<u64>,
    pub horizon_hours: Option<u64>,
    pub screening_distance_km: Option<f64>,
    pub probability_threshold: Option<f64>,
}

#[derive(Serialize)]
pub struct RiskPredictionSummary {
    pub max_probability: f64,
    pub average_probability: f64,
    pub by_risk_band: HashMap<String, usize>,
}

#[derive(Serialize)]
pub struct RiskPredictionConjunction {
    pub pair_id: String,
    pub satellites: [u64; 2],
    pub min_distance_km: f64,
    pub relative_velocity_km_s: f64,
    pub tle_age_hours: f64,
    pub baseline_risk_score: f64,
    pub logistic_probability: f64,
    pub raw_probability: f64,
    pub risk_level: RiskLevel,
    pub time_of_closest_approach: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct RiskPredictionResponse {
    pub generated_at: DateTime<Utc>,
    pub tenant_id: String,
    pub horizon_hours: u64,
    pub conjunctions_evaluated: usize,
    pub dangerous_conjunctions: usize,
    pub summary: RiskPredictionSummary,
    pub events: Vec<RiskPredictionConjunction>,
    pub model: crate::ml::RiskModelExplanation,
}

#[derive(Serialize)]
pub struct ReservationSafetyReport {
    pub safe_to_launch: bool,
    pub summary: LaunchFeasibilitySummary,
    pub assessment: ReservationCheckResponse,
}

#[derive(Serialize)]
pub struct CreateReservationResponse {
    pub reservation: OrbitReservation,
    pub safety: Option<ReservationSafetyReport>,
}

const DEFAULT_TENANT: &str = "default";

fn tenant_id_from_request(req: &HttpRequest) -> String {
    req.headers()
        .get("x-tenant-id")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_TENANT.to_string())
}

pub async fn get_all_satellites(
    data: web::Data<AppState>,
    query: web::Query<PaginationQuery>,
) -> ActixResult<HttpResponse> {
    match data
        .satellite_api
        .get_all_satellites(query.page, query.limit)
        .await
    {
        Ok(satellites) => Ok(HttpResponse::Ok().json(satellites)),
        Err(e) => {
            tracing::error!("Failed to get satellites: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to fetch satellite data",
                "message": e.to_string()
            })))
        }
    }
}

pub async fn get_satellite(
    data: web::Data<AppState>,
    path: web::Path<u64>,
) -> ActixResult<HttpResponse> {
    let norad_id = path.into_inner();

    match data.satellite_api.get_satellite(norad_id).await {
        Ok(satellite) => Ok(HttpResponse::Ok().json(satellite)),
        Err(e) => {
            tracing::error!("Failed to get satellite {}: {}", norad_id, e);
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Satellite not found",
                "norad_id": norad_id,
                "message": e.to_string()
            })))
        }
    }
}

pub async fn get_satellite_group(
    data: web::Data<AppState>,
    path: web::Path<String>,
) -> ActixResult<HttpResponse> {
    let group_name = path.into_inner();

    match data.satellite_api.get_satellite_group(&group_name).await {
        Ok(group) => Ok(HttpResponse::Ok().json(group)),
        Err(e) => {
            tracing::error!("Failed to get satellite group {}: {}", group_name, e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to fetch satellite group",
                "group": group_name,
                "message": e.to_string()
            })))
        }
    }
}

pub async fn get_statistics(data: web::Data<AppState>) -> ActixResult<HttpResponse> {
    match data.satellite_api.get_statistics().await {
        Ok(stats) => Ok(HttpResponse::Ok().json(stats)),
        Err(e) => {
            tracing::error!("Failed to get statistics: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to fetch statistics",
                "message": e.to_string()
            })))
        }
    }
}

pub async fn propagate_satellites(
    data: web::Data<AppState>,
    query: web::Query<PropagationQuery>,
) -> ActixResult<HttpResponse> {
    let minutes = query.minutes.unwrap_or(0);
    let limit = query.limit;

    match data
        .satellite_api
        .get_all_satellites_with_offset(minutes, limit)
        .await
    {
        Ok(satellites) => Ok(HttpResponse::Ok().json(satellites)),
        Err(e) => {
            tracing::error!("Failed to propagate satellites: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to propagate satellites",
                "message": e.to_string()
            })))
        }
    }
}

pub async fn health_check() -> ActixResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "Satellite API with AI Conjunction Analysis",
        "version": "2.0.0",
        "features": ["conjunction_analysis", "orbit_reservation", "real_time_tracking"],
        "timestamp": chrono::Utc::now()
    })))
}

// Conjunction Analysis Endpoints
pub async fn analyze_conjunctions(
    data: web::Data<AppState>,
    request: web::Json<ConjunctionRequest>,
) -> ActixResult<HttpResponse> {
    tracing::info!(
        "Conjunction analysis requested for {} satellites",
        request.satellite_ids.len()
    );

    // Get satellite data from the API
    let satellites_result = if request.satellite_ids.is_empty() {
        data.satellite_api.get_all_satellites(None, None).await
    } else {
        // Get specific satellites by ID
        let mut satellites = Vec::new();
        for sat_id in &request.satellite_ids {
            match data.satellite_api.get_satellite(*sat_id).await {
                Ok(sat_pos) => {
                    // Convert SatellitePosition back to SatelliteData (simplified)
                    let sat_data = crate::tle::SatelliteData {
                        norad_id: sat_pos.norad_id,
                        name: sat_pos.name,
                        tle_line1: format!(
                            "1 {:05}U          23001.00000000  .00000000  00000-0  00000-0 0  9999",
                            sat_pos.norad_id
                        ),
                        tle_line2: format!(
                            "2 {:05}  51.6000   0.0000 0000000   0.0000   0.0000 15.50000000000000",
                            sat_pos.norad_id
                        ),
                        last_updated: sat_pos.timestamp,
                    };
                    satellites.push(sat_data);
                }
                Err(e) => {
                    tracing::warn!("Could not find satellite {}: {}", sat_id, e);
                }
            }
        }
        Ok(satellites
            .into_iter()
            .map(|sat| crate::tle::SatellitePosition {
                norad_id: sat.norad_id,
                name: sat.name.clone(),
                lat_deg: 0.0,
                lon_deg: 0.0,
                alt_km: 400.0,
                velocity_km_s: 7.66,
                timestamp: sat.last_updated,
                risk_score: 0.0,
                risk_level: crate::tle::RiskLevel::Green,
                risk_reason: "Synthetic conjunction staging position".to_string(),
            })
            .collect())
    };

    match satellites_result {
        Ok(sat_positions) => {
            // Convert positions to satellite data for analysis
            let satellite_data: Vec<crate::tle::SatelliteData> = sat_positions
                .into_iter()
                .map(|pos| crate::tle::SatelliteData {
                    norad_id: pos.norad_id,
                    name: pos.name,
                    tle_line1: format!(
                        "1 {:05}U          23001.00000000  .00000000  00000-0  00000-0 0  9999",
                        pos.norad_id
                    ),
                    tle_line2: format!(
                        "2 {:05}  51.6000   0.0000 0000000   0.0000   0.0000 15.50000000000000",
                        pos.norad_id
                    ),
                    last_updated: pos.timestamp,
                })
                .collect();

            // Perform conjunction analysis
            match data.conjunction_analyzer.lock() {
                Ok(analyzer) => match analyzer.analyze_conjunctions(&satellite_data, &request) {
                    Ok(analysis) => {
                        tracing::info!(
                            "Conjunction analysis completed: {} conjunctions found",
                            analysis.conjunctions_found
                        );
                        Ok(HttpResponse::Ok().json(analysis))
                    }
                    Err(e) => {
                        tracing::error!("Conjunction analysis failed: {}", e);
                        Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                            "error": "Conjunction analysis failed",
                            "message": e.to_string()
                        })))
                    }
                },
                Err(e) => {
                    tracing::error!("Failed to acquire conjunction analyzer lock: {}", e);
                    Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": "Service temporarily unavailable",
                        "message": "Could not access conjunction analyzer"
                    })))
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to get satellite data: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to retrieve satellite data",
                "message": e.to_string()
            })))
        }
    }
}

pub async fn predict_risk(
    data: web::Data<AppState>,
    req: HttpRequest,
    payload: web::Json<RiskPredictionRequestPayload>,
) -> ActixResult<HttpResponse> {
    let tenant_id = tenant_id_from_request(&req);
    let horizon_hours = payload.horizon_hours.unwrap_or(24).clamp(1, 168);
    let screening_distance_km = payload.screening_distance_km.unwrap_or(100.0);
    let probability_threshold = payload
        .probability_threshold
        .unwrap_or(1e-4)
        .clamp(1e-8, 1.0);

    let catalog = match data.satellite_api.get_all_satellites(None, None).await {
        Ok(list) => list,
        Err(e) => {
            tracing::error!("Failed to load catalog for risk analysis: {}", e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "catalog_load_failed",
                "message": e.to_string()
            })));
        }
    };

    let satellite_data_catalog = catalog_to_satellite_data(&catalog);

    let mut baseline_map: HashMap<u64, SatellitePosition> = HashMap::new();
    for sat in &catalog {
        baseline_map.insert(sat.norad_id, sat.clone());
    }

    let analyzer_guard = match data.conjunction_analyzer.lock() {
        Ok(guard) => guard,
        Err(e) => {
            tracing::error!("Failed to acquire conjunction analyzer: {}", e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "analyzer_unavailable",
                "message": "Conjunction analyzer is busy"
            })));
        }
    };

    let request = ConjunctionRequest {
        satellite_ids: payload.satellite_ids.clone(),
        horizon_hours: Some(horizon_hours as u64),
        screening_distance_km: Some(screening_distance_km),
        probability_threshold: Some(probability_threshold),
    };

    let analysis = match analyzer_guard.analyze_conjunctions(&satellite_data_catalog, &request) {
        Ok(result) => result,
        Err(e) => {
            tracing::error!("Conjunction analysis failed: {}", e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "analysis_failed",
                "message": e.to_string()
            })));
        }
    };

    drop(analyzer_guard);

    let mut events = Vec::new();
    let mut max_probability: f64 = 0.0;
    let mut probability_sum: f64 = 0.0;
    let mut risk_band_counter: HashMap<String, usize> = HashMap::new();

    for event in analysis.conjunctions {
        let baseline_a = baseline_map.get(&event.satellite_a.norad_id);
        let baseline_b = baseline_map.get(&event.satellite_b.norad_id);
        let baseline_risk = match (baseline_a, baseline_b) {
            (Some(a), Some(b)) => (a.risk_score + b.risk_score) / 2.0,
            (Some(a), None) => a.risk_score,
            (None, Some(b)) => b.risk_score,
            _ => 0.25,
        };

        let tle_age = event
            .satellite_a
            .tle_epoch_age_hours
            .max(event.satellite_b.tle_epoch_age_hours);

        let features = [
            event.dmin_km.max(0.001),
            event.relative_velocity_km_s,
            tle_age,
            baseline_risk,
        ];

        let logistic_probability = {
            match data.risk_model.write() {
                Ok(mut guard) => {
                    let probability = guard.predict(features);
                    let label = if event.pc >= probability_threshold {
                        1.0
                    } else {
                        0.0
                    };
                    guard.update(features, label);
                    probability
                }
                Err(e) => {
                    tracing::error!("Failed to acquire risk model lock: {}", e);
                    0.0
                }
            }
        };
        let risk_level = if logistic_probability >= 0.7 {
            RiskLevel::Red
        } else if logistic_probability >= 0.4 {
            RiskLevel::Amber
        } else {
            RiskLevel::Green
        };

        let band_key = match risk_level {
            RiskLevel::Red => "red",
            RiskLevel::Amber => "amber",
            RiskLevel::Green => "green",
        }
        .to_string();
        *risk_band_counter.entry(band_key).or_insert(0) += 1;

        max_probability = max_probability.max(logistic_probability);
        probability_sum += logistic_probability;

        if logistic_probability >= 0.6 {
            data.alert_hub.publish(LiveAlert {
                id: Uuid::new_v4(),
                tenant_id: tenant_id.clone(),
                title: "High collision probability detected".to_string(),
                message: format!(
                    "Pair {} / {} has {:.2}% risk within {}h horizon",
                    event.satellite_a.norad_id,
                    event.satellite_b.norad_id,
                    logistic_probability * 100.0,
                    horizon_hours
                ),
                severity: AlertSeverity::Critical,
                category: AlertCategory::CollisionRisk,
                created_at: Utc::now(),
                metadata: serde_json::json!({
                    "pair": [event.satellite_a.norad_id, event.satellite_b.norad_id],
                    "probability": logistic_probability,
                    "minimum_distance_km": event.dmin_km,
                    "relative_velocity_km_s": event.relative_velocity_km_s,
                }),
            });
        }

        events.push(RiskPredictionConjunction {
            pair_id: event.id,
            satellites: [event.satellite_a.norad_id, event.satellite_b.norad_id],
            min_distance_km: event.dmin_km,
            relative_velocity_km_s: event.relative_velocity_km_s,
            tle_age_hours: tle_age,
            baseline_risk_score: baseline_risk,
            logistic_probability,
            raw_probability: event.pc,
            risk_level,
            time_of_closest_approach: event.tca,
        });
    }

    let total_events = events.len();
    let dangerous_conjunctions = events
        .iter()
        .filter(|event| matches!(event.risk_level, RiskLevel::Red | RiskLevel::Amber))
        .count();
    let average_probability = if total_events > 0 {
        probability_sum / total_events as f64
    } else {
        0.0
    };

    let model_snapshot = match data.risk_model.read() {
        Ok(guard) => guard.explain(),
        Err(e) => {
            tracing::error!("Failed to read risk model state: {}", e);
            crate::ml::RiskModelExplanation {
                bias: 0.0,
                coefficients: [0.0; 4],
                feature_order: [
                    "minimum_distance_km",
                    "relative_velocity_km_s",
                    "tle_age_hours",
                    "baseline_risk_score",
                ],
                observation_count: 0,
                learning_rate: 0.0,
                l2_penalty: 0.0,
                last_updated: None,
                persistence_path: None,
            }
        }
    };

    let response = RiskPredictionResponse {
        generated_at: Utc::now(),
        tenant_id,
        horizon_hours,
        conjunctions_evaluated: total_events,
        dangerous_conjunctions,
        summary: RiskPredictionSummary {
            max_probability,
            average_probability,
            by_risk_band: risk_band_counter,
        },
        events,
        model: model_snapshot,
    };

    Ok(HttpResponse::Ok().json(response))
}

pub async fn stream_alerts(
    data: web::Data<AppState>,
    req: HttpRequest,
) -> ActixResult<HttpResponse> {
    let tenant_id = tenant_id_from_request(&req);
    let receiver = data.alert_hub.subscribe();
    let tenant_filter = tenant_id.clone();

    let stream = BroadcastStream::new(receiver).filter_map(move |result| {
        let tenant_filter = tenant_filter.clone();
        async move {
            match result {
                Ok(alert) => {
                    let allow_default = tenant_filter == DEFAULT_TENANT;
                    if alert.tenant_id == tenant_filter
                        || (allow_default && alert.tenant_id == DEFAULT_TENANT)
                    {
                        match serde_json::to_string(&alert) {
                            Ok(json) => {
                                let payload = format!("event: alert\ndata: {}\n\n", json);
                                Some(Ok::<Bytes, actix_web::Error>(Bytes::from(payload)))
                            }
                            Err(e) => {
                                tracing::error!("Failed to serialize alert: {}", e);
                                None
                            }
                        }
                    } else {
                        None
                    }
                }
                Err(e) => {
                    tracing::warn!("Alert stream lagged: {}", e);
                    None
                }
            }
        }
    });

    Ok(HttpResponse::Ok()
        .append_header((header::CONTENT_TYPE, "text/event-stream"))
        .append_header((header::CACHE_CONTROL, "no-cache"))
        .append_header((header::CONNECTION, "keep-alive"))
        .streaming(stream))
}

pub async fn assess_launch_feasibility(
    data: web::Data<AppState>,
    payload: web::Json<LaunchFeasibilityRequest>,
) -> ActixResult<HttpResponse> {
    let request = payload.into_inner();
    tracing::info!(
        "Assessing launch feasibility for mission '{}' (customer: {})",
        request.mission_name,
        request.customer
    );

    let catalog_positions = match data.satellite_api.get_all_satellites(None, None).await {
        Ok(list) => list,
        Err(e) => {
            tracing::error!("Failed to load catalog for launch feasibility: {}", e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "catalog_load_failed",
                "message": e.to_string()
            })));
        }
    };

    let satellite_data_catalog = catalog_to_satellite_data(&catalog_positions);

    match data.reservation_manager.lock() {
        Ok(mut manager) => {
            match manager.evaluate_launch_feasibility(request, &satellite_data_catalog) {
                Ok(result) => Ok(HttpResponse::Ok().json(result)),
                Err(e) => {
                    tracing::warn!("Launch feasibility evaluation failed: {}", e);
                    Ok(HttpResponse::BadRequest().json(serde_json::json!({
                        "error": "launch_feasibility_failed",
                        "message": e.to_string()
                    })))
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to acquire reservation manager lock: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Service temporarily unavailable",
                "message": "Could not access reservation manager"
            })))
        }
    }
}

fn catalog_to_satellite_data(catalog: &[SatellitePosition]) -> Vec<crate::tle::SatelliteData> {
    catalog
        .iter()
        .map(|pos| crate::tle::SatelliteData {
            norad_id: pos.norad_id,
            name: pos.name.clone(),
            tle_line1: format!(
                "1 {:05}U          23001.00000000  .00000000  00000-0  00000-0 0  9999",
                pos.norad_id
            ),
            tle_line2: format!(
                "2 {:05}  51.6000   0.0000 0000000   0.0000   0.0000 15.50000000000000",
                pos.norad_id
            ),
            last_updated: pos.timestamp,
        })
        .collect()
}

// Orbit Reservation Endpoints
pub async fn create_reservation(
    data: web::Data<AppState>,
    request: web::Json<CreateReservationRequest>,
) -> ActixResult<HttpResponse> {
    tracing::info!("Creating orbit reservation for owner: {}", request.owner);

    let catalog_positions = match data.satellite_api.get_all_satellites(None, None).await {
        Ok(list) => list,
        Err(e) => {
            tracing::error!("Failed to load catalog for reservation safety check: {}", e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "catalog_load_failed",
                "message": e.to_string()
            })));
        }
    };

    let satellite_data_catalog = catalog_to_satellite_data(&catalog_positions);

    match data.reservation_manager.lock() {
        Ok(mut manager) => {
            let payload = request.into_inner();
            match manager.create_reservation(payload) {
                Ok(reservation) => {
                    let assessment = match manager
                        .check_reservation_conflicts(reservation.id, &satellite_data_catalog)
                    {
                        Ok(result) => result,
                        Err(e) => {
                            tracing::error!(
                                "Failed to evaluate safety for reservation {}: {}",
                                reservation.id,
                                e
                            );
                            return Ok(HttpResponse::InternalServerError().json(
                                serde_json::json!({
                                    "error": "safety_check_failed",
                                    "message": e.to_string()
                                }),
                            ));
                        }
                    };

                    let (summary, safe_to_launch) =
                        OrbitReservationManager::summarize_feasibility(&reservation, &assessment);

                    tracing::info!(
                        "Created reservation with ID: {} (safe_to_launch: {})",
                        reservation.id,
                        safe_to_launch
                    );

                    let response = CreateReservationResponse {
                        reservation,
                        safety: Some(ReservationSafetyReport {
                            safe_to_launch,
                            summary,
                            assessment,
                        }),
                    };

                    Ok(HttpResponse::Created().json(response))
                }
                Err(e) => {
                    tracing::error!("Failed to create reservation: {}", e);
                    Ok(HttpResponse::BadRequest().json(serde_json::json!({
                        "error": "Failed to create reservation",
                        "message": e.to_string()
                    })))
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to acquire reservation manager lock: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Service temporarily unavailable",
                "message": "Could not access reservation manager"
            })))
        }
    }
}

pub async fn check_reservation_conflicts(
    data: web::Data<AppState>,
    path: web::Path<String>,
) -> ActixResult<HttpResponse> {
    let reservation_id_str = path.into_inner();

    let reservation_id = match Uuid::parse_str(&reservation_id_str) {
        Ok(id) => id,
        Err(e) => {
            tracing::warn!("Invalid reservation ID format: {}", reservation_id_str);
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid reservation ID format",
                "message": e.to_string()
            })));
        }
    };

    tracing::info!("Checking conflicts for reservation: {}", reservation_id);

    // Get current satellite catalog
    match data.satellite_api.get_all_satellites(None, None).await {
        Ok(sat_positions) => {
            // Convert to satellite data
            let satellite_data: Vec<crate::tle::SatelliteData> = sat_positions
                .into_iter()
                .map(|pos| crate::tle::SatelliteData {
                    norad_id: pos.norad_id,
                    name: pos.name,
                    tle_line1: format!(
                        "1 {:05}U          23001.00000000  .00000000  00000-0  00000-0 0  9999",
                        pos.norad_id
                    ),
                    tle_line2: format!(
                        "2 {:05}  51.6000   0.0000 0000000   0.0000   0.0000 15.50000000000000",
                        pos.norad_id
                    ),
                    last_updated: pos.timestamp,
                })
                .collect();

            match data.reservation_manager.lock() {
                Ok(mut manager) => {
                    match manager.check_reservation_conflicts(reservation_id, &satellite_data) {
                        Ok(check_result) => {
                            tracing::info!(
                                "Conflict check completed: {} conflicts found",
                                check_result.conflicts_found
                            );
                            Ok(HttpResponse::Ok().json(check_result))
                        }
                        Err(e) => {
                            tracing::error!("Conflict check failed: {}", e);
                            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                                "error": "Conflict check failed",
                                "message": e.to_string()
                            })))
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to acquire reservation manager lock: {}", e);
                    Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": "Service temporarily unavailable",
                        "message": "Could not access reservation manager"
                    })))
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to get satellite catalog: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to retrieve satellite catalog",
                "message": e.to_string()
            })))
        }
    }
}

pub async fn list_reservations(data: web::Data<AppState>) -> ActixResult<HttpResponse> {
    match data.reservation_manager.lock() {
        Ok(manager) => {
            let reservations = manager.list_reservations();
            Ok(HttpResponse::Ok().json(reservations))
        }
        Err(e) => {
            tracing::error!("Failed to acquire reservation manager lock: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Service temporarily unavailable",
                "message": "Could not access reservation manager"
            })))
        }
    }
}
