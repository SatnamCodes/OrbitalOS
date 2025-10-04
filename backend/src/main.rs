mod satellite_service;

use actix_cors::Cors;
use actix_files::Files;
use actix_web::{middleware::Logger, web, App, HttpResponse, HttpServer, Result};
use serde::Serialize;
use std::env;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::time::{interval, Duration};
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

use satellite_service::SatelliteService;

#[derive(Clone)]
pub struct AppState {
    pub satellite_service: Arc<Mutex<SatelliteService>>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
    satellites_count: usize,
}

#[derive(Serialize)]
struct ApiInfo {
    name: String,
    version: String,
    description: String,
    endpoints: Vec<ApiEndpoint>,
}

#[derive(Serialize)]
struct ApiEndpoint {
    method: String,
    path: String,
    description: String,
}

async fn health_check(data: web::Data<AppState>) -> Result<HttpResponse> {
    let service = data.satellite_service.lock().unwrap();
    let satellites = service.get_all_satellites();

    let response = HealthResponse {
        status: "healthy",
        service: "OrbitalOS Satellite API",
        version: "1.0.0",
        satellites_count: satellites.len(),
    };

    Ok(HttpResponse::Ok().json(response))
}

async fn api_info() -> Result<HttpResponse> {
    let info = ApiInfo {
        name: "OrbitalOS Satellite API".to_string(),
        version: "1.0.0".to_string(),
        description: "Real-time satellite tracking and orbital mechanics API".to_string(),
        endpoints: vec![
            ApiEndpoint {
                method: "GET".to_string(),
                path: "/health".to_string(),
                description: "Health check endpoint".to_string(),
            },
            ApiEndpoint {
                method: "GET".to_string(),
                path: "/api/info".to_string(),
                description: "API information".to_string(),
            },
            ApiEndpoint {
                method: "GET".to_string(),
                path: "/api/satellites".to_string(),
                description: "Get satellite data".to_string(),
            },
            ApiEndpoint {
                method: "POST".to_string(),
                path: "/api/satellites/conjunction-analysis".to_string(),
                description: "Analyze satellite conjunctions".to_string(),
            },
            ApiEndpoint {
                method: "POST".to_string(),
                path: "/api/satellites/create-reservation".to_string(),
                description: "Create orbit reservation".to_string(),
            },
        ],
    };

    Ok(HttpResponse::Ok().json(info))
}

// Satellite API routes
async fn get_satellites(data: web::Data<AppState>) -> Result<HttpResponse> {
    let service = data.satellite_service.lock().unwrap();
    let satellites = service.get_all_satellites();

    let response = serde_json::json!({
        "satellites": satellites,
        "count": satellites.len()
    });

    Ok(HttpResponse::Ok().json(response))
}

async fn analyze_conjunctions(
    data: web::Data<AppState>,
    _req: web::Json<serde_json::Value>,
) -> Result<HttpResponse> {
    let _service = data.satellite_service.lock().unwrap();
    // Placeholder for conjunction analysis - will implement based on request data
    let analysis = serde_json::json!({
        "conjunctions": [],
        "analysis_time": chrono::Utc::now(),
        "message": "Conjunction analysis feature coming soon"
    });

    Ok(HttpResponse::Ok().json(analysis))
}

async fn create_reservation(
    data: web::Data<AppState>,
    _req: web::Json<serde_json::Value>,
) -> Result<HttpResponse> {
    let _service = data.satellite_service.lock().unwrap();
    // Placeholder for reservation creation - will implement based on request data
    let result = serde_json::json!({
        "reservation_id": "res_123456",
        "status": "created",
        "message": "Reservation created successfully"
    });

    Ok(HttpResponse::Ok().json(result))
}

async fn start_position_updater(satellite_service: Arc<Mutex<SatelliteService>>) {
    let mut interval = interval(Duration::from_secs(30)); // Update every 30 seconds

    loop {
        interval.tick().await;

        let satellites = {
            satellite_service
                .lock()
                .unwrap()
                .update_satellite_positions();

            let service = satellite_service.lock().unwrap();
            service.get_all_satellites()
        };

        info!("Updated positions for {} satellites", satellites.len());
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    let _ = tracing::subscriber::set_global_default(subscriber);

    let host = env::var("HOST").unwrap_or_else(|_| "localhost".to_string());
    let port = env::var("PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(8082);

    // Initialize satellite service
    let satellite_service = Arc::new(Mutex::new(SatelliteService::new()));

    info!("Initializing satellite service...");

    // Load initial satellite data
    {
        let service = satellite_service.lock().unwrap();
        // Service is initialized with default data in new()
        info!(
            "Satellite service initialized with {} satellites",
            service.get_all_satellites().len()
        );
    }

    info!("Satellite service initialized with satellite data");

    // Start background position updater
    let updater_service = Arc::clone(&satellite_service);
    tokio::spawn(async move {
        start_position_updater(updater_service).await;
    });

    let app_state = AppState {
        satellite_service: Arc::clone(&satellite_service),
    };

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    let static_dir = env::var("FRONTEND_DIST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| exe_dir.join("dist"));

    if static_dir.exists() {
        info!("Serving frontend assets from {:?}", static_dir);
    } else {
        info!(
            "Frontend assets directory {:?} not found. API will still be available.",
            static_dir
        );
    }

    info!(
        "Starting OrbitalOS Satellite API server on {}:{}",
        host, port
    );

    let static_dir_for_server = static_dir.clone();

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        let mut app = App::new()
            .app_data(web::Data::new(app_state.clone()))
            .wrap(Logger::default())
            .wrap(cors)
            .route("/health", web::get().to(health_check))
            .route("/api/info", web::get().to(api_info))
            .route("/api/satellites", web::get().to(get_satellites))
            .route(
                "/api/satellites/conjunction-analysis",
                web::post().to(analyze_conjunctions),
            )
            .route(
                "/api/satellites/create-reservation",
                web::post().to(create_reservation),
            );

        let static_assets = static_dir_for_server.clone();
        if static_assets.exists() {
            app = app.service(
                Files::new("/", static_assets)
                    .index_file("index.html")
                    .prefer_utf8(true),
            );
        }

        app
    })
    .bind((host, port))?
    .run()
    .await
}
