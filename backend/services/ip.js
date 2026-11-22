import { isIP } from 'node:net';

// /24 for IPv4, /48 for IPv6: used for public output and for leak-free dataset splits.
export function networkOf(ip) {
  const version = isIP(ip);
  if (version === 4) return `${ip.split('.').slice(0, 3).join('.')}.0/24`;
  if (version !== 6) throw new Error('Not an IP address');

  const hex = ip.split('%')[0].replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/, (_, a, b, c, d) =>
    `${((+a << 8) | +b).toString(16)}:${((+c << 8) | +d).toString(16)}`);
  const [head, tail] = hex.split('::').map((part) => (part ? part.split(':') : []));
  const groups = tail ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail] : head;
  return `${groups.slice(0, 3).map((group) => parseInt(group, 16).toString(16)).join(':')}::/48`;
}

// Walks X-Forwarded-For from the right, by the number of proxies we were told to trust.
export function clientIP(request, trustedHops) {
  const remote = request.socket.remoteAddress;
  if (!trustedHops) return remote;
  const forwarded = (request.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const chain = [...forwarded, remote];
  return chain[Math.max(0, chain.length - 1 - trustedHops)];
}
