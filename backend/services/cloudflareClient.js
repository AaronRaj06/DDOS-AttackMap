import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const CLOUDFLARE_TOKEN = process.env.CLOUDFLARE_TOKEN || '';
const RADAR_API_BASE = 'https://api.cloudflare.com/client/v4/radar';

export class CloudflareRadarClient {
    constructor(apiToken) {
        this.apiToken = apiToken;
        this.axios = axios.create({
            baseURL: RADAR_API_BASE,
            headers: {
                'Authorization': `Bearer ${this.apiToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
    }

    /**
     * Get recent attack layer data
     * https://developers.cloudflare.com/api/operations/radar-get-attacks-layer3-timeseries
     */
    async getAttackTimeseries(options = {}) {
        try {
            const params = {
                dateRange: '1h', // Last hour
                aggInterval: '15m', // 15 minute intervals
                ...options
            };

            const response = await this.axios.get('/attacks/layer3/timeseries', { params });

            if (response.data.success) {
                return response.data.result;
            }

            throw new Error('Cloudflare API returned unsuccessful response');
        } catch (error) {
            console.error('Cloudflare Radar API error:', error.message);
            return null;
        }
    }

    /**
     * Get top attack sources by location
     */
    async getTopAttackLocations(options = {}) {
        try {
            const params = {
                dateRange: '1h',
                limit: 10,
                ...options
            };

            const response = await this.axios.get('/attacks/layer3/top/locations', { params });

            if (response.data.success) {
                return response.data.result;
            }

            return null;
        } catch (error) {
            console.error('Cloudflare top locations error:', error.message);
            return null;
        }
    }

    /**
     * Get attack summary
     */
    async getAttackSummary() {
        try {
            const response = await this.axios.get('/attacks/layer3/summary', {
                params: { dateRange: '1h' }
            });

            if (response.data.success) {
                return response.data.result;
            }

            return null;
        } catch (error) {
            console.error('Cloudflare summary error:', error.message);
            return null;
        }
    }

    /**
     * Check if API token is valid
     */
    async testConnection() {
        try {
            // Simple API call to verify token works
            const response = await this.axios.get('/attacks/layer3/summary', {
                params: { dateRange: '1d' }
            });

            return response.data.success === true;
        } catch (error) {
            console.error('Cloudflare connection test failed:', error.message);
            return false;
        }
    }
}

export default CloudflareRadarClient;
