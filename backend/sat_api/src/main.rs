use actix_cors::Cors;
use actix_web::{middleware::Logger, web, App, HttpServer};
use sat_api::{
    handlers, AlertHub, AppState, ConjunctionAnalyzer, OrbitReservationManager, RiskModel,
    SatelliteApi,
};
use std::env;
use std::sync::{Arc, Mutex, RwLock};
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    let _ = tracing::subscriber::set_global_default(subscriber);

    info!("🛰️ Starting Satellite API Server...");

    // Configuration
    let host = env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(8080);

    // Initialize Satellite API
    let satellite_api = Arc::new(SatelliteApi::new());

    info!("🔄 Initializing satellite data...");
    if let Err(e) = satellite_api.initialize().await {
        panic!("Failed to initialize satellite API: {}", e);
    }

    // Initialize AI conjunction analysis system
    info!("🤖 Initializing AI conjunction analysis system...");
    let conjunction_analyzer = Arc::new(Mutex::new(ConjunctionAnalyzer::new()));

    // Initialize orbit reservation manager
    info!("📋 Initializing orbit reservation manager...");
    let alert_hub = Arc::new(AlertHub::new(256));

    let risk_model_path =
        env::var("RISK_MODEL_PATH").unwrap_or_else(|_| "data/risk_model_state.json".to_string());
    let risk_model = Arc::new(RwLock::new(RiskModel::load_or_default(Some(
        risk_model_path.as_str(),
    ))));

    let reservation_manager =
        Arc::new(Mutex::new(OrbitReservationManager::new(risk_model.clone())));

    let app_state = AppState {
        satellite_api: satellite_api.clone(),
        conjunction_analyzer,
        reservation_manager,
        alert_hub,
        risk_model,
    };

    info!("🚀 Starting server on {}:{}", host, port);

    // Start HTTP server
    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .app_data(web::Data::new(app_state.clone()))
            .wrap(Logger::default())
            .wrap(cors)
            .route("/health", web::get().to(handlers::health_check))
            .service(
                web::scope("/api/v1")
                    // Satellite tracking endpoints
                    .route("/satellites", web::get().to(handlers::get_all_satellites))
                    .route(
                        "/satellite/{norad_id}",
                        web::get().to(handlers::get_satellite),
                    )
                    .route(
                        "/groups/{name}",
                        web::get().to(handlers::get_satellite_group),
                    )
                    .route("/statistics", web::get().to(handlers::get_statistics))
                    .route(
                        "/satellites/propagate",
                        web::get().to(handlers::propagate_satellites),
                    )
                    // AI conjunction analysis endpoints
                    .route(
                        "/conjunctions/analyze",
                        web::post().to(handlers::analyze_conjunctions),
                    )
                    .route("/risk/predict", web::post().to(handlers::predict_risk))
                    .route(
                        "/missions/launch/feasibility",
                        web::post().to(handlers::assess_launch_feasibility),
                    )
                    .route("/alerts/stream", web::get().to(handlers::stream_alerts))
                    // Orbit reservation management endpoints
                    .route(
                        "/reservations",
                        web::post().to(handlers::create_reservation),
                    )
                    .route("/reservations", web::get().to(handlers::list_reservations))
                    .route(
                        "/reservations/{id}/conflicts",
                        web::post().to(handlers::check_reservation_conflicts),
                    ),
            )
    })
    .bind((host.as_str(), port))?
    .run()
    .await
}
