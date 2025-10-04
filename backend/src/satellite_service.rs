use chrono::{DateTime, Utc};
use rand::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Represents a satellite in our system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Satellite {
    pub id: String,
    pub name: String,
    pub norad_id: Option<u32>,
    pub latitude: f64,
    pub longitude: f64,
    pub altitude: f64,    // km above Earth
    pub velocity: f64,    // km/s
    pub inclination: f64, // degrees
    pub eccentricity: f64,
    pub right_ascension: f64,     // degrees
    pub argument_of_perigee: f64, // degrees
    pub mean_anomaly: f64,        // degrees
    pub mean_motion: f64,         // revs per day
    pub satellite_type: SatelliteType,
    pub status: SatelliteStatus,
    pub launch_date: Option<DateTime<Utc>>,
    pub mass: Option<f64>, // kg
    pub dimensions: Option<SatelliteDimensions>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SatelliteDimensions {
    pub length: f64, // meters
    pub width: f64,  // meters
    pub height: f64, // meters
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SatelliteType {
    Communication,
    EarthObservation,
    Weather,
    Navigation,
    Scientific,
    Military,
    SpaceStation,
    Debris,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SatelliteStatus {
    Active,
    Inactive,
    Decayed,
    Unknown,
}

/// Ground station for observations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroundStation {
    pub id: String,
    pub name: String,
    pub latitude: f64,
    pub longitude: f64,
    pub altitude: f64,      // meters above sea level
    pub min_elevation: f64, // minimum elevation for tracking (degrees)
}

/// Satellite service for managing satellite data
pub struct SatelliteService {
    satellites: HashMap<String, Satellite>,
    ground_stations: HashMap<String, GroundStation>,
}

impl SatelliteService {
    pub fn new() -> Self {
        let mut service = Self {
            satellites: HashMap::new(),
            ground_stations: HashMap::new(),
        };

        // Initialize with realistic satellite data
        service.initialize_satellites();
        service.initialize_ground_stations();

        service
    }

    /// Initialize with realistic satellite constellation
    fn initialize_satellites(&mut self) {
        // Starlink constellation (LEO communication satellites)
        for i in 1..=100 {
            let satellite = self.create_starlink_satellite(i);
            self.satellites.insert(satellite.id.clone(), satellite);
        }

        // GPS constellation
        for i in 1..=32 {
            let satellite = self.create_gps_satellite(i);
            self.satellites.insert(satellite.id.clone(), satellite);
        }

        // Weather satellites (geostationary)
        for i in 1..=5 {
            let satellite = self.create_weather_satellite(i);
            self.satellites.insert(satellite.id.clone(), satellite);
        }

        // Earth observation satellites
        for i in 1..=20 {
            let satellite = self.create_earth_observation_satellite(i);
            self.satellites.insert(satellite.id.clone(), satellite);
        }

        // International Space Station
        let iss = self.create_iss();
        self.satellites.insert(iss.id.clone(), iss);
    }

    fn initialize_ground_stations(&mut self) {
        let stations = vec![
            ("Kourou", -5.2316, 52.7683, 45.0),
            ("Baikonur", 45.9648, 63.3054, 90.0),
            ("Cape Canaveral", 28.5721, -80.6480, 3.0),
            ("Vandenberg", 34.6059, -120.6247, 108.0),
            ("Plesetsk", 62.9572, 40.5775, 120.0),
        ];

        for (name, lat, lon, alt) in stations {
            let station = GroundStation {
                id: Uuid::new_v4().to_string(),
                name: name.to_string(),
                latitude: lat,
                longitude: lon,
                altitude: alt,
                min_elevation: 10.0,
            };
            self.ground_stations.insert(station.id.clone(), station);
        }
    }

    fn create_starlink_satellite(&self, index: u32) -> Satellite {
        let mut rng = thread_rng();

        // Starlink constellation parameters
        let inclination = 53.0 + rng.gen::<f64>() * 2.0; // ~53 degrees
        let altitude = 540.0 + rng.gen::<f64>() * 30.0; // ~540-570 km
        let longitude = rng.gen::<f64>() * 360.0 - 180.0;
        let latitude = (rng.gen::<f64>() - 0.5) * 2.0 * inclination;

        Satellite {
            id: format!("starlink-{:04}", index),
            name: format!("Starlink-{}", index),
            norad_id: Some(40000 + index),
            latitude: latitude,
            longitude: longitude,
            altitude: altitude,
            velocity: self.calculate_orbital_velocity(altitude),
            inclination: inclination,
            eccentricity: 0.0001 + rng.gen::<f64>() * 0.0020,
            right_ascension: rng.gen::<f64>() * 360.0,
            argument_of_perigee: rng.gen::<f64>() * 360.0,
            mean_anomaly: rng.gen::<f64>() * 360.0,
            mean_motion: self.calculate_mean_motion(altitude),
            satellite_type: SatelliteType::Communication,
            status: SatelliteStatus::Active,
            launch_date: Some(Utc::now() - chrono::Duration::days(rng.gen_range(30..730))),
            mass: Some(260.0),
            dimensions: Some(SatelliteDimensions {
                length: 2.8,
                width: 1.4,
                height: 1.4,
            }),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    fn create_gps_satellite(&self, index: u32) -> Satellite {
        let mut rng = thread_rng();

        let inclination = 55.0;
        let altitude = 20180.0;
        let longitude = rng.gen::<f64>() * 360.0 - 180.0;
        let latitude = (rng.gen::<f64>() - 0.5) * 2.0 * inclination;

        Satellite {
            id: format!("gps-{:02}", index),
            name: format!("GPS-{}", index),
            norad_id: Some(20000 + index),
            latitude: latitude,
            longitude: longitude,
            altitude: altitude,
            velocity: self.calculate_orbital_velocity(altitude),
            inclination: inclination,
            eccentricity: 0.01 + rng.gen::<f64>() * 0.01,
            right_ascension: rng.gen::<f64>() * 360.0,
            argument_of_perigee: rng.gen::<f64>() * 360.0,
            mean_anomaly: rng.gen::<f64>() * 360.0,
            mean_motion: self.calculate_mean_motion(altitude),
            satellite_type: SatelliteType::Navigation,
            status: SatelliteStatus::Active,
            launch_date: Some(Utc::now() - chrono::Duration::days(rng.gen_range(365..3650))),
            mass: Some(2032.0),
            dimensions: Some(SatelliteDimensions {
                length: 5.3,
                width: 3.8,
                height: 2.0,
            }),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    fn create_weather_satellite(&self, index: u32) -> Satellite {
        let mut rng = thread_rng();

        let altitude = 35786.0;
        let longitude = -75.0 + (index as f64 * 30.0);
        let latitude = 0.0;

        Satellite {
            id: format!("goes-{}", index),
            name: format!("GOES-{}", index),
            norad_id: Some(30000 + index),
            latitude: latitude,
            longitude: longitude,
            altitude: altitude,
            velocity: self.calculate_orbital_velocity(altitude),
            inclination: 0.1,
            eccentricity: 0.0001,
            right_ascension: longitude,
            argument_of_perigee: 0.0,
            mean_anomaly: rng.gen::<f64>() * 360.0,
            mean_motion: self.calculate_mean_motion(altitude),
            satellite_type: SatelliteType::Weather,
            status: SatelliteStatus::Active,
            launch_date: Some(Utc::now() - chrono::Duration::days(rng.gen_range(365..2555))),
            mass: Some(5216.0),
            dimensions: Some(SatelliteDimensions {
                length: 6.2,
                width: 4.2,
                height: 3.1,
            }),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    fn create_earth_observation_satellite(&self, index: u32) -> Satellite {
        let mut rng = thread_rng();

        let inclination = 98.0 + rng.gen::<f64>() * 2.0;
        let altitude = 600.0 + rng.gen::<f64>() * 300.0;
        let longitude = rng.gen::<f64>() * 360.0 - 180.0;
        let latitude = (rng.gen::<f64>() - 0.5) * 2.0 * 80.0;

        Satellite {
            id: format!("landsat-{:02}", index),
            name: format!("Landsat-{}", index),
            norad_id: Some(50000 + index),
            latitude: latitude,
            longitude: longitude,
            altitude: altitude,
            velocity: self.calculate_orbital_velocity(altitude),
            inclination: inclination,
            eccentricity: 0.001 + rng.gen::<f64>() * 0.01,
            right_ascension: rng.gen::<f64>() * 360.0,
            argument_of_perigee: rng.gen::<f64>() * 360.0,
            mean_anomaly: rng.gen::<f64>() * 360.0,
            mean_motion: self.calculate_mean_motion(altitude),
            satellite_type: SatelliteType::EarthObservation,
            status: SatelliteStatus::Active,
            launch_date: Some(Utc::now() - chrono::Duration::days(rng.gen_range(180..1825))),
            mass: Some(2200.0),
            dimensions: Some(SatelliteDimensions {
                length: 4.3,
                width: 2.7,
                height: 3.0,
            }),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    fn create_iss(&self) -> Satellite {
        let mut rng = thread_rng();

        let altitude = 408.0;
        let inclination = 51.6;
        let longitude = rng.gen::<f64>() * 360.0 - 180.0;
        let latitude = (rng.gen::<f64>() - 0.5) * 2.0 * inclination;

        Satellite {
            id: "iss".to_string(),
            name: "International Space Station".to_string(),
            norad_id: Some(25544),
            latitude: latitude,
            longitude: longitude,
            altitude: altitude,
            velocity: self.calculate_orbital_velocity(altitude),
            inclination: inclination,
            eccentricity: 0.0003,
            right_ascension: rng.gen::<f64>() * 360.0,
            argument_of_perigee: rng.gen::<f64>() * 360.0,
            mean_anomaly: rng.gen::<f64>() * 360.0,
            mean_motion: self.calculate_mean_motion(altitude),
            satellite_type: SatelliteType::SpaceStation,
            status: SatelliteStatus::Active,
            launch_date: Some(
                chrono::DateTime::parse_from_rfc3339("1998-11-20T00:00:00Z")
                    .unwrap()
                    .with_timezone(&Utc),
            ),
            mass: Some(444615.0),
            dimensions: Some(SatelliteDimensions {
                length: 108.5,
                width: 72.8,
                height: 20.0,
            }),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    /// Calculate orbital velocity using vis-viva equation
    fn calculate_orbital_velocity(&self, altitude_km: f64) -> f64 {
        const EARTH_RADIUS_KM: f64 = 6371.0;
        const EARTH_MU: f64 = 398600.4418; // km³/s²

        let r = EARTH_RADIUS_KM + altitude_km;
        (EARTH_MU / r).sqrt()
    }

    /// Calculate mean motion (revolutions per day)
    fn calculate_mean_motion(&self, altitude_km: f64) -> f64 {
        const EARTH_RADIUS_KM: f64 = 6371.0;
        const EARTH_MU: f64 = 398600.4418; // km³/s²
        const SECONDS_PER_DAY: f64 = 86400.0;

        let r = EARTH_RADIUS_KM + altitude_km;
        let period_seconds = 2.0 * std::f64::consts::PI * (r.powi(3) / EARTH_MU).sqrt();
        SECONDS_PER_DAY / period_seconds
    }

    /// Get all satellites
    pub fn get_all_satellites(&self) -> Vec<Satellite> {
        self.satellites.values().cloned().collect()
    }

    /// Get satellites by type
    pub fn get_satellites_by_type(&self, satellite_type: &SatelliteType) -> Vec<Satellite> {
        self.satellites
            .values()
            .filter(|s| {
                std::mem::discriminant(&s.satellite_type) == std::mem::discriminant(satellite_type)
            })
            .cloned()
            .collect()
    }

    /// Get satellites visible from a ground station
    pub fn get_visible_satellites(
        &self,
        observer_lat: f64,
        observer_lon: f64,
        observer_alt: f64,
        min_elevation: f64,
    ) -> Vec<Satellite> {
        self.satellites
            .values()
            .filter(|satellite| {
                self.is_satellite_visible(
                    satellite,
                    observer_lat,
                    observer_lon,
                    observer_alt,
                    min_elevation,
                )
            })
            .cloned()
            .collect()
    }

    /// Check if satellite is visible from observer location
    fn is_satellite_visible(
        &self,
        satellite: &Satellite,
        observer_lat: f64,
        observer_lon: f64,
        _observer_alt: f64,
        _min_elevation: f64,
    ) -> bool {
        let distance = self.calculate_distance(
            observer_lat,
            observer_lon,
            satellite.latitude,
            satellite.longitude,
        );

        distance < 2000.0 && satellite.altitude > 100.0
    }

    /// Calculate great circle distance between two points
    fn calculate_distance(&self, lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
        const EARTH_RADIUS: f64 = 6371.0; // km

        let lat1_rad = lat1.to_radians();
        let lat2_rad = lat2.to_radians();
        let delta_lat = (lat2 - lat1).to_radians();
        let delta_lon = (lon2 - lon1).to_radians();

        let a = (delta_lat / 2.0).sin().powi(2)
            + lat1_rad.cos() * lat2_rad.cos() * (delta_lon / 2.0).sin().powi(2);
        let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

        EARTH_RADIUS * c
    }

    /// Update satellite positions (simulate orbital motion)
    pub fn update_satellite_positions(&mut self) {
        for satellite in self.satellites.values_mut() {
            let angular_velocity = satellite.mean_motion * 360.0 / 1440.0;
            let time_step = 1.0;

            satellite.mean_anomaly += angular_velocity * time_step;
            satellite.mean_anomaly %= 360.0;

            // Update position inline to avoid borrow checker issues
            let mean_anomaly_rad = satellite.mean_anomaly.to_radians();
            let inclination_rad = satellite.inclination.to_radians();
            let raan_rad = satellite.right_ascension.to_radians();

            let x = satellite.altitude * mean_anomaly_rad.cos();
            let y = satellite.altitude * mean_anomaly_rad.sin() * inclination_rad.cos();
            let z = satellite.altitude * mean_anomaly_rad.sin() * inclination_rad.sin();

            satellite.latitude = (z / satellite.altitude).asin().to_degrees();
            satellite.longitude = (y.atan2(x) + raan_rad).to_degrees();

            while satellite.longitude > 180.0 {
                satellite.longitude -= 360.0;
            }
            while satellite.longitude < -180.0 {
                satellite.longitude += 360.0;
            }

            satellite.latitude = satellite.latitude.max(-90.0).min(90.0);
            satellite.updated_at = Utc::now();
        }
    }

    /// Update satellite position from orbital elements (simplified)
    fn update_position_from_elements(&self, satellite: &mut Satellite) {
        let mean_anomaly_rad = satellite.mean_anomaly.to_radians();
        let inclination_rad = satellite.inclination.to_radians();
        let raan_rad = satellite.right_ascension.to_radians();

        let x = satellite.altitude * mean_anomaly_rad.cos();
        let y = satellite.altitude * mean_anomaly_rad.sin() * inclination_rad.cos();
        let z = satellite.altitude * mean_anomaly_rad.sin() * inclination_rad.sin();

        satellite.latitude = (z / satellite.altitude).asin().to_degrees();
        satellite.longitude = (y.atan2(x) + raan_rad).to_degrees();

        while satellite.longitude > 180.0 {
            satellite.longitude -= 360.0;
        }
        while satellite.longitude < -180.0 {
            satellite.longitude += 360.0;
        }

        satellite.latitude = satellite.latitude.max(-90.0).min(90.0);
    }

    /// Get satellite by ID
    pub fn get_satellite_by_id(&self, id: &str) -> Option<&Satellite> {
        self.satellites.get(id)
    }

    /// Add new satellite
    pub fn add_satellite(&mut self, satellite: Satellite) {
        self.satellites.insert(satellite.id.clone(), satellite);
    }

    /// Remove satellite
    pub fn remove_satellite(&mut self, id: &str) -> Option<Satellite> {
        self.satellites.remove(id)
    }

    /// Get ground stations
    pub fn get_ground_stations(&self) -> Vec<GroundStation> {
        self.ground_stations.values().cloned().collect()
    }
}
