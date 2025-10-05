# OrbitalOS – Simple Local Setup (No Docker)

> Quick Start (just want to see it running?):
>
> ```powershell
> git clone https://github.com/SatnamCodes/OrbitalOS.git
> cd OrbitalOS
> 
> # Install frontend deps
> cd frontend; npm install; cd ..
> 
> # Start primary API (sat_api) on port 3000
> cd backend/sat_api; $env:PORT=3000; cargo run
> # (Leave it running)
> ```
> Open a second terminal:
> ```powershell
> cd OrbitalOS/frontend
> npm run dev
> ```
> Then visit: http://localhost:5173/
>
> Or on Windows (single step):
> ```powershell
> start_backend_frontend.bat
> ```
>
> Need the legacy/secondary backend too? Use:
> ```powershell
> start_dev.bat
> ```

---

This guide shows how to run OrbitalOS locally (backend + satellite API + frontend) using plain Rust & Node.js tooling—no Docker.

---
## 1. Features Overview

Core Platform:
- Real‑time satellite tracking (TLE based) & orbital propagation
- Conjunction (collision) analysis framework (early phase)
- Risk prediction model (loads persisted state file)
- Orbit reservation & conflict checking skeleton
- Alerts hub & streaming endpoint
- Role-based dashboards (Operator / Insurer / Analyst)
- 3D Earth visualization (Cesium + React Three Fiber + Drei)
- Satellite detail panels, playback/time scrub, risk color coding
- Booking / reservation requests (work in progress in core backend)
- Static asset serving & optional embedded frontend build feature (Rust)

Developer Convenience:
- `start_dev.ps1` (PowerShell) – all services in parallel (sat_api + backend + frontend)
- `start_dev.bat` / `start_backend_frontend.bat` – Windows batch launchers
- Optional single binary build with `embed_frontend` feature

---
## 2. Repository Layout (Relevant to Local Run)

```
backend/              # Legacy / auxiliary Rust web service (Actix) – serves static assets when built
backend/sat_api/      # Primary satellite + risk + reservation API (Actix) – main backend you hit from the frontend
frontend/             # React + Vite client (Cesium, Three.js, Zustand, Tailwind)
ai/                   # Experimental risk engine assets / data
scripts/              # Helper PowerShell / shell scripts
start_dev.ps1         # Power dev launcher (Windows PowerShell)
start_dev.bat         # Batch version (all services)
start_backend_frontend.bat # Only primary API + frontend
README.simple.md      # This file
```

---
## 3. Prerequisites

Install / have available:
1. **Rust** (1.75+ recommended) – https://rustup.rs
2. **Node.js** 18+ (LTS preferred) – https://nodejs.org
3. **npm** (bundled with Node) or `corepack enable` if using yarn/pnpm (guide assumes npm)
4. **PostgreSQL 15+** (if you intend to run the core backend that needs a DB). For quick UI demo + sat_api only you may skip DB until you implement DB features.
5. (Optional) `sqlx-cli` for running migrations directly: `cargo install sqlx-cli --features postgres,rustls`

Check versions:
```powershell
rustc --version
cargo --version
node -v
npm -v
```

---
## 4. Clone & Initial Install

```powershell
git clone https://github.com/SatnamCodes/OrbitalOS.git
cd OrbitalOS

# Frontend deps
cd frontend
npm install
cd ..
```

> If collaborators report missing `@react-three/fiber`, have them delete `frontend/node_modules` and re-run `npm install` (see Troubleshooting below).

---
## 5. Environment Variables (Backend Core)

In `backend/` there is an `env.example`. Copy it to `.env` and adjust:
```powershell
cd backend
Copy-Item env.example .env
```
Critical values:
```
DATABASE_URL=postgres://user:password@localhost:5432/orbitalos
JWT_SECRET=change_me
RUST_LOG=info
```
Create the database manually if needed:
```powershell
psql -U postgres -c "CREATE DATABASE orbitalos;"
```

Run migrations (if you are using the core backend service that relies on them):
```powershell
# From backend/ directory
sqlx migrate run
```

> The `sat_api` service (in `backend/sat_api/`) is mainly in‑memory / file‑based for satellite data & risk model loading and does not require these migrations to start.

---
## 6. Running Services (Manual Commands)

### 6.1 Primary Satellite API (sat_api)
Default port (code default): `8080`. We commonly run it on `3000` to align with frontend proxy expectations.
```powershell
cd backend/sat_api
$env:PORT = 3000   # optional override
cargo run
```
The API will log startup messages. Example health: http://localhost:3000/health

### 6.2 Secondary Backend (legacy / auxiliary)
Serves static frontend if you build it; default port 8082.
```powershell
cd backend
$env:PORT = 8082
cargo run
```

### 6.3 Frontend (Vite)
```powershell
cd frontend
npm run dev
```
Vite runs at http://localhost:5173/ (strict port). Proxy rules forward `/api` to http://localhost:3000.

Open http://localhost:5173/

---
## 7. Convenience Scripts (Windows)

From repository root:

| Script | Purpose |
|--------|---------|
| `start_backend_frontend.bat` | Starts only `sat_api` (port 3000) + frontend (5173) and opens browser. |
| `start_dev.bat` | Starts `sat_api`, secondary `backend`, and frontend. |
| `start_dev.ps1` | PowerShell variant with job monitoring & optional port overrides. |
| `run_unified.ps1` | Builds production frontend + backend (optionally embedding assets with feature). |

Example (simple two‑service run):
```powershell
start_backend_frontend.bat
```

Disable browser auto-open:
```powershell
set AUTO_OPEN_BROWSER=0
start_backend_frontend.bat
```

---
## 8. Building a Single Executable with Embedded Frontend (Optional)

1. Build the production frontend:
   ```powershell
   cd frontend
   npm run build
   cd ..
   ```
2. From `backend/` build with feature:
   ```powershell
   cd backend
   cargo build --release --features embed_frontend
   ```
3. Run the binary (it will look for embedded assets first):
   ```powershell
   .\target\release\orbitalos-backend.exe
   ```
4. Open the logged URL (likely http://localhost:8082/ unless you set `PORT`).

Or use helper script:
```powershell
pwsh .\run_unified.ps1 -Embed -Release
```

---
## 9. Key API Endpoints (sat_api service)

| Path | Method | Description |
|------|--------|-------------|
| `/health` | GET | Health check |
| `/api/v1/satellites` | GET | List satellites |
| `/api/v1/satellite/{norad_id}` | GET | Satellite detail |
| `/api/v1/conjunctions/analyze` | POST | Conjunction analysis (placeholder / evolving) |
| `/api/v1/risk/predict` | POST | Risk prediction using loaded model |
| `/api/v1/reservations` | POST/GET | Create / list orbit reservations |
| `/api/v1/alerts/stream` | GET | Server-sent events for alerts |

Legacy backend adds simplified endpoints (see its `main.rs`) and static file serving.

---
## 10. Troubleshooting

### Missing module: `@react-three/fiber`
Symptoms: Vite overlay “Failed to resolve import '@react-three/fiber' …”.
Fix:
```powershell
cd frontend
rd /s /q node_modules
del package-lock.json
npm install
npm run dev
```

### Port already in use
Change the `PORT` env variable before launch (PowerShell):
```powershell
$env:PORT = 3005
cargo run
```

### Database connection errors (core backend)
Ensure Postgres is running and `DATABASE_URL` matches an existing database. Test quickly:
```powershell
psql %DATABASE_URL% -c "select 1"  # (Use a psql connection string variant if env not expanded)
```

### Browser not opening (batch script)
Set `AUTO_OPEN_BROWSER=1` (default) or open manually at http://localhost:5173/.

### Slow first build
Rust will compile many crates (Actix, sqlx, nalgebra, etc.). Subsequent builds are fast. Use `cargo build --release` when ready for optimized binary.

---
## 11. Recommended Next Steps
- Commit a `package-lock.json` for reproducible installs.
- Add a dependency check script (optional) under `frontend/scripts/`.
- Expand conjunction analysis logic and integrate orbit reservation conflict flow into UI.

---
## 12. License & Credits
OrbitalOS © 2025. See main `LICENSE` file (MIT if unchanged). Built with Rust, React, Cesium, Three.js, Actix, SQLx and community crates.

---
Happy hacking — clear skies and safe orbits! 🛰️
