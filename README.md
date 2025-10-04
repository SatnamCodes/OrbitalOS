# OrbitalOS MVP

**Predict. Prevent. Protect.** - Secure satellite operations platform with AI-driven collision prediction and intelligent booking system.

## � Table of Contents

- [🚀 Features](#-features)
   - [✅ Completed MVP Features](#-completed-mvp-features)
   - [🛠 Technology Stack](#-technology-stack)
- [🏃‍♂️ Quick Start](#-quick-start)
   - [Prerequisites](#prerequisites)
   - [Option 1: Docker Compose (Recommended)](#option-1-docker-compose-recommended)
   - [Option 2: Local Development](#option-2-local-development)
- [🔐 Demo Credentials](#-demo-credentials)
- [📊 API Endpoints](#-api-endpoints)
- [🎯 User Roles](#-user-roles)
- [🗂 Project Structure](#-project-structure)
- [🔧 Development](#-development)
- [🚀 Deployment](#-deployment)
- [📈 Performance Features](#-performance-features)
- [🔒 Security Features](#-security-features)
- [🧪 Testing](#-testing)
- [📝 Contributing](#-contributing)
- [📄 License](#-license)
- [🆘 Support](#-support)
- [🔮 Future Enhancements](#-future-enhancements)

## �🚀 Features

### ✅ Completed MVP Features

- **Landing Page** with morph-style animations and role-based login
- **3D Earth Visualizer** with CesiumJS integration
- **Live Satellite Tracking** with TLE data support
- **Risk-based Color Coding** (Green/Amber/Red)
- **Interactive Satellite Details** with metadata panels
- **Time Scrub & Playback** for orbit simulation
- **Risk Prediction Engine** with collision probability
- **Booking Request System** with conflict detection
- **Real-time Alerts** and notifications
- **Role-based Dashboard** (Operator/Insurer/Analyst)
- **Analytics & Reporting** with charts and trends

### 🛠 Technology Stack

**Backend (Rust)**
- Axum web framework
- PostgreSQL database with SQLx
- JWT authentication with Argon2
- CORS-enabled API endpoints
- Comprehensive error handling

**Frontend (React)**
- React 18 with Vite
- CesiumJS for 3D visualization
- Tailwind CSS for styling
- Zustand for state management
- Framer Motion for animations
- React Hook Form for forms
- Recharts for data visualization

**Infrastructure**
- Docker containerization
- PostgreSQL database
- Nginx reverse proxy
- Health checks and monitoring

## 🏃‍♂️ Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for development)
- Rust 1.75+ (for development)
- PostgreSQL 15+ (for development)

### Option 1: Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/SatnamCodes/OrbitalOS.git
cd OrbitalOS

# Start all services (use `docker-compose` if your CLI does not support `docker compose`)
cd infra
docker compose up -d

# Follow backend logs until the API is healthy
docker compose logs -f backend

# Seed the database with sample data
docker compose exec backend cargo run --bin seed_data
```

Access the application at:
- Frontend: http://localhost
- Backend API: http://localhost:3000
- Database: localhost:5432

### Option 2: Local Development

#### Backend Setup

```bash
cd backend

# Install Rust dependencies
cargo build

# Copy the environment template and customize as needed
cp env.example .env  # On Windows PowerShell use: Copy-Item env.example .env

# Ensure PostgreSQL is running and that the database exists
# DATABASE_URL should point to your local instance (see env.example)

# Run migrations / seed data (adjust binary if custom seeds are used)
cargo run --bin seed_data

# Launch the API server
cargo run
```

#### Frontend Setup

```bash
cd frontend

# Install Node dependencies
npm install

# Start the Vite development server
npm run dev
```

## 🔐 Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Operator | operator@orbitalos.com | password123 |
| Insurer | insurer@orbitalos.com | password123 |
| Analyst | analyst@orbitalos.com | password123 |

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

### Satellites
- `GET /api/satellites` - List all satellites
- `GET /api/satellites/:id` - Get satellite details

### Risk Assessment
- `POST /api/risk/predict` - Predict collision risk

### Bookings
- `GET /api/bookings` - List bookings
- `POST /api/bookings` - Create booking request
- `GET /api/bookings/:id` - Get booking details

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

### Alerts
- `GET /api/alerts` - List alerts
- `POST /api/alerts/:id` - Acknowledge alert

## 🎯 User Roles

### Operator
- Monitor satellite fleet
- Request orbital operations
- View maneuver recommendations
- Manage booking requests

### Insurer
- Assess risk exposure
- Monitor collision probabilities
- View risk trends and analytics
- Generate risk reports

### Analyst
- Analyze operational trends
- Generate comprehensive reports
- Monitor system performance
- Track collision statistics

## 🗂 Project Structure

```
OrbitalOS/
├── backend/            # Rust Actix API, migrations, sat_api service
│   ├── src/
│   ├── migrations/
│   └── Cargo.toml
├── frontend/           # React + Vite client application
│   ├── src/
│   └── package.json
├── ai/                 # AI models, notebooks, and risk engine experiments
├── infra/              # Docker, nginx, and deployment automation
├── scripts/            # Helper utilities (bundle builder, demos, etc.)
├── docs/               # Additional documentation and design notes
└── README.md
```

## 🔧 Development

### Backend Development

```bash
cd backend

# Run tests
cargo test

# Run with hot reload
cargo watch -x run

# Check code formatting
cargo fmt

# Lint code
cargo clippy
```

### Frontend Development

```bash
cd frontend

# Run tests
npm test

# Build for production
npm run build

# Lint code
npm run lint
```

## 🚀 Deployment

### Production Deployment

1. **Environment Setup**
   ```bash
   # Set production environment variables
   export DATABASE_URL="postgresql://user:pass@host:port/db"
   export JWT_SECRET="your-super-secure-secret"
   export RUST_LOG="warn"
   ```

2. **Build and Deploy**
   ```bash
   # Build Docker images
   docker-compose -f docker-compose.prod.yml build

   # Deploy
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **Database Migration**
   ```bash
   # Run migrations
   docker-compose exec backend cargo run --bin seed_data
   ```

### Windows Bundle (Backend + Frontend)

For an all-in-one Windows distribution that serves the built React frontend from the Rust backend executable:

1. Run the packaging script from the repository root:
   ```powershell
   pwsh scripts/build_windows_bundle.ps1
   ```

2. The bundle will be created under `artifacts\windows\OrbitalOS\` with:
   - `orbitalos-backend.exe` – Actix backend that also serves static frontend assets.
   - `dist\` – Production build of the frontend (copied next to the executable).
   - `.env.example` and a `README.txt` with run instructions.

3. To launch:
   ```powershell
   cd artifacts\windows\OrbitalOS
   $env:PORT = "8082"          # optional override
   $env:FRONTEND_DIST_DIR = "$PWD\dist"
   .\orbitalos-backend.exe
   ```

4. Open `http://localhost:8082` in a browser to access the UI.

## 📈 Performance Features

- **Web Workers** for orbit propagation calculations
- **Level-of-Detail (LOD)** rendering for 1000+ satellites
- **Efficient Database Queries** with proper indexing
- **Caching** for frequently accessed data
- **Offline Fallback** with precomputed scenarios

## 🔒 Security Features

- **JWT Authentication** with secure token handling
- **Password Hashing** with Argon2
- **CORS Protection** with configurable origins
- **Input Validation** and sanitization
- **SQL Injection Prevention** with parameterized queries
- **Rate Limiting** for API endpoints

## 🧪 Testing

### Backend Tests
```bash
cd backend
cargo test
```

### Frontend Tests
```bash
cd frontend
npm test
```

### End-to-End Tests
```bash
# Run E2E tests (when implemented)
npm run test:e2e
```

## 📝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation in `/docs`

## 🔮 Future Enhancements

- **Real-time Satellite Data** integration with NORAD
- **Machine Learning** models for collision prediction
- **Advanced Analytics** with predictive insights
- **Mobile Application** for on-the-go monitoring
- **API Rate Limiting** and usage analytics
- **Multi-tenant Architecture** for enterprise customers

---

**OrbitalOS** - Securing the future of space operations 🛰️
