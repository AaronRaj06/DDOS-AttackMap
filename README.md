# DDoS Attack Live Map 🌍

A real-time DDoS attack visualization system with an interactive 3D globe, WebSocket streaming, and MongoDB persistence.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-v18%2B-green)
![React](https://img.shields.io/badge/react-19.2.0-blue)

## 🎥 Demo

Interactive 3D globe showing real-time DDoS attack patterns with:
- Live attack arcs between source and destination countries
- Color-coded threat levels
- Real-time statistics dashboard
- Attack type categorization

## 📋 Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## ✨ Features

### Frontend
- **3D Interactive Globe** - Rotate, zoom, and explore attacks in real-time
- **Real-time Visualization** - WebSocket-powered live updates
- **Attack Categories** - 7 different DDoS attack types with unique colors
- **Threat Scoring** - Visual indicators for attack severity
- **Responsive Design** - Works on desktop and mobile
- **User Authentication** - Login/signup system

### Backend
- **Synthetic Event Generation** - Realistic DDoS-like attack simulation
- **AbuseIPDB Integration** - IP reputation enrichment with caching
- **Scoring Engine** - Multi-factor threat analysis
- **WebSocket Server** - Real-time event broadcasting
- **REST API** - Event queries, statistics, and CSV export
- **MongoDB Persistence** - Event storage with TTL indexes

## 🛠️ Technology Stack

### Frontend Technologies

#### **React 19.2.0**
- **Purpose**: UI framework for building the interactive dashboard
- **Where Used**: 
  - `frontend/src/pages/Dashboard.jsx` - Main application view
  - `frontend/src/pages/Login.jsx` & `Signup.jsx` - Authentication
  - `frontend/src/components/Globe.jsx` - 3D visualization component
- **Why**: Component-based architecture, hooks for state management, virtual DOM for performance

#### **Three.js 0.181.2**
- **Purpose**: 3D graphics and WebGL rendering
- **Where Used**: `frontend/src/components/Globe.jsx`
  - Creating 3D sphere geometry
  - Rendering attack arcs as TubeGeometry
  - Camera controls and scene management
  - Loading GeoJSON country boundaries
- **Why**: Industry-standard 3D library, excellent WebGL abstraction, rich ecosystem

#### **React Three Fiber** (via Three.js)
- **Purpose**: React wrapper for Three.js  
- **Where Used**: Integrated into Globe component for declarative 3D
- **Why**: Easier state management for 3D scenes in React

#### **React Router DOM 7.9.6**
- **Purpose**: Client-side routing
- **Where Used**: `frontend/src/App.jsx`
  - `/login` - Login page
  - `/signup` - Registration page
  - `/dashboard` - Main application
- **Why**: Single-page application navigation without page reloads

#### **Vite**
- **Purpose**: Build tool and development server
- **Where Used**: `frontend/vite.config.js` - Build configuration
- **Why**: Lightning-fast HMR, optimized bundling, modern ESM support

### Backend Technologies

#### **Node.js v18+**
- **Purpose**: JavaScript runtime for server-side code
- **Where Used**: Entire backend (`backend/` directory)
- **Why**: Non-blocking I/O perfect for real-time applications, npm ecosystem

#### **Express.js 4.18.2**
- **Purpose**: Web application framework
- **Where Used**: 
  - `backend/index.js` - Main server setup
  - `backend/routes/events.js` - REST API routes
- **Why**: Minimal, flexible, robust routing and middleware system

#### **WebSocket (ws 8.14.2)**
- **Purpose**: Real-time bidirectional communication
- **Where Used**: 
  - `backend/websocket/eventBroadcaster.js` - WebSocket server
  - `frontend/src/hooks/useWebSocket.js` - Client connection
- **Endpoint**: `ws://localhost:5000/ws`
- **Why**: Low-latency real-time updates, persistent connections

#### **MongoDB (Mongoose 9.0.0)**
- **Purpose**: NoSQL database for event persistence
- **Where Used**:
  - `backend/models/Event.js` - Event schema definition
  - `backend/config/database.js` - Connection management
  - `backend/services/eventStore.js` - Async persistence layer
- **Collections**: `events` (auto-created)
- **Why**: Flexible schema, horizontal scaling, 30-day TTL for automatic cleanup

#### **Axios 1.6.0**
- **Purpose**: HTTP client for API requests
- **Where Used**: 
  - `backend/services/abuseIPDB.js` - IP reputation API calls
  - `backend/services/cloudflareClient.js` - Cloudflare Radar API
- **Why**: Promise-based, interceptors, request/response transformation

#### **AbuseIPDB API**
- **Purpose**: IP reputation and threat intelligence
- **Where Used**: `backend/services/abuseIPDB.js`
- **Features**: 
  - 24-hour caching (NodeCache)
  - Rate limit handling
  - Enriches events with abuse scores
- **Why**: Real-world threat data, comprehensive IP database

### Supporting Libraries

| Library | Version | Purpose | Used In |
|---------|---------|---------|---------|
| `dotenv` | 16.3.1 | Environment variables | All backend configs |
| `cors` | 2.8.5 | Cross-Origin Resource Sharing | `backend/index.js` |
| `uuid` | 9.0.1 | Unique event IDs | `backend/services/eventGenerator.js` |
| `csv-writer` | 1.6.0 | CSV export | `backend/routes/events.js` |
| `node-cache` | 5.1.2 | In-memory caching | `backend/services/abuseIPDB.js` |

## 🏗️ Architecture

### System Overview

```
┌─────────────┐         WebSocket          ┌─────────────┐
│   Browser   │◄──────────────────────────►│   Backend   │
│  (React +   │         REST API            │  (Node.js)  │
│  Three.js)  │◄──────────────────────────►│             │
└─────────────┘                             └──────┬──────┘
                                                   │
                                                   ├─► AbuseIPDB API
                                                   │
                                                   └─► MongoDB
```

### Data Flow

```
1. Event Generation (Backend)
   ├─ Synthetic event created every 700-1200ms
   ├─ Geolocation data assigned
   └─ Broadcast to WebSocket clients

2. Event Enrichment (Async)
   ├─ AbuseIPDB lookup (with caching)
   ├─ Scoring engine analysis
   └─ Update broadcasted to clients

3. Persistence
   ├─ Save to MongoDB (fire-and-forget)
   └─ In-memory buffer (last 1000 events)

4. Visualization (Frontend)
   ├─ WebSocket receives events
   ├─ Globe component renders 3D arcs
   └─ Stats panel updates
```

### Component Interaction

**Backend Services:**
- `eventGenerator.js` → Creates synthetic DDoS events
- `eventStore.js` → Manages in-memory buffer + MongoDB
- `abuseIPDB.js` → IP enrichment with caching
- `scorer.js` → Multi-factor threat scoring
- `eventBroadcaster.js` → WebSocket management

**Frontend Components:**
- `Dashboard.jsx` → Main container, user session
- `Globe.jsx` → Three.js 3D visualization
- `useWebSocket.js` → WebSocket hook with auto-reconnect

## 📦 Installation

### Prerequisites

- Node.js v18 or higher
- MongoDB (local or Atlas)
- AbuseIPDB API key (optional but recommended)

### Backend Setup

```bash
cd backend
npm install

# Create .env file
cp .env.example .env

# Edit .env with your keys:
# PORT=5000
# ABUSEIPDB_KEY=your_key_here
# MONGODB_URI=mongodb://localhost:27017/ddos-map

npm start
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### MongoDB Setup

**Local:**
```bash
# Start MongoDB service
mongod --dbpath C:\data\db
```

**Atlas (Cloud - Free Tier):**
1. Create account at mongodb.com/cloud/atlas
2. Create M0 cluster (free)
3. Get connection string
4. Add to `backend/.env`: `MONGODB_URI=mongodb+srv://...`

## 🚀 Usage

1. **Start Backend**: `cd backend && npm start`
   - Server runs on `http://localhost:5000`
   - WebSocket available at `ws://localhost:5000/ws`

2. **Start Frontend**: `cd frontend && npm run dev`
   - UI available at `http://localhost:5173`

3. **Login/Signup**: Create account or login

4. **View Dashboard**: See real-time attacks on 3D globe

## 📡 API Documentation

### REST Endpoints

#### `GET /health`
Health check endpoint
```json
{
  "status": "ok",
  "uptime": 1234.56,
  "timestamp": "2025-11-23T...",
  "connectedClients": 5
}
```

#### `GET /events?limit=100`
Retrieve recent events
```json
{
  "events": [...],
  "total": 100
}
```

#### `GET /stats`
Aggregated statistics
```json
{
  "total": 1000,
  "topSourceCountries": [...],
  "topProtocols": [...],
  "avgPps": 50000,
  "topFingerprints": [...]
}
```

#### `GET /export?limit=1000`
Download events as CSV

### WebSocket Events

**Connection**: `ws://localhost:5000/ws`

**Message Types**:
```javascript
// Raw event (immediate)
{
  "type": "event",
  "data": {
    "id": "...",
    "src_ip": "...",
    "dst_ip": "...",
    "fingerprint": "ntp-amp",
    ...
  }
}

// Enriched event (after AbuseIPDB lookup)
{
  "type": "event_update",
  "data": {
    "id": "...",
    "abuse": { ... },
    "suspicious_score": 0.85,
    "reason": [...]
  }
}
```

## 📁 Project Structure

```
DDOS-Attack-Live-Map/
├── backend/
│   ├── config/
│   │   └── database.js          # MongoDB connection
│   ├── models/
│   │   └── Event.js             # Mongoose schema
│   ├── routes/
│   │   └── events.js            # REST API routes
│   ├── services/
│   │   ├── eventGenerator.js     # Synthetic data generation
│   │   ├── eventStore.js        # Event storage layer
│   │   ├── abuseIPDB.js         # IP reputation API
│   │   ├── scorer.js            # Threat scoring engine
│   │   └── cloudflareClient.js  # Cloudflare Radar API
│   ├── websocket/
│   │   └── eventBroadcaster.js  # WebSocket server
│   ├── index.js                 # Main server entry
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── Globe.jsx        # 3D visualization
│   │   ├── hooks/
│   │   │   └── useWebSocket.js  # WebSocket hook
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx    # Main app view
│   │   │   ├── Login.jsx
│   │   │   └── Signup.jsx
│   │   ├── utils/
│   │   │   ├── getStarfield.js  # 3D stars
│   │   │   └── threeGeoJSON.js  # Country rendering
│   │   └── App.jsx              # Root component
│   ├── public/
│   │   └── geojson/             # Country boundaries
│   ├── package.json
│   └── vite.config.js
│
└── README.md
```

## 🔧 Configuration

### Environment Variables

**Backend (`.env`):**
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/ddos-map
ABUSEIPDB_KEY=your_api_key_here
CLOUDFLARE_TOKEN=optional_token
```

### Attack Types

The system simulates 7 DDoS attack types:
- `ntp-amp` - NTP Amplification (Red)
- `dns-amp` - DNS Amplification (Orange)
- `syn-flood` - SYN Flood (Magenta)
- `udp-flood` - UDP Flood (Cyan)
- `http-flood` - HTTP Flood (Yellow)
- `ssdp-amp` - SSDP Amplification (Green)
- `chargen-amp` - Chargen Amplification (Pink)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- AbuseIPDB for IP reputation data
- Three.js for 3D rendering capabilities
- Kaspersky Cyber Threat Map for visualization inspiration

## 📞 Support

For issues and questions:
- Open an issue on GitHub
- Check existing documentation

---

**Built with ❤️ for cybersecurity visualization**
