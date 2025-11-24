import { v4 as uuidv4 } from 'uuid';

// Sample data for realistic events
const ATTACK_TYPES = [
    { fingerprint: 'ntp-amp', proto: 'UDP', port: 123, ppsRange: [15000, 50000] },
    { fingerprint: 'dns-amp', proto: 'UDP', port: 53, ppsRange: [20000, 60000] },
    { fingerprint: 'syn-flood', proto: 'TCP', port: 80, ppsRange: [30000, 100000] },
    { fingerprint: 'udp-flood', proto: 'UDP', port: 0, ppsRange: [10000, 40000] },
    { fingerprint: 'http-flood', proto: 'HTTP', port: 443, ppsRange: [5000, 25000] },
    { fingerprint: 'ssdp-amp', proto: 'UDP', port: 1900, ppsRange: [12000, 45000] },
    { fingerprint: 'chargen-amp', proto: 'UDP', port: 19, ppsRange: [8000, 30000] },
];

const COUNTRIES = [
    { code: 'US', name: 'United States', lat: 37.09024, lon: -95.712891 },
    { code: 'CN', name: 'China', lat: 35.86166, lon: 104.195397 },
    { code: 'RU', name: 'Russia', lat: 61.52401, lon: 105.318756 },
    { code: 'BR', name: 'Brazil', lat: -14.235004, lon: -51.92528 },
    { code: 'IN', name: 'India', lat: 20.593684, lon: 78.96288 },
    { code: 'DE', name: 'Germany', lat: 51.165691, lon: 10.451526 },
    { code: 'GB', name: 'United Kingdom', lat: 55.378051, lon: -3.435973 },
    { code: 'FR', name: 'France', lat: 46.227638, lon: 2.213749 },
    { code: 'KR', name: 'South Korea', lat: 35.907757, lon: 127.766922 },
    { code: 'JP', name: 'Japan', lat: 36.204824, lon: 138.252924 },
];

// Some known abusive IPs for dramatic demo effect
const KNOWN_ABUSIVE_IPS = [
    '45.95.168.0', '185.156.73.0', '91.92.109.0', '188.166.0.0',
    '103.253.145.0', '194.67.209.0', '185.220.101.0'
];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateIP(useAbusive = false) {
    if (useAbusive && Math.random() < 0.3) {
        // 30% chance to use a known abusive IP
        const baseIP = randomChoice(KNOWN_ABUSIVE_IPS);
        const parts = baseIP.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}.${randomInt(1, 254)}`;
    }
    return `${randomInt(1, 223)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

function generateLocation() {
    const country = randomChoice(COUNTRIES);
    // Add some randomness to coordinates
    const latVariance = randomFloat(-5, 5);
    const lonVariance = randomFloat(-5, 5);
    return {
        country: country.code,
        lat: country.lat + latVariance,
        lon: country.lon + lonVariance,
    };
}

export function generateEvent() {
    const attackType = randomChoice(ATTACK_TYPES);
    const srcLocation = generateLocation();
    const dstLocation = generateLocation();

    const ppsMin = attackType.ppsRange[0];
    const ppsMax = attackType.ppsRange[1];
    const pps = randomInt(ppsMin, ppsMax);

    // Duration in seconds (assume event has been ongoing)
    const duration = randomInt(5, 300);
    const packets = pps * duration;

    const event = {
        id: uuidv4(),
        ts: new Date().toISOString(),
        src_ip: generateIP(true), // Use potentially abusive IPs
        src_country: srcLocation.country,
        src_lat: srcLocation.lat,
        src_lon: srcLocation.lon,
        dst_ip: generateIP(false),
        dst_country: dstLocation.country,
        dst_lat: dstLocation.lat,
        dst_lon: dstLocation.lon,
        proto: attackType.proto,
        dst_port: attackType.port === 0 ? randomInt(1024, 65535) : attackType.port,
        pps: pps,
        packets: packets,
        fingerprint: attackType.fingerprint,
        tldr: `${attackType.fingerprint.toUpperCase()} attack from ${srcLocation.country} targeting ${dstLocation.country}`,
    };

    return event;
}

export class EventGenerator {
    constructor(broadcaster, eventStore) {
        this.broadcaster = broadcaster;
        this.eventStore = eventStore;
        this.intervalId = null;
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) {
            console.log('Generator already running');
            return;
        }

        this.isRunning = true;
        console.log('🚀 Event generator started');

        const generateAndBroadcast = () => {
            const event = generateEvent();

            // Add to store
            this.eventStore.addEvent(event);

            // Broadcast immediately (raw event)
            this.broadcaster.broadcast({
                type: 'event',
                data: event
            });

            console.log(`📡 Generated event: ${event.fingerprint} from ${event.src_ip} (${event.src_country})`);

            // Schedule next event (700-1200ms interval)
            const nextInterval = randomInt(700, 1200);
            this.intervalId = setTimeout(generateAndBroadcast, nextInterval);
        };

        // Start the first event
        generateAndBroadcast();
    }

    stop() {
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('⏸️  Event generator stopped');
    }

    getStatus() {
        return {
            running: this.isRunning,
        };
    }
}
