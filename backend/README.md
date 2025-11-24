# DDoS Attack Map - Backend Server

Real-time DDoS attack visualization backend with WebSocket streaming, AbuseIPDB enrichment, and threat intelligence scoring.

## Features

- 🚀 **Real-time Event Streaming** via WebSocket
- 🔍 **AbuseIPDB Integration** with 24-hour IP caching
- 📊 **Intelligent Scoring** using multi-factor analysis
- 📡 **REST API** for events, stats, and CSV export
- ⚡ **Synthetic Event Generator** with realistic DDoS patterns

## Prerequisites

- Node.js v18+ 
- npm or yarn
- AbuseIPDB API key (free tier available at https://www.abuseipdb.com/)

## Installation

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file (copy from `.env.example`):
```bash
PORT=5000
ABUSEIPDB_KEY=your_api_key_here
CLOUDFLARE_TOKEN=optional
CLOUDFLARE_ACCOUNT=optional
```

4. Add your AbuseIPDB API key to the `.env` file

## Running the Server

```bash
npm start
```

Or for development:
```bash
node index.js
```

The server will start on `http://localhost:5000` with:
- REST API endpoints
- WebSocket server on `ws://localhost:5000/ws`
- Automatic event generation every 700-1200ms

## API Endpoints

### REST Endpoints

#### `GET /health`
Health check endpoint
```json
{
  "status": "ok",
  "uptime": 123.45,
  "timestamp": "2025-11-23T14:00:00.000Z",
  "connectedClients": 2
}
```

#### `GET /events?limit=100`
Get recent events (default limit: 100)
```json
{
  "success": true,
  "count": 100,
  "events": [...]
}
```

#### `GET /stats`
Get aggregated statistics
```json
{
  "success": true,
  "events": {
    "total": 500,
    "topSourceCountries": [...],
    "topProtocols": [...],
    "avgPps": 25000,
    "topFingerprints": [...]
  },
  "enrichment": {
    "totalRequests": 50,
    "cacheHits": 150,
    "cacheKeys": 45
  }
}
```

#### `GET /export?limit=100`
Export events as CSV file
- Downloads a CSV file with all event data
- Includes enrichment and scoring information

### WebSocket

#### `ws://localhost:5000/ws`
Real-time event streaming

**Message Types:**
- `connected` - Initial connection confirmation
- `event` - New raw event (phase 1: immediate)
- `event_update` - Enriched event (phase 2: after AbuseIPDB)

**Example Event Structure:**
```json
{
  "type": "event",
  "data": {
    "id": "uuid",
    "ts": "2025-11-23T14:00:00.000Z",
    "src_ip": "45.95.168.123",
    "src_country": "RU",
    "src_lat": 61.5,
    "src_lon": 105.3,
    "dst_ip": "192.168.1.1",
    "dst_country": "US",
    "dst_lat": 37.0,
    "dst_lon": -95.7,
    "proto": "UDP",
    "dst_port": 123,
    "pps": 35000,
    "packets": 1750000,
    "fingerprint": "ntp-amp",
    "tldr": "NTP-AMP attack from RU targeting US",
    "abuse": {
      "score": 75,
      "reports": 12,
      "last_reported": "2025-11-20T10:00:00.000Z"
    },
    "suspicious_score": 0.85,
    "reason": [
      "High PPS (>20k)",
      "Amplification port (123)",
      "Known abusive IP (75% confidence)"
    ]
  }
}
```

## Event Schema

Each event contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique event identifier (UUID) |
| `ts` | string | ISO timestamp |
| `src_ip` | string | Source IP address |
| `src_country` | string | Source country code |
| `src_lat` | number | Source latitude |
| `src_lon` | number | Source longitude |
| `dst_ip` | string | Destination IP |
| `dst_country` | string | Destination country code |
| `dst_lat` | number | Destination latitude |
| `dst_lon` | number | Destination longitude |
| `proto` | string | Protocol (UDP/TCP/HTTP) |
| `dst_port` | number | Destination port |
| `pps` | number | Packets per second |
| `packets` | number | Total packets |
| `fingerprint` | string | Attack type (ntp-amp, dns-amp, syn-flood, etc.) |
| `tldr` | string | Human-readable summary |
| `abuse` | object | AbuseIPDB enrichment data |
| `suspicious_score` | number | Threat score (0-1) |
| `reason` | array | Detection reasons |

## Attack Types

The generator creates realistic DDoS patterns:

- **ntp-amp** - NTP amplification (UDP:123)
- **dns-amp** - DNS amplification (UDP:53)
- **syn-flood** - SYN flood attack (TCP:80)
- **udp-flood** - Generic UDP flood
- **http-flood** - HTTP flood (HTTP:443)
- **ssdp-amp** - SSDP amplification (UDP:1900)
- **chargen-amp** - Chargen amplification (UDP:19)

## Scoring Algorithm

Events are scored using multiple factors:

1. **PPS Analysis** (60% weight)
   - Normalized packets per second
   - Threshold: >10k = medium, >20k = high, >50k = critical

2. **Port Heuristics** (10-15% weight)
   - Amplification ports (53, 123, 19, 1900)
   - High-risk ports

3. **Protocol Patterns** (5-10% weight)
   - UDP floods, SYN floods

4. **AbuseIPDB Signals** (40% weight)
   - Abuse confidence score
   - Total reports
   - Last reported date

**Final Score:** 0.0 (safe) to 1.0 (highly suspicious)

## AbuseIPDB Integration

- **Caching:** 24-hour TTL per IP
- **Rate Limiting:** Automatic handling of 429 errors
- **Graceful Degradation:** Works without API key (limited enrichment)
- **Free Tier:** 1000 requests/day

## Frontend Integration

To connect the frontend to this backend:

1. Install a WebSocket client in your frontend
2. Connect to `ws://localhost:5000/ws`
3. Listen for `event` and `event_update` messages
4. Use REST endpoints for initial data load and exports

**Example React Integration:**
```javascript
const ws = new WebSocket('ws://localhost:5000/ws');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'event' || message.type === 'event_update') {
    // Display attack on globe
    displayAttack(message.data);
  }
};
```

## Testing

### Test WebSocket Connection
Open browser console and run:
```javascript
const ws = new WebSocket('ws://localhost:5000/ws');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

### Test REST Endpoints
```bash
# Get recent events
curl http://localhost:5000/events?limit=5

# Get stats
curl http://localhost:5000/stats

# Export CSV
curl http://localhost:5000/export?limit=10 -o events.csv

# Health check
curl http://localhost:5000/health
```

## Architecture

```
┌─────────────────┐
│ Event Generator │──┐
└─────────────────┘  │
                     │
┌─────────────────┐  │    ┌──────────────┐
│  Event Store    │◀─┼───▶│ WebSocket    │──▶ Clients
│ (Circular Buf)  │  │    │ Broadcaster  │
└─────────────────┘  │    └──────────────┘
                     │
┌─────────────────┐  │
│  AbuseIPDB      │◀─┘
│  Client         │
│  (24h cache)    │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│  Scoring Engine │
└─────────────────┘
```

## Performance

- **Event Generation:** 700-1200ms intervals (~1 event/sec)
- **WebSocket Broadcasting:** <10ms latency
- **AbuseIPDB Calls:** Cached (minimal impact after warmup)
- **Memory Usage:** ~50MB with 1000 events buffer

## Troubleshooting

### No events appearing
- Check if server is running (`npm start`)
- Verify WebSocket connection in browser console
- Check server logs for errors

### AbuseIPDB enrichment not working
- Verify API key in `.env` file
- Check rate limits (1000/day on free tier)
- Look for "AbuseIPDB cache hit" messages in logs

### CORS errors
- Server allows all origins by default
- Modify `cors()` options in `index.js` if needed

## License

MIT
