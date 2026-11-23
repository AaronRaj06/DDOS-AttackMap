import { expect, test } from '@playwright/test';

// Every test fails on a console error or an uncaught exception, unless it expects one
let problems;
test.beforeEach(({ page }) => {
  problems = [];
  page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
  page.on('pageerror', (error) => problems.push(error.message));
});
test.afterEach(() => {
  expect(problems, 'console errors').toEqual([]);
});

const canvasBytes = (page) => page.locator('canvas').screenshot();

test('loads, connects over WebSocket and draws a non-blank globe', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Global DoS Attack Map');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Connected' })).toBeVisible();
  await expect(page.getByText('Demo data').first()).toBeVisible();
  await expect(page.getByText('Threat status')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.waitForTimeout(2500);
  // a flat colour compresses to a few kB, a lit globe with land and arcs does not
  expect((await canvasBytes(page)).length).toBeGreaterThan(20_000);
  // routes arrive over the socket, so the lists fill in
  await expect(page.getByRole('button', { name: /→/ }).first()).toBeVisible();
});

test('Pause stops the globe and Resume starts it again', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(500);
  const a = await canvasBytes(page);
  await page.waitForTimeout(2000);
  expect((await canvasBytes(page)).equals(a), 'the picture is frozen').toBe(true);
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForTimeout(2000);
  expect((await canvasBytes(page)).equals(a), 'it moves again').toBe(false);
});

test('filters change the URL, and a link restores them', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Application' }).click();
  await expect(page).toHaveURL(/layer=l7/);
  await page.getByRole('button', { name: 'Flagged only' }).click();
  await expect(page).toHaveURL(/flagged=1/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Application' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Flagged only' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  expect(new URL(page.url()).search).toBe('');
});

test('a shared link sets layer, countries and flagged-only', async ({ page }) => {
  await page.goto('/?layer=l3&country=DE,FR&flagged=1');
  await expect(page.getByRole('button', { name: 'Network', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('list', { name: 'Watched countries' })).toContainText('Germany');
  await expect(page.getByRole('list', { name: 'Watched countries' })).toContainText('France');
  await expect(page.getByRole('button', { name: 'Flagged only' })).toHaveAttribute('aria-pressed', 'true');
});

test('hostile URL values are ignored and never reach the page', async ({ page }) => {
  await page.goto('/?layer=%3Cscript%3Ealert(1)%3C/script%3E&country=ZZ,%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E,DEU&flagged=true&kiosk=yes');
  await expect(page.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('list', { name: 'Watched countries' })).toHaveCount(0);
  expect(await page.content()).not.toContain('onerror');
  expect(new URL(page.url()).search).toBe('');
});

test('the country picker is a keyboard-operable combobox, and the watchlist is remembered', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Watch a country' }).click();
  const box = page.getByRole('combobox', { name: 'Country to watch' });
  await expect(box).toBeFocused();
  await box.fill('jap');
  await expect(page.getByRole('option', { name: /Japan/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('list', { name: 'Watched countries' })).toContainText('Japan');
  await expect(page).toHaveURL(/country=JP/);
  await expect(page.getByRole('button', { name: 'Watch a country' })).toBeFocused();

  await page.goto('/');
  await expect(page.getByRole('list', { name: 'Watched countries' })).toContainText('Japan');
  await page.getByRole('button', { name: 'Stop watching Japan' }).click();
  await expect(page.getByRole('list', { name: 'Watched countries' })).toHaveCount(0);
});

test('Escape closes the country picker without adding anything', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Watch a country' }).click();
  // the picker is a lazy chunk: wait for it, as a person would, before pressing Escape
  await expect(page.getByRole('combobox', { name: 'Country to watch' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Watch a country' })).toBeFocused();
});

test('the flat map shows the same data and the choice is remembered', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Flat map' }).click();
  await expect(page.locator('.map-container svg')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.map-land')).toHaveAttribute('d', /^M/);
  await page.reload();
  await expect(page.locator('.map-container svg')).toBeVisible();
  await page.getByRole('button', { name: '3D globe' }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('keyboard only: skip link, a list opens the card, Escape returns focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);

  const row = page.locator('.sidebar .row').first();
  await expect(row).toBeVisible();
  await row.focus();
  await page.keyboard.press('Enter');
  const card = page.getByRole('region', { name: 'Details' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { level: 2 })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(row).toBeFocused();
});

test('keyboard on the globe: space pauses, plus and arrows do not throw', async ({ page }) => {
  await page.goto('/');
  const globe = page.getByRole('group', { name: /3D globe/ });
  await globe.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', '+', '-']) await page.keyboard.press(key);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});

test('clicking a dot or an arc on the map opens its card', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Flat map' }).click();
  const arc = page.locator('.arc-hit').first();
  await expect(arc).toBeAttached();
  await arc.dispatchEvent('click');
  await expect(page.getByRole('region', { name: 'Details' })).toContainText('→');
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(page.getByRole('region', { name: 'Details' })).toHaveCount(0);
});

test('kiosk mode hides the controls and Escape leaves it', async ({ page }) => {
  await page.goto('/?kiosk=1');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeHidden();
  await expect(page.getByRole('group', { name: 'Filters' })).toBeHidden();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.getByText('Threat status')).toBeVisible();
  await expect(page.getByText('Demo data').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

test('reduced motion follows the system, and the toggle can override it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.getByRole('button', { name: 'Reduce motion' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Reduce motion' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
});

test('collapsed panels are remembered', async ({ page }) => {
  await page.goto('/');
  const summary = page.locator('summary', { hasText: 'Data sources' });
  await summary.click();
  await expect(page.locator('details', { has: summary })).not.toHaveAttribute('open', '');
  // the choice is saved by an effect after the browser toggles the element, so wait for it
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dosmap.panels'))).toContain('"sources":false');
  await page.reload();
  await expect(page.locator('details', { has: page.locator('summary', { hasText: 'Data sources' }) })).not.toHaveAttribute('open', '');
});

for (const [width, height] of [[320, 640], [360, 740], [390, 844], [820, 1000]]) {
  test(`no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForTimeout(800);
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(scroll).toBeLessThanOrEqual(inner);
  });
}

test('on a phone: a menu for the actions, a sheet for the details, a legend that never covers the map', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeHidden();
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused();

  const [map, legend] = await Promise.all([page.locator('.viewport').boundingBox(), page.getByRole('list', { name: 'Legend' }).boundingBox()]);
  expect(legend.y).toBeGreaterThanOrEqual(map.y + map.height - 1);

  await page.getByRole('button', { name: 'Routes, sources and details' }).click();
  const sheet = page.getByRole('dialog', { name: 'Details' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Data sources')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('the demo notice is one dismissible line, and stays dismissed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const notice = page.locator('.notice');
  await expect(notice).toBeVisible();
  expect((await notice.boundingBox()).height).toBeLessThan(60);
  await page.getByRole('button', { name: 'Dismiss this notice' }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.notice')).toHaveCount(0);
  await expect(page.getByText('Demo data').first()).toBeVisible();
});

test('without WebGL the flat map and every panel are still there', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
      return String(type).includes('webgl') ? null : original.call(this, type, ...rest);
    };
  });
  await page.goto('/');
  await expect(page.locator('.map-note')).toContainText('WebGL');
  await expect(page.locator('.map-container svg')).toBeVisible();
  await expect(page.locator('summary', { hasText: 'Top routes' })).toBeVisible();
  await expect(page.locator('summary', { hasText: 'Data sources' })).toBeVisible();
  await expect(page.getByText('Threat status')).toBeVisible();
  // the browser is told, loudly, that a WebGL context could not be made; that is the point of this test
  problems = problems.filter((text) => !/WebGL|THREE|Globe-.*\.js/i.test(text));
});
