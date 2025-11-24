import express from 'express';
import { createObjectCsvStringifier } from 'csv-writer';

const router = express.Router();

// Inject dependencies
let eventStore, abuseIPDBClient;

export function initializeRoutes(store, abuseClient) {
    eventStore = store;
    abuseIPDBClient = abuseClient;
}

// GET /events?limit=100
router.get('/events', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const events = eventStore.getRecentEvents(limit);

        res.json({
            success: true,
            count: events.length,
            events: events
        });
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch events'
        });
    }
});

// GET /stats
router.get('/stats', (req, res) => {
    try {
        const stats = eventStore.getStats();
        const abuseStats = abuseIPDBClient.getStats();

        res.json({
            success: true,
            events: stats,
            enrichment: abuseStats
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics'
        });
    }
});

// GET /export?limit=100
router.get('/export', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const events = eventStore.getRecentEvents(limit);

        // Define CSV columns
        const csvStringifier = createObjectCsvStringifier({
            header: [
                { id: 'id', title: 'Event ID' },
                { id: 'ts', title: 'Timestamp' },
                { id: 'src_ip', title: 'Source IP' },
                { id: 'src_country', title: 'Source Country' },
                { id: 'src_lat', title: 'Source Latitude' },
                { id: 'src_lon', title: 'Source Longitude' },
                { id: 'dst_ip', title: 'Destination IP' },
                { id: 'dst_country', title: 'Destination Country' },
                { id: 'dst_lat', title: 'Destination Latitude' },
                { id: 'dst_lon', title: 'Destination Longitude' },
                { id: 'proto', title: 'Protocol' },
                { id: 'dst_port', title: 'Destination Port' },
                { id: 'pps', title: 'Packets Per Second' },
                { id: 'packets', title: 'Total Packets' },
                { id: 'fingerprint', title: 'Attack Fingerprint' },
                { id: 'suspicious_score', title: 'Suspicious Score' },
                { id: 'abuse_score', title: 'AbuseIPDB Score' },
                { id: 'abuse_reports', title: 'Abuse Reports' },
                { id: 'reasons', title: 'Detection Reasons' },
            ]
        });

        // Flatten events for CSV
        const records = events.map(event => ({
            id: event.id,
            ts: event.ts,
            src_ip: event.src_ip,
            src_country: event.src_country,
            src_lat: event.src_lat,
            src_lon: event.src_lon,
            dst_ip: event.dst_ip,
            dst_country: event.dst_country,
            dst_lat: event.dst_lat,
            dst_lon: event.dst_lon,
            proto: event.proto,
            dst_port: event.dst_port,
            pps: event.pps,
            packets: event.packets,
            fingerprint: event.fingerprint,
            suspicious_score: event.suspicious_score || 0,
            abuse_score: event.abuse?.score || 0,
            abuse_reports: event.abuse?.reports || 0,
            reasons: event.reason ? event.reason.join('; ') : '',
        }));

        const csvHeader = csvStringifier.getHeaderString();
        const csvBody = csvStringifier.stringifyRecords(records);
        const csv = csvHeader + csvBody;

        // Set headers for file download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=ddos_events_${Date.now()}.csv`);
        res.send(csv);

        console.log(`📥 CSV export: ${records.length} events`);
    } catch (error) {
        console.error('Error generating CSV:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate CSV export'
        });
    }
});

export default router;
