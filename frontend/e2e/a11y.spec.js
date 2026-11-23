import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// axe injects a script, which the app's strict CSP rightly refuses, so only this file turns the CSP off
test.use({ bypassCSP: true });

const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function audit(page, label) {
  const { violations } = await new AxeBuilder({ page }).withTags(RULES).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}) on ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(', ')}`);
  expect(summary, `${label}: accessibility violations`).toEqual([]);
}

const states = [
  ['the overview', '/', async () => {}],
  ['a route card opened from the list', '/', async (page) => {
    await page.locator('.sidebar .row').first().click();
    await expect(page.getByRole('region', { name: 'Details' })).toBeVisible();
  }],
  ['the country picker open', '/', async (page) => {
    await page.getByRole('button', { name: 'Watch a country' }).click();
    await expect(page.getByRole('combobox')).toBeFocused();
  }],
  ['the flat map', '/', async (page) => {
    await page.getByRole('button', { name: 'Flat map' }).click();
    await expect(page.locator('.map-container svg')).toBeVisible();
  }],
  ['every panel open', '/', async (page) => {
    for (const name of ['Network attack vectors', 'Attack size, network layer', 'Recently drawn']) {
      const summary = page.locator('summary', { hasText: name });
      if (await summary.count()) await summary.click();
    }
  }],
  ['kiosk mode', '/?kiosk=1', async () => {}],
  ['filters from a link', '/?layer=l7&country=DE,FR&flagged=1', async () => {}],
];

for (const [label, path, setup] of states) {
  test(`no accessibility violations: ${label}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(2500);
    await setup(page);
    await audit(page, label);
  });
}

test('no accessibility violations on a phone: the menu and the sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Menu' }).click();
  await audit(page, 'phone menu');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Routes, sources and details' }).click();
  await expect(page.getByRole('dialog', { name: 'Details' })).toBeVisible();
  await audit(page, 'phone sheet');
});

test('every control has a visible focus ring and is at least 44px', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2500);
  const failures = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('button, a[href], input, summary, [role="combobox"], [tabindex="0"]')) {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || getComputedStyle(el).visibility === 'hidden') continue;
      const name = (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().slice(0, 40);
      // 44px on the short side, with a 1px allowance for sub-pixel rounding
      if (box.height < 43 && !el.closest('.skip-link')) bad.push(`${name}: ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    return bad;
  });
  expect(failures, 'targets under 44px').toEqual([]);

  // Tab through everything: each stop must show a focus indicator
  const unringed = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const ringed = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
      return { name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40), ringed };
    });
    if (stop && !stop.ringed) unringed.push(stop.name);
  }
  expect(unringed, 'focused controls without a ring').toEqual([]);
});
