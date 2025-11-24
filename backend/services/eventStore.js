import Event from '../models/Event.js';

// In-memory circular buffer for storing recent events
export class EventStore {
    constructor(maxSize = 1000) {
        this.events = [];
        this.maxSize = maxSize;
    }

    addEvent(event) {
        this.events.push(event);

        // Maintain circular buffer (remove oldest if exceeds max)
        if (this.events.length > this.maxSize) {
            this.events.shift();
        }

        // Async save to MongoDB (fire-and-forget)
        this.saveToMongoDB(event).catch(err => {
            // Log error but don't block - keep in-memory buffer working
            console.error('MongoDB save error:', err.message);
        });
    }

    updateEvent(eventId, updates) {
        const index = this.events.findIndex(e => e.id === eventId);
        if (index !== -1) {
            this.events[index] = { ...this.events[index], ...updates };

            // Async update MongoDB
            this.updateMongoDBEvent(eventId, updates).catch(err => {
                console.error('MongoDB update error:', err.message);
            });

            return this.events[index];
        }
        return null;
    }

    // Save event to MongoDB
    async saveToMongoDB(event) {
        try {
            await Event.create(event);
        } catch (error) {
            // Duplicate key errors are OK (event already exists)
            if (error.code !== 11000) {
                throw error;
            }
        }
    }

    // Update event in MongoDB
    async updateMongoDBEvent(eventId, updates) {
        await Event.findOneAndUpdate(
            { id: eventId },
            { $set: updates },
            { upsert: false }
        );
    }

    getRecentEvents(limit = 100) {
        const startIndex = Math.max(0, this.events.length - limit);
        return this.events.slice(startIndex);
    }

    getAllEvents() {
        return this.events;
    }

    getStats() {
        const total = this.events.length;

        if (total === 0) {
            return {
                total: 0,
                topSourceCountries: [],
                topProtocols: [],
                avgPps: 0,
                topFingerprints: [],
            };
        }

        // Count by source country
        const countryCount = {};
        const protoCount = {};
        const fingerprintCount = {};
        let totalPps = 0;

        this.events.forEach(event => {
            // Countries
            countryCount[event.src_country] = (countryCount[event.src_country] || 0) + 1;

            // Protocols
            protoCount[event.proto] = (protoCount[event.proto] || 0) + 1;

            // Fingerprints
            fingerprintCount[event.fingerprint] = (fingerprintCount[event.fingerprint] || 0) + 1;

            // PPS
            totalPps += event.pps;
        });

        // Convert to sorted arrays
        const topSourceCountries = Object.entries(countryCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([country, count]) => ({ country, count }));

        const topProtocols = Object.entries(protoCount)
            .sort((a, b) => b[1] - a[1])
            .map(([proto, count]) => ({ proto, count }));

        const topFingerprints = Object.entries(fingerprintCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([fingerprint, count]) => ({ fingerprint, count }));

        return {
            total,
            topSourceCountries,
            topProtocols,
            avgPps: Math.round(totalPps / total),
            topFingerprints,
        };
    }
}
