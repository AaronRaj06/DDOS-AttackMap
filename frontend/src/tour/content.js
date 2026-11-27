// Every word of the tour lives here. The 2D page reads it now; the 3D scenes read the same entries later.
// Each claim matches README.md ("What is real", "Spike detection", "The classifier"). Change both together.

export const intro = {
  title: 'Global DoS Attack Map',
  subtitle: 'Denial-of-service trends from Cloudflare Radar and abusive IPs from AbuseIPDB, drawn only as far as the data goes.',
  liveMap: 'Open live map',
  howItWorks: 'How it works',
  enter3D: 'Enter 3D anyway',
};

// The tour in order. `nav` is the short label in the pipeline bar; `diagram` names a figure in Fallback.jsx.
export const steps = [
  {
    id: 'invented',
    nav: null, // the prologue, not a pipeline step
    heading: 'Most attack maps make things up',
    body: [
      'Many “live attack maps” animate arcs from everywhere to everywhere. Those individual attacks are invented: no public source publishes who is attacking whom, live, by IP.',
      'This map only draws what its sources support, and says on screen what each mark means.',
    ],
    diagram: 'invented',
  },
  {
    id: 'radar',
    nav: 'Radar',
    heading: 'Cloudflare Radar: shares of traffic, not single attacks',
    body: [
      'Every 15 minutes the server asks Radar for the last 24 hours of country-to-country attack routes. Each route comes with its share of the traffic, and the map replays arcs in proportion to those shares.',
      'For network-layer attacks, the origin is the Cloudflare data-centre country that received the traffic, not the attacker’s country. Source IPs in these attacks can be spoofed, so Radar does not claim where the attacker is, and neither does this map.',
    ],
    points: [
      'An arc is a share of traffic over 24 hours, not one live attack.',
      'Radar data lags by up to about 15 minutes.',
    ],
    legend: { points: false, flagged: false },
  },
  {
    id: 'abuse',
    nav: 'AbuseIPDB',
    heading: 'AbuseIPDB: reported networks',
    body: [
      'Every 6 hours the server downloads the AbuseIPDB blacklist, up to 10,000 IPs, and caches it on disk. Each IP is shown as its /24 or /48 network, never as the exact address.',
      'Locations come from the DB-IP Lite databases on disk, so no address is sent to a third party. They are approximate, often only city-level, and wrong for mobile or proxied addresses.',
    ],
    points: ['These IPs were reported for any kind of abuse, not only denial of service.'],
    legend: { points: true, flagged: false },
  },
  {
    id: 'classifier',
    nav: 'Classifier',
    heading: 'The classifier: a reason, not a verdict',
    body: [
      'The question: will this listed IP get a “DDoS Attack” report (AbuseIPDB category 4)? Checking costs one API call per IP, and the free tier allows 1,000 a day against a blacklist of up to 10,000. A logistic regression scores all of them from data that costs no extra calls.',
      'It looks at IP version, country, autonomous system, hosting or access-ISP words in the network name, and time since the last report. Report categories are the label, never a feature.',
      'For any listed network, GET /threats/{network} returns the three factors that moved its score most and what the rest add up to. The score is exactly sigmoid(bias + those factors + the rest), and a test checks it.',
    ],
    points: [
      'Networks the model ranks as likely DoS sources are drawn as rings; the rest stay discs, so the difference never depends on colour.',
      'Flags appear only after the model is trained on this server. Training refuses to save a model whose average precision is under 1.2 times the positive rate.',
    ],
    legend: { points: true, flagged: true },
    diagram: 'factors',
  },
  {
    id: 'separate',
    nav: 'Separate layers',
    heading: 'Two layers that never join',
    body: [
      'Radar publishes no IPs. AbuseIPDB publishes no victims. So the two are drawn as separate layers and never joined into attacker-to-victim pairs that neither source supports.',
    ],
    diagram: 'separate',
  },
  {
    id: 'spikes',
    nav: 'Spike detection',
    heading: 'Spike detection',
    body: [
      'Radar’s network-layer and application-layer series arrive in 15-minute buckets. Each new point gets a robust z-score against the median and MAD of the previous 24 hours, on a log scale, because traffic noise is multiplicative.',
      'A spike starts after 2 points in a row at z ≥ 3.5, or 1 point at z ≥ 6, and ends when z drops below 2. Points inside a spike stay out of the baseline, and gaps are never filled in.',
    ],
    points: [
      'A statistical estimate, not a Cloudflare alert.',
      'On bursty traffic it misses moderate surges, because bursts that size are ordinary there.',
    ],
    diagram: 'spike',
    outputs: [
      { name: 'Slack-compatible webhook', detail: 'One message per spike, at most one every 30 minutes. Names the layer, how far above normal it is and when it began. Never an IP or a key.' },
      { name: 'Prometheus /metrics', detail: 'Behind a bearer token: source freshness, source state, active spikes, WebSocket clients and memory.' },
      { name: 'CSV export', detail: 'GET /export returns recently replayed events as a spreadsheet.' },
    ],
  },
  {
    id: 'built',
    nav: 'Built to last',
    heading: 'Built to last',
    stations: [
      { name: 'Docker', detail: 'One image serves the API, the WebSocket and the interface.' },
      { name: 'CI', detail: 'GitHub Actions runs every test, a dependency audit and a container health check on each pull request and each push to main.' },
      { name: 'Tests', detail: 'node:test for the backend and frontend logic, Playwright in a real browser, and an axe-core accessibility audit.' },
      { name: 'Accessibility', detail: 'WCAG 2.2 AA contrast, 44 px targets, colour-blind-safe colours that never carry meaning alone, and a reduced-motion switch.' },
      { name: 'Kiosk mode', detail: 'A wall-display view for operators who leave it running and need to notice a spike from across the room.' },
      { name: 'Offline IP lookup', detail: 'Location and network owner from databases on disk. Nothing is sent to a third party.' },
    ],
  },
  {
    id: 'live',
    nav: 'Live map',
    heading: 'Now the real thing',
    body: [
      'The live map shows all of this at once: Radar routes, reported networks, the spike status and timeline. Without API keys it runs in a demo mode that says so on screen.',
    ],
    cta: true,
  },
];

// Figures in the 2D page are drawings of the idea, not data, and say so.
export const illustrative = 'Illustrative diagram, not live data';

// For the factor figure: one made-up network, worded like a real GET /threats/{network} answer.
export const exampleFactors = [
  { label: 'Network name suggests hosting or cloud', value: 0.9 },
  { label: 'Reported within the last day', value: 0.6 },
  { label: 'Autonomous system', value: -0.4 },
  { label: 'Everything else', value: 0.2 },
];

// ---- Copy used only by the 3D tour ----

// Every scene that draws data says where it came from
export const badges = {
  live: 'live',
  illustrative: 'illustrative',
  invented: 'invented: what most maps show',
};

export const scenes = {
  loading: 'Drawing the world map…',
  radarTick: 'Radar is asked again every 15 minutes',
  origin: {
    heading: 'Where a network-layer attack “comes from”',
    struck: 'the attacker’s country',
    label: 'the Cloudflare data-centre country that received the traffic',
    reason: 'Source IPs in these attacks can be spoofed, so neither Radar nor this map claims to know where the attacker is.',
  },
  abuseCount: (count) => `${count.toLocaleString('en')} reported networks on the globe.`,
  classifier: {
    question: 'Will this listed IP get a “DDoS Attack” report?',
    untrained: 'The model has not been trained on this server, so these five networks and their scores are illustrative.',
    networks: 'Networks to inspect',
    likely: 'likely DoS source',
    unlikely: 'below the threshold',
    other: 'Everything else',
    verdict: 'Each factor raises or lowers the score: a reason, not a verdict.',
  },
  spikes: {
    replay: 'Replay',
    replaying: 'Replaying…',
    normal: 'typical level the detector compared against',
    spike: (ratio) => (ratio ? `spike: about ${ratio}x typical` : 'spike'),
    none: 'No spike in this window: the series stayed within its normal range.',
    layer: (name, days) => `${name}, last ${days} days, 15-minute buckets.`,
  },
  outputsHeading: 'What a spike produces',
  handoff: 'The camera is back where the live map opens.',
  separate: {
    outer: 'Radar routes, lifted onto their own layer',
    inner: 'AbuseIPDB networks, on the globe',
    refused: 'A line joining the two is refused: neither source supports it.',
  },
};

// What each output really looks like. test/tour.test.js checks the webhook text and the metric lines
// against the server's own formatters, so these cannot drift from what the server sends.
export const exampleSpike = { layer: 'l3', start: '2026-11-27T09:15:00.000Z', peakZ: 7.2, ratio: 3 };
export const outputExamples = {
  'Slack-compatible webhook': '{"text": "Traffic spike on Cloudflare Radar: Network layer (L3/4) attack volume is about 3x its recent typical level (z-score 7.2), since 2026-11-27 09:15 UTC. Country-level data, delayed by up to about 15 minutes."}',
  'Prometheus /metrics': 'dosmap_active_spikes{layer="l3"} 1\ndosmap_active_spikes{layer="l7"} 0\ndosmap_source_state{source="radar",state="ok"} 1',
  'CSV export': 'Event ID,Replayed At,Source,Layer,Share Within Layer (%),Origin Country,…',
};
