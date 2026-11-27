import { findCountry } from './countries.js';

// Illustrative routes, used only without a Cloudflare token and always labeled as demo.
const ROUTES = [
  ['l3', 'US', 'DE', 9], ['l3', 'BR', 'US', 8], ['l3', 'VN', 'SG', 7], ['l3', 'RU', 'GB', 6],
  ['l3', 'CN', 'JP', 6], ['l3', 'ID', 'AU', 5], ['l3', 'NL', 'FR', 4], ['l3', 'ZA', 'IN', 4],
  ['l7', 'US', 'GB', 9], ['l7', 'IN', 'US', 8], ['l7', 'DE', 'BR', 7], ['l7', 'SG', 'HK', 6],
  ['l7', 'TR', 'DE', 5], ['l7', 'MX', 'ES', 4], ['l7', 'KR', 'US', 4], ['l7', 'EG', 'IT', 3],
];

export const demoTrends = () => ROUTES.map(([layer, src, dst, share]) => ({
  layer, share, src: findCountry(src), dst: findCountry(dst),
}));
