import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { connectDB } from './config/database.js';
import { EventStore } from './services/eventStore.js';
import { EventGenerator } from './services/eventGenerator.js';
import { AbuseIPDBClient } from './services/abuseIPDB.js';
import { scoreEvent } from './services/scorer.js';
import { EventBroadcaster } from './websocket/eventBroadcaster.js';
import eventsRouter, { initializeRoutes } from './routes/events.js';

const PORT = process.env.PORT || 5000;
const ABUSEIPDB_KEY = process.env.ABUSEIPDB_KEY || '';

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
    origin: '*', // Allow all origins for development
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());

// Initialize core services
const eventStore = new EventStore(1000);
const abuseIPDBClient = new AbuseIPDBClient(ABUSEIPDB_KEY);
const broadcaster = new EventBroadcaster(server);

// Initialize routes with dependencies
initializeRoutes(eventStore, abuseIPDBClient);
app.use('/', eventsRouter);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        connectedClients: broadcaster.getClientCount()
    });
});

// Enrichment and scoring pipeline
async function enrichAndScore(event) {
    try {
        // Get AbuseIPDB enrichment
        const abuseData = await abuseIPDBClient.checkIP(event.src_ip);

        // Add abuse data to event
        event.abuse = abuseData;

        // Calculate suspicious score
        const scoring = scoreEvent(event, abuseData);
        event.suspicious_score = scoring.suspicious_score;
        event.reason = scoring.reason;

        // Update event in store
        eventStore.updateEvent(event.id, {
            abuse: abuseData,
            suspicious_score: scoring.suspicious_score,
            reason: scoring.reason
        });

        // Broadcast enriched event
        broadcaster.broadcast({
            type: 'event_update',
            data: event
        });

        // Log high-risk events
        if (scoring.suspicious_score > 0.7) {
            console.log(`🚨 HIGH RISK: ${event.fingerprint} from ${event.src_ip} (score: ${scoring.suspicious_score})`);
        }
    } catch (error) {
        console.error(`Error enriching event ${event.id}:`, error.message);
    }
}

// Custom event generator that includes enrichment
class EnrichedEventGenerator extends EventGenerator {
    constructor(broadcaster, eventStore) {
        super(broadcaster, eventStore);
    }

    start() {
        if (this.isRunning) {
            console.log('Generator already running');
            return;
        }

        this.isRunning = true;
        console.log('🚀 Enriched event generator started');

        const generateAndBroadcast = async () => {
            const { generateEvent } = await import('./services/eventGenerator.js');
            const event = generateEvent();

            // Add to store
            this.eventStore.addEvent(event);

            // Broadcast raw event immediately (phase 1: low latency)
            this.broadcaster.broadcast({
                type: 'event',
                data: event
            });

            // Async enrichment and scoring (phase 2: enriched data)
            enrichAndScore(event);

            // Schedule next event (700-1200ms interval)
            const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
            const nextInterval = randomInt(700, 1200);
            this.intervalId = setTimeout(generateAndBroadcast, nextInterval);
        };

        // Start the first event
        generateAndBroadcast();
    }
}

// Initialize and start event generator
const eventGenerator = new EnrichedEventGenerator(broadcaster, eventStore);

// Start server
server.listen(PORT, async () => {
    console.log('\n🌐 ========================================');
    console.log(`   DDoS Attack Map Backend Server`);
    console.log('   ========================================');
    console.log(`   🚀 Server running on port ${PORT}`);
    console.log(`   📡 REST API: http://localhost:${PORT}`);
    console.log(`   🔌 WebSocket: ws://localhost:${PORT}/ws`);
    console.log('   ========================================\n');

    // Connect to MongoDB
    await connectDB();

    if (!ABUSEIPDB_KEY || ABUSEIPDB_KEY === '') {
        console.log('   ⚠️  WARNING: No AbuseIPDB API key configured!');
        console.log('   Add ABUSEIPDB_KEY to .env file for enrichment.\n');
    } else {
        console.log('   ✓ AbuseIPDB API key configured\n');
    }

    // Start event generator
    eventGenerator.start();

    console.log('   📊 Available endpoints:');
    console.log('   - GET  /health');
    console.log('   - GET  /events?limit=100');
    console.log('   - GET  /stats');
    console.log('   - GET  /export?limit=100');
    console.log('   - WS   /ws\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⏸️  Shutting down gracefully...');
    eventGenerator.stop();
    server.close(() => {
        console.log('✓ Server closed');
        process.exit(0);
    });
});
