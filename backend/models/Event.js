import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
    // Event ID
    id: { type: String, required: true, unique: true, index: true },

    // Timestamp
    ts: { type: Date, required: true, index: true },

    // Source information
    src_ip: { type: String, required: true, index: true },
    src_country: String,
    src_lat: Number,
    src_lon: Number,

    // Destination information
    dst_ip: { type: String, required: true },
    dst_country: String,
    dst_lat: Number,
    dst_lon: Number,

    // Attack details
    proto: { type: String, index: true },
    dst_port: Number,
    pps: { type: Number, index: true },
    packets: Number,
    fingerprint: { type: String, index: true },
    tldr: String,

    // AbuseIPDB enrichment
    abuse: {
        score: Number,
        reports: Number,
        last_reported: Date,
        error: String
    },

    // Cloudflare enrichment (optional)
    cf: mongoose.Schema.Types.Mixed,

    // Scoring
    suspicious_score: { type: Number, index: true },
    reason: [String],
}, {
    timestamps: true, // Adds createdAt and updatedAt
    collection: 'events'
});

// TTL index - auto-delete events after 30 days
eventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Compound indexes for common queries
eventSchema.index({ ts: -1, suspicious_score: -1 });
eventSchema.index({ src_country: 1, ts: -1 });
eventSchema.index({ fingerprint: 1, ts: -1 });

const Event = mongoose.model('Event', eventSchema);

export default Event;
