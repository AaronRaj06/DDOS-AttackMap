# Build Brief: "Follow the Data", a 3D `/tour` for the Global DoS Attack Map

You are adding a scroll-driven 3D showcase page, `/tour`, to an existing, working project: the Global DoS Attack Map
(Node.js + Express 5 + `ws` backend, React 19 + Vite + Three.js frontend). Read this whole brief and the files listed
in section 2 before writing code. Build in the phases in section 10 and **stop after each phase for review**.

You are not rebuilding the dashboard. The dashboard at `/` is finished, tested and stays exactly as it is.

---

## 1. The concept

Most "live attack maps" animate made-up attacks. This one refuses to. The tour turns that refusal into the story.

The visitor follows the data through the real pipeline, scene by scene: what Cloudflare Radar actually publishes,
what AbuseIPDB actually publishes, why the two are never joined, how the classifier scores a network, and how a
spike is detected. The tour ends by flying into the globe and handing over to the live dashboard.

**Audience:** reviewers (recruiters, engineers, judges) who give the project one or two minutes. When they reach the
end they should know three things: what is real, how it works, and that it is built carefully.

**Tone:** plain, exact, never alarmist (see `PRODUCT.md` → Brand Commitments). Dark and cinematic, but restrained.
The motion explains things; it is not decoration. No neon overload, no "hacker" clichés, no scanlines, no glitch text.

**The one rule above all others:** *never show more certainty than the data has* (`PRODUCT.md` → Product
Principles). Every arc, dot and number in the tour is either real data from the running backend or is labelled
`illustrative` on screen. Anything that breaks this rule is a bug, however good it looks.

---

## 2. Read these first

| File | Why |
|---|---|
| `PRODUCT.md` | Audiences, positioning, principles, accessibility commitments |
| `README.md` → "What is real", "Spike detection", "The classifier", "Architecture" | The facts every scene must match |
| `docs/design-system.md`, `frontend/src/styles/tokens.css` | The only colours, type and spacing you may use |
| `frontend/src/utils/globeScene.js` | `createGlobe(element, { reducedMotion, onHover, onSelect })` returns `{ addArc, setThreats, setHighlight, setPaused, setReducedMotion, rotate, zoom, dispose }` |
| `frontend/src/utils/geo.js`, `layers.js`, `labels.js` | `toXYZ`, `arcPoints`, layer colours and labels; reuse them, never duplicate them |
| `backend/app.js`, `backend/routes/events.js` | Endpoints: `/health`, `/stats`, `/threats`, `/threats/:network`, `/timeline`, `/export`, `/metrics`; helmet CSP |
| `frontend/test/tokens.test.js`, `frontend/e2e/a11y.spec.js` | The guards your code must pass |

If anything in this brief contradicts the code or the README, **the code and README win**. Tell me about the
contradiction instead of working around it.

---

## 3. Tech decisions (fixed)

- **Same stack as the dashboard.** React 19 + plain Three.js through `createGlobe`. **No React Three Fiber, no
  drei, no postprocessing.** One renderer, one globe implementation.
- **Extend `createGlobe`; don't fork it.** The tour needs camera control. Add the smallest API that does the job
  (for example `setView({ lat, lon, distance }, { duration })` and `setLayerVisible(layer, bool)`). The dashboard
  must behave the same, and every existing test must still pass.
- **Scroll:** native scroll with `position: sticky` stages and one `scroll` handler (or `IntersectionObserver`)
  turning progress (0→1 per scene) into globe and caption state. Add **no new runtime dependency** unless you
  show it is needed. If you add GSAP, explain why and show the bundle size before and after.
- **Routing:** the app has no router and doesn't need one. Make `/tour` a second Vite entry (`tour.html` or
  `tour/index.html`) so Express's existing `express.static` serves it without a new backend route. Add Vite dev
  proxy entries for any endpoint the tour fetches (`/stats`, `/threats`, `/timeline`, and so on).
- **CSP:** helmet's defaults apply. No CDN scripts, no third-party fonts, no inline `<script>`. Everything is bundled.
- **Language:** JavaScript + JSX, like the rest of `frontend/src`. No TypeScript migration.

---

## 4. Code rules

- Readable, human-sized code. No scene "engine", no factories, no abstraction built for later.
- One file per scene in `frontend/src/tour/scenes/` (for example `Radar.jsx`), plus `frontend/src/tour/Tour.jsx`.
- **All tour copy lives in `frontend/src/tour/content.js`.** Scenes and the 2D fallback both read from it.
- **Colours only from `tokens.css` variables.** The token test fails on raw colours in component styles; keep it
  that way. For Three.js materials, read colours through the existing `cssColor` / `layerColor` helpers.
- **Never rely on colour alone.** Layers and severities also differ by shape, label or pattern, as in the dashboard
  (for example classifier picks are rings and other networks are discs).
- **No hand-typed numbers about the project.** Don't hard-code test counts, file counts or accuracy figures. Read
  them at build time from the repo, or fetch them from the backend (such as the model card), or leave them out.

---

## 5. Data: live or illustrative, always labelled

On load, the tour calls `/health`.

- `mode: "live"`: scenes use real `/stats`, `/threats`, `/threats/:network` and `/timeline` data. Show a small
  `live` badge with the data's age (for example "Radar updated 6 min ago").
- `mode: "demo"`, a failed request, or a missing source: use the built-in illustrative data, and every affected
  scene shows a visible `illustrative` badge, worded as in the dashboard's demo notice.
- Classifier untrained (the model card or health check says so): Scene 4 uses illustrative scores, labelled as
  such, and says "the model has not been trained on this server".
- Never mix sources silently. If one scene is live and another illustrative, each shows its own badge.

---

## 6. Persistent UI (over the canvas)

1. **Pipeline bar** (top): the README's flow as clickable steps:
   `Radar → AbuseIPDB → Classifier → Separate layers → Spike detection → Built to last → Live map`.
   The current step is highlighted (with a marker as well as colour) and announced politely to screen readers.
   Clicking or pressing Enter on a step scrolls to it.
2. **"Open live map →"** (top-right, always visible): goes to `/`. A reviewer must reach the real product in one click.
3. **Data badge**: `live · updated N min ago` or `illustrative`, as in section 5.
4. **Motion toggle**: respects `prefers-reduced-motion` and also has its own switch, as the dashboard does.

---

## 7. Storyboard

The scroll ranges are a starting point; tune them by feel. Every caption is short, plain and true.

### Scene 0: Hero (before scrolling)
- The globe draws itself in: grid lines first, then land outlines (from `public/geojson`), then the opaque core.
- Title **Global DoS Attack Map**, one-line subtitle from `content.js`, and two buttons: **Open live map** and
  **How it works ↓**.
- The loader is the draw-in itself, tied to real loading progress (geojson + first `/health`), not a fake timer.

### Scene 1: "Most attack maps make things up" (0.00–0.10)
- For about 3 seconds of scroll, the globe fills with random arcs from everywhere to everywhere, clearly stamped
  **"invented: what most maps show"**.
- Then they dissolve, and the caption reads: *"This map only draws what its sources support."*
- These arcs are generated by the client, never sent to the backend, and the stamp stays visible for as long as any
  invented arc is on screen.

### Scene 2: Cloudflare Radar (0.10–0.28)
- A 15-minute "refresh tick" ring pulses once, then arcs draw in. Each arc's frequency matches its share of traffic,
  using the dashboard's weighted-replay logic.
- Caption: *"An arc is a share of traffic over 24 hours, not one live attack."*
- **Network-layer beat:** the camera moves to one L3 origin. The label changes from "attacker" (struck through) to
  **"Cloudflare data-centre country that received the traffic"**, with the reason: *"source IPs in these attacks
  can be spoofed."*
- L3 and L7 keep their token colours **and** their dashboard line styles. A small inline legend names them.

### Scene 3: AbuseIPDB (0.28–0.42)
- Reported networks fall onto the globe as dots at /24 and /48 granularity.
- As the camera pulls back, they blend into the dashboard's density layer.
- Caption: *"IPs reported for any kind of abuse, refreshed every 6 hours. Approximate location, often city-level."*

### Scene 4: The classifier (0.42–0.58, pinned)
- The camera moves close to about five networks. Each gets a score and its **three factor bars** taken directly from
  `GET /threats/{network}`: each bar's direction (raises or lowers), size and plain-English reason, plus an "other"
  bar for the rest.
- Networks the model ranks as likely DoS sources turn from **discs into rings**.
- A short line explains what the model predicts: *"Will this listed IP get a DDoS report?"* Next to it: *"a reason,
  not a verdict."*
- Optional interaction: the visitor picks one of the five networks to inspect. Keyboard reachable.

### Scene 5: Two layers that never join (0.58–0.70)
- The Radar layer and the AbuseIPDB layer lift apart into two transparent shells around the globe.
- A dashed line tries to connect a reported dot to a Radar arc and is refused with a clear ✕.
- Caption: *"Radar publishes no IPs. AbuseIPDB publishes no victims. So they're drawn separately, never joined
  into fake attacker-to-victim pairs."* This is the project's strongest point, so give it room.

### Scene 6: Spike detection (0.70–0.84)
- The 3-day L3 or L7 timeseries rises out of the globe's equator as a ribbon (from `/timeline`).
- The baseline band (median ± MAD over the previous 24 hours, log scale) shades in, then any spike is marked. Use the
  real detector's output; never recompute it differently in the browser.
- A **Replay** button plays the spike over time, as the dashboard's timeline does.
- The caption states the limitation from the README: *"a statistical estimate, not a Cloudflare alert. Radar lags
  by up to about 15 minutes."*
- What it produces: three small cards (Slack-compatible webhook, Prometheus `/metrics`, CSV export), each a short
  real example in monospace.

### Scene 7: Built to last (0.84–0.94)
- A short row of stations, each a label with one line of proof: **Docker** (one image), **CI** (the workflow in
  `.github/workflows/ci.yml`), **Tests** (node:test + Playwright + axe), **Accessibility** (WCAG 2.2 AA, 44 px
  targets, colour-blind-safe tokens), **Kiosk mode**, **Offline IP lookup** (DB-IP Lite, nothing sent to a third
  party).
- Any count shown here comes from the build step (section 4), never typed by hand.

### Scene 8: Into the live map (0.94–1.00)
- The camera eases to the exact framing the dashboard's globe opens with, the overlay fades, and the browser goes
  to `/` (use the View Transitions API where it's supported, and a plain fade elsewhere).
- If the visitor scrolls back up, nothing breaks.

---

## 8. The 2D fallback

The same content in a single accessible, readable column, with small inline SVG diagrams instead of the 3D scenes.
It is shown automatically when WebGL is unavailable or reduced motion is on, with an "Enter 3D anyway" button.
It must look like it belongs to the product (same tokens and type), not like an error page.

On phones the 3D tour stays on, with fewer arcs and dots, and with captions that stack below the globe instead of
covering it.

---

## 9. Quality bar (each item is checked)

- **Performance:** 60 fps on a laptop with an integrated GPU. Pixel ratio capped at 1.5. At most 30 arcs (the
  existing `MAX_ARCS`) plus at most 2,000 dots. Three.js stays lazily loaded, as it already is. The tour's own code
  stays under 60 kB gzipped.
- **Accessibility:** extend `e2e/a11y.spec.js` to cover `/tour` and the fallback (no axe violations). The tour is
  fully usable from the keyboard, focus is always visible, targets are at least 44 px, and the reduced-motion path
  is tested.
- **Correctness:** an e2e test that runs the tour in demo mode and checks that every scene shows an `illustrative`
  badge. A unit test that checks the factor bars add up to the score (`sigmoid(bias + factors + other)`), the same
  check the backend tests make.
- **No regressions:** `npm test` (backend and frontend), `npm run lint`, `npm run e2e` and the token test all pass.
  The dashboard at `/` is unchanged.
- **No console errors** in either mode.

---

## 10. Build phases (stop after each one for review)

1. **Skeleton:** the `/tour` Vite entry, Express serving it, dev proxies, `content.js`, and the complete 2D fallback
   page with all the real copy. *Done when:* `/tour` loads in dev and in the production build, the fallback reads
   well, and axe passes.
2. **Rails:** the globe on a sticky stage, the camera API added to `createGlobe` (the dashboard is unchanged),
   scroll progress driving placeholder scenes, the pipeline bar, the data badge, the live map button and the motion
   toggle. *Done when:* you can scroll from start to finish, the pipeline bar tracks the right scene, and the
   keyboard works.
3. **Scenes 0–3:** hero draw-in, the invented-arcs contrast, Radar (with the L3 origin beat), AbuseIPDB.
4. **Scenes 4–5:** the classifier with real factor bars, and the separated layers.
5. **Scenes 6–8:** the spike ribbon and replay, the output cards, built-to-last, and the hand-off to `/`.
6. **Polish and verification:** mobile tuning, the reduced-motion path, the performance budget, e2e tests for live
   and demo, a README section ("The tour": how to edit the copy and add a scene), and a refreshed
   `docs/screenshot.jpg`.

At the end of each phase, report what you built, what you checked and how (with the commands), and anything you
skipped or are unsure about.

---

## 11. Out of scope

- Any change to dashboard behaviour, data sources, the detector or the classifier.
- Simulating attacks against any host. All illustrative data is generated in the browser and stays there.
- Testimonials, user counts, uptime or deployment claims. None exist (`PRODUCT.md` → Evidence on Hand).
