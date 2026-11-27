import { expect, test } from '@playwright/test';

const current = (page) => page.getByRole('navigation', { name: 'Tour steps' }).locator('[aria-current="step"]');

test('/tour serves the 3D tour, with no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/tour');
  await expect(page).toHaveURL(/\/tour\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Global DoS Attack Map' })).toBeVisible();
  await expect(page.locator('.tour-stage canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the step bar follows the scroll, and a step can be reached by keyboard', async ({ page }) => {
  await page.goto('/tour/');
  await expect(current(page)).toHaveCount(0); // the hero is not a step

  await page.locator('#spikes').scrollIntoViewIfNeeded();
  await expect(current(page)).toHaveText(/Spike detection/);

  // Smooth scrolling under software WebGL can take longer than the assertion waits; this is about the keyboard
  await page.getByRole('button', { name: 'Reduce motion' }).click();
  const classifier = page.getByRole('navigation', { name: 'Tour steps' }).getByRole('link', { name: /Classifier/ });
  await classifier.focus();
  await page.keyboard.press('Enter');
  await expect(current(page)).toHaveText(/Classifier/);
  await expect(page.getByRole('heading', { level: 2, name: /classifier/i })).toBeInViewport();
});

test('every step in the tour nav leads to its section', async ({ page }) => {
  await page.goto('/tour/');
  const links = page.getByRole('navigation', { name: 'Tour steps' }).getByRole('link');
  await expect(links.first()).toBeVisible(); // the 3D stage is loaded lazily
  expect(await links.count()).toBeGreaterThan(5);
  for (const href of await links.evaluateAll((all) => all.map((a) => a.getAttribute('href')))) {
    await expect(page.locator(href)).toHaveCount(1);
  }
});

test('without keys the data badge says illustrative, never live', async ({ page }) => {
  await page.goto('/tour/');
  await expect(page.locator('.tour-badge')).toHaveText('illustrative');
});

test('the tour hands over to the live map', async ({ page }) => {
  await page.goto('/tour/');
  await page.getByRole('link', { name: 'Open live map' }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('main')).toBeVisible();
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the 2D page opens, every figure says it is illustrative, and 3D is one click away', async ({ page }) => {
    await page.goto('/tour/');
    await expect(page.locator('canvas')).toHaveCount(0);
    const captions = page.locator('figure figcaption');
    expect(await captions.count()).toBeGreaterThan(0);
    for (const caption of await captions.all()) await expect(caption).toContainText('Illustrative diagram, not live data');

    await page.getByRole('button', { name: 'Enter 3D anyway' }).click();
    await expect(page.locator('.tour-stage canvas')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reduce motion' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test('without WebGL the 2D page is shown, with no way into a 3D that cannot work', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return String(type).includes('webgl') ? null : original.call(this, type, ...rest);
    };
  });
  await page.goto('/tour/');
  await expect(page.getByRole('heading', { level: 2, name: 'Most attack maps make things up' })).toBeVisible();
  await expect(page.locator('figure').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter 3D anyway' })).toHaveCount(0);
});

test('the globe draws itself in, and the loading line clears once the world map is in', async ({ page }) => {
  await page.goto('/tour/');
  await expect(page.locator('#top .tour-loading')).toHaveText('');
});

test('the invented arcs come stamped as invented', async ({ page }) => {
  await page.goto('/tour/');
  await page.locator('#invented').scrollIntoViewIfNeeded();
  await expect(page.locator('#invented .tour-source')).toHaveText('invented: what most maps show');
});

test('the radar origin beat strikes out "attacker" and names the data-centre country', async ({ page }) => {
  await page.goto('/tour/');
  await page.locator('#origin').scrollIntoViewIfNeeded();
  await expect(current(page)).toHaveText(/Radar/);
  await expect(page.locator('#origin s')).toHaveText('the attacker’s country');
  await expect(page.locator('#origin strong')).toHaveText('the Cloudflare data-centre country that received the traffic');
});

test('in demo mode no scene claims to be live', async ({ page }) => {
  await page.goto('/tour/');
  for (const id of ['radar', 'origin', 'abuse', 'classifier', 'separate', 'spikes']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await expect(page.locator(`#${id} .tour-source`)).toHaveText(/^illustrative/);
  }
  await expect(page.locator('#abuse')).toContainText('reported networks on the globe');
});

test('the classifier: five networks, each explained, picked by pointer or keyboard', async ({ page }) => {
  await page.goto('/tour/');
  await page.locator('#classifier').scrollIntoViewIfNeeded();
  const scene = page.locator('#classifier');
  await expect(scene.locator('.tour-source')).toHaveText(/^illustrative/);
  await expect(scene).toContainText('The model has not been trained on this server');

  const buttons = scene.getByRole('group', { name: 'Networks to inspect' }).getByRole('button');
  await expect(buttons).toHaveCount(5);
  await expect(buttons.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(scene.getByRole('list', { name: 'What moved the score' }).getByRole('listitem')).toHaveCount(4);

  const second = buttons.nth(1);
  const network = (await second.locator('.tour-network').textContent()).trim();
  await second.focus();
  await page.keyboard.press('Enter');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(scene.locator('.tour-explain code')).toHaveText(network);
  await expect(scene.locator('.tour-formula')).toContainText('sigmoid(');
});

test('two layers that never join', async ({ page }) => {
  await page.goto('/tour/');
  await page.locator('#separate').scrollIntoViewIfNeeded();
  await expect(current(page)).toHaveText(/Separate layers/);
  await expect(page.locator('#separate .tour-source')).toHaveText(/^illustrative/);
  await expect(page.locator('#separate')).toContainText('A line joining the two is refused');
});

test('spike detection: the series, the detected spike, and a replay', async ({ page }) => {
  await page.goto('/tour/');
  await page.locator('#spikes').scrollIntoViewIfNeeded();
  const scene = page.locator('#spikes');
  await expect(scene.locator('.tour-source')).toHaveText(/^illustrative/);
  await expect(scene).toContainText('spike: about 3x typical');
  const replay = scene.getByRole('button', { name: /Replay/ });
  await replay.click();
  await expect(replay).toHaveText('Replaying…');
  await expect(replay).toHaveText('Replay', { timeout: 30_000 });
});

test('what a spike produces: real examples of each output', async ({ page }) => {
  await page.goto('/tour/');
  await page.locator('#outputs').scrollIntoViewIfNeeded();
  await expect(current(page)).toHaveText(/Spike detection/);
  const codes = page.locator('#outputs pre');
  await expect(codes).toHaveCount(3);
  await expect(codes.first()).toContainText('Traffic spike on Cloudflare Radar');
});

test('built to last, then the hand-off to the live map', async ({ page }) => {
  await page.goto('/tour/');
  await page.locator('#built').scrollIntoViewIfNeeded();
  await expect(page.locator('#built dt')).toHaveCount(6);
  await page.locator('#live').scrollIntoViewIfNeeded();
  await expect(current(page)).toHaveText(/Live map/);
  await page.locator('#live').getByRole('link', { name: /Open live map/ }).click();
  await expect(page).toHaveURL(/\/$/);
});

// ---- Live mode, with the server faked: the same shapes the backend sends, so every live path runs ----

const NOW = new Date().toISOString();
const germany = { code: 'DE', name: 'Germany', lat: 51.2, lon: 10.4 };
const japan = { code: 'JP', name: 'Japan', lat: 36.2, lon: 138.3 };
const point = (network, lat, lon, dosScore, flagged) => ({ network, country: 'NL', lat, lon, precise: true, reportedAt: NOW, dosScore, flagged });
const LIVE = {
  type: 'snapshot',
  data: {
    status: {
      mode: 'live', radar: { state: 'ok', updatedAt: NOW, error: null }, abuse: { state: 'ok', updatedAt: NOW, error: null },
      geo: 'city', classifier: { state: 'active', threshold: 0.6 }, alerts: { enabled: false, lastSentAt: null },
    },
    spikes: { status: 'normal', active: [] },
    corridors: [{ layer: 'l3', share: 12.5, src: germany, dst: japan }],
    threats: { total: 3, flagged: 1, points: [point('203.0.113.0/24', 52.4, 4.9, 0.91, true), point('198.51.100.0/24', 39, -77, 0.4, false), point('192.0.2.0/24', -23.5, -46.6, 0.05, false)] },
    events: [{ id: 'e1', ts: NOW, source: 'radar', layer: 'l3', share: 12.5, src_country: 'DE', src_name: 'Germany', src_lat: 51.2, src_lon: 10.4, dst_country: 'JP', dst_name: 'Japan', dst_lat: 36.2, dst_lon: 138.3 }],
  },
};
const explanation = { score: 0.91, bias: -1, other: 0.1, factors: [
  { feature: 'hosting', label: 'Network name suggests hosting or cloud', contribution: 2.4, direction: 'raises' },
  { feature: 'log_age_hours', label: 'Time since the last report', contribution: 0.8, direction: 'raises' },
  { feature: 'ipv6', label: 'IPv6 address', contribution: 0.0137, direction: 'raises' }] };
const series = Array.from({ length: 120 }, (_, i) => ({ t: new Date(Date.now() - (119 - i) * 900_000).toISOString(), v: i >= 110 && i < 116 ? 4000 : 1000 }));

test.describe('with live data from the server', () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket('**/ws', (ws) => ws.send(JSON.stringify(LIVE)));
    await page.route('**/threats/**', (route) => route.fulfill({ json: { success: true, network: 'x', threshold: 0.6, explanation } }));
    await page.route('**/timeline?layer=l3*', (route) => route.fulfill({ json: { success: true, layer: 'l3', status: 'normal', points: series,
      spikes: [{ layer: 'l3', start: series[110].t, end: series[115].t, active: false, peakAt: series[112].t, peakZ: 9.4, ratio: 4, baseline: 1000 }] } }));
    await page.route('**/timeline?layer=l7*', (route) => route.fulfill({ json: { success: true, layer: 'l7', status: 'unavailable', points: [], spikes: [] } }));
  });

  test('every data scene says live and shows what the server sent', async ({ page }) => {
    await page.goto('/tour/');
    await expect(page.locator('.tour-badge')).toHaveText(/^live · Radar updated/);

    for (const id of ['radar', 'origin', 'abuse', 'classifier', 'separate', 'spikes']) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await expect(page.locator(`#${id} .tour-source`), id).toHaveText(/^live/);
    }
    await expect(page.locator('#origin')).toContainText('Germany → Japan, 12.5%');
    await expect(page.locator('#abuse')).toContainText('3 reported networks');
    await expect(page.locator('#classifier')).not.toContainText('has not been trained');
    await expect(page.locator('#classifier .tour-networks .btn').first()).toContainText('203.0.113.0/24');
    await expect(page.locator('#spikes')).toContainText('spike: about 4x typical, peak z 9.4');
  });
});

test('reduced motion inside 3D: the camera cuts, and a replay is instant', async ({ page }) => {
  await page.goto('/tour/');
  await page.getByRole('button', { name: 'Reduce motion' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.locator('#spikes').scrollIntoViewIfNeeded();
  const replay = page.locator('#spikes').getByRole('button', { name: /Replay/ });
  await replay.click();
  await expect(replay).toHaveText('Replay');
  await expect(page.locator('.tour-stage canvas')).toBeVisible();
});
