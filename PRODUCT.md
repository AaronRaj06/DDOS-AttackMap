# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, weighted equally (confirmed 2026-11-27):

- **Reviewers of the project:** recruiters and engineers who open the link and judge the work in a minute or two. They need to see quickly what is real, how it works and how well it is built.
- **Operators:** network and security staff watching denial-of-service trends for spikes, on a second screen or a wall display (kiosk mode), for long stretches.

## Product Purpose

A real-time globe of denial-of-service trends. It replays country-to-country attack routes from Cloudflare Radar, plots abusive IPs from AbuseIPDB at their approximate location, detects traffic spikes from Radar timeseries, and can train a classifier that ranks which reported networks are likely DoS sources. Success: a reviewer understands and trusts it at first glance, and an operator can leave it running and notice a spike.

## Positioning

It is honest about its data. Radar routes and AbuseIPDB IPs are drawn separately and never joined into fake attacker-to-victim pairs; network-layer origins are labelled as the data-centre country that received the traffic; demo data is always labelled as demo. Most "live attack maps" animate invented attacks. This one shows what the sources actually support, and says so on screen.

## Operating Context

- Runs without API keys in a labelled demo mode; with a Cloudflare Radar token and an AbuseIPDB key it shows live trends.
- Data cadence: Radar every 15 minutes (lags up to ~15 minutes), AbuseIPDB every 6 hours.
- Kiosk mode for wall displays; CSV export; Slack-compatible spike webhooks; Prometheus `/metrics`.
- Offline IP and ASN lookup using DB-IP Lite on disk; nothing sent to a third party.

## Capabilities and Constraints

- Stack: Node.js + Express 5 + `ws` backend, React 19 + Vite + Three.js frontend, one Docker image.
- Surfaces: the dashboard (globe or flat map, status tiles, filters, timeline with spike replay, sidebar panels). A showcase page, the scroll-driven tour at `/tour`, was added on 2026-11-27 (README → The tour).
- Carried over from the repo, enforced by tests, not re-confirmed by the user on 2026-11-27: 44px targets and WCAG AA contrast (axe e2e), colour-blind-safe layer and severity colours that never rely on colour alone (token tests), no third-party font downloads (CSP), the coral `#ff6b6b` brand accent.

## Brand Commitments

- Name: Global DoS Attack Map.
- Voice: plain, exact, never alarmist; says what the data does and does not mean.

## Evidence on Hand

- Real data only when tokens are configured; otherwise built-in illustrative routes, always labelled.
- Assets: `frontend/public/favicon.svg`, `frontend/public/og.png`, `frontend/public/geojson/`, `docs/screenshot.jpg` (refreshed 2026-11-27).
- No testimonials, users, benchmarks or deployment claims exist. Do not invent them.

## Product Principles

1. Never show more certainty than the data has.
2. Readable at a glance from across a room, precise up close.
3. Everything reachable without a pointer and without colour.
4. Real by default, demo clearly labelled.

## Accessibility & Inclusion

WCAG 2.2 AA, 44px targets, reduced-motion toggle as well as the OS setting, screen-reader announcements for status changes only.
