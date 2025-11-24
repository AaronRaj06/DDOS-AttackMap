import axios from 'axios';
import NodeCache from 'node-cache';

// Cache IP enrichment results for 24 hours (86400 seconds)
const cache = new NodeCache({ stdTTL: 86400 });

const ABUSEIPDB_API_URL = 'https://api.abuseipdb.com/api/v2/check';

export class AbuseIPDBClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.requestCount = 0;
        this.cacheHits = 0;
    }

    async checkIP(ip) {
        // Check cache first
        const cached = cache.get(ip);
        if (cached) {
            this.cacheHits++;
            console.log(`✓ AbuseIPDB cache hit for ${ip} (${this.cacheHits} total cache hits)`);
            return cached;
        }

        // If no API key, return empty enrichment
        if (!this.apiKey || this.apiKey === '') {
            return {
                score: 0,
                reports: 0,
                last_reported: null,
                error: 'No API key configured'
            };
        }

        try {
            this.requestCount++;
            console.log(`🔍 AbuseIPDB API call for ${ip} (request #${this.requestCount})`);

            const response = await axios.get(ABUSEIPDB_API_URL, {
                params: {
                    ipAddress: ip,
                    maxAgeInDays: 90,
                    verbose: false
                },
                headers: {
                    'Key': this.apiKey,
                    'Accept': 'application/json'
                },
                timeout: 5000
            });

            const data = response.data.data;
            const enrichment = {
                score: data.abuseConfidenceScore || 0,
                reports: data.totalReports || 0,
                last_reported: data.lastReportedAt || null,
            };

            // Cache the result
            cache.set(ip, enrichment);
            console.log(`✓ AbuseIPDB enrichment for ${ip}: score=${enrichment.score}, reports=${enrichment.reports}`);

            return enrichment;

        } catch (error) {
            // Handle rate limiting
            if (error.response?.status === 429) {
                console.warn(`⚠️  AbuseIPDB rate limit reached for ${ip}`);
                const rateLimitResult = {
                    score: 0,
                    reports: 0,
                    last_reported: null,
                    error: 'Rate limit exceeded'
                };
                // Cache the error result briefly (5 minutes)
                cache.set(ip, rateLimitResult, 300);
                return rateLimitResult;
            }

            // Handle other errors
            console.error(`❌ AbuseIPDB error for ${ip}:`, error.message);
            const errorResult = {
                score: 0,
                reports: 0,
                last_reported: null,
                error: error.message
            };
            return errorResult;
        }
    }

    getStats() {
        return {
            totalRequests: this.requestCount,
            cacheHits: this.cacheHits,
            cacheKeys: cache.keys().length
        };
    }
}
