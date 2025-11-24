// High-risk amplification and attack ports
const HIGH_RISK_PORTS = [53, 123, 19, 1900, 161, 389, 3389];
const AMPLIFICATION_PORTS = [53, 123, 19, 1900]; // DNS, NTP, Chargen, SSDP

export function scoreEvent(event, abuseData) {
    let score = 0;
    const reasons = [];

    // 1. PPS-based scoring (normalized 0-1, weighted 60%)
    const ppsScore = normalizePPS(event.pps);
    score += ppsScore * 0.6;

    if (event.pps > 50000) {
        reasons.push('Extremely high PPS (>50k)');
    } else if (event.pps > 20000) {
        reasons.push('High PPS (>20k)');
    } else if (event.pps > 10000) {
        reasons.push('Elevated PPS (>10k)');
    }

    // 2. Port-based heuristics
    if (AMPLIFICATION_PORTS.includes(event.dst_port)) {
        reasons.push(`Amplification port (${event.dst_port})`);
        score += 0.1;
    } else if (HIGH_RISK_PORTS.includes(event.dst_port)) {
        reasons.push(`High-risk port (${event.dst_port})`);
        score += 0.05;
    }

    // 3. Protocol-based signals
    if (event.proto === 'UDP' && event.pps > 15000) {
        reasons.push('UDP flood pattern');
        score += 0.05;
    } else if (event.proto === 'TCP' && event.fingerprint === 'syn-flood') {
        reasons.push('SYN flood detected');
        score += 0.1;
    }

    // 4. AbuseIPDB signals (weighted 40%)
    if (abuseData && !abuseData.error) {
        const abuseScore = abuseData.score / 100; // Normalize to 0-1
        score += abuseScore * 0.4;

        if (abuseData.score >= 75) {
            reasons.push(`Highly abusive IP (${abuseData.score}% confidence)`);
        } else if (abuseData.score >= 50) {
            reasons.push(`Known abusive IP (${abuseData.score}% confidence)`);
        } else if (abuseData.score >= 25) {
            reasons.push(`Potentially abusive IP (${abuseData.score}% confidence)`);
        }

        if (abuseData.reports >= 10) {
            reasons.push(`Multiple abuse reports (${abuseData.reports})`);
        } else if (abuseData.reports >= 5) {
            reasons.push(`Previously reported (${abuseData.reports} times)`);
        }
    }

    // 5. Attack fingerprint severity
    const highSeverityFingerprints = ['syn-flood', 'dns-amp', 'ntp-amp'];
    if (highSeverityFingerprints.includes(event.fingerprint)) {
        reasons.push(`Known attack pattern: ${event.fingerprint}`);
    }

    // Clamp score to 0-1 range
    score = Math.min(1, Math.max(0, score));

    return {
        suspicious_score: Number(score.toFixed(3)),
        reason: reasons.length > 0 ? reasons : ['Normal traffic pattern']
    };
}

// Normalize PPS to 0-1 scale (sigmoid-like)
// 10k PPS = 0.5, 50k+ PPS = ~1.0
function normalizePPS(pps) {
    const threshold = 10000;
    const scale = 30000;

    if (pps < threshold) {
        return (pps / threshold) * 0.3; // Low values
    }

    // Sigmoid-like curve for higher values
    const normalized = Math.min(1, (pps - threshold) / scale);
    return 0.3 + (normalized * 0.7);
}
