import { BlockList, isIP } from 'node:net';

const reserved = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) reserved.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001::', 23],
  ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) reserved.addSubnet(address, prefix, 'ipv6');

// Private, loopback, link-local, documentation, multicast and other special-use ranges are not
// public. IPv4-mapped IPv6 addresses are checked against the IPv4 ranges.
export function isPublicIP(ip) {
  const version = isIP(ip);
  if (!version || ip.includes('%')) return false;
  return !reserved.check(ip, version === 4 ? 'ipv4' : 'ipv6');
}

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
