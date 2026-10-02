import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const oceanTile = readFileSync(new URL('../fixtures/ocean-tile.png', import.meta.url));

test.beforeEach(async ({ page }) => {
  // Geographic routing is verified offline against the land polygons. Browser
  // tests exercise the real WebGL renderer without downloading imagery repeatedly.
  await page.route('https://services.arcgisonline.com/**/tile/**', (route) => route.fulfill({
    contentType: 'image/png', body: oceanTile,
  }));
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'image/png', body: oceanTile,
  }));
});

async function openSimulator(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('simulation-position')).toBeVisible({ timeout: 15_000 });
}

async function distance(page: Page) {
  return Number(await page.getByTestId('simulation-position').getAttribute('data-distance'));
}

test('renders the real 3D scene and advances the vessel along its sea route', async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /THREE|shader.*error|WebGL.*error/i.test(message.text())) runtimeErrors.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openSimulator(page);
  await expect(page.getByTestId('voyage-scene')).toHaveAttribute('data-scene-status', 'ready', { timeout: 20_000 });
  await expect(page.getByTestId('voyage-scene')).toHaveAttribute('data-rendered-ships', '4');
  await expect(page.getByTestId('voyage-scene').locator('canvas')).toBeVisible();
  const start = await distance(page);
  await expect.poll(() => distance(page), { timeout: 10_000 }).toBeGreaterThan(start);
  await page.screenshot({ path: testInfo.outputPath('simulation-desktop.png'), fullPage: true });
  expect(runtimeErrors).toEqual([]);
});

test('pause freezes position, resume continues, and speed changes do not reset the voyage', async ({ page }) => {
  await openSimulator(page);
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  const paused = await distance(page);
  await page.waitForTimeout(400);
  expect(await distance(page)).toBe(paused);
  await page.getByRole('combobox', { name: 'Simulation speed' }).selectOption('600');
  expect(await distance(page)).toBe(paused);
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
  await expect.poll(() => distance(page)).toBeGreaterThan(paused);
});

test('fleet selection shares one simulation clock and both camera modes work', async ({ page }) => {
  await openSimulator(page);
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  const original = await distance(page);
  await page.getByRole('button', { name: 'Select ONE HAMBURG', exact: true }).click();
  await expect(page.getByTestId('simulation-position')).toHaveAttribute('data-imo', '9395159');
  await page.getByRole('button', { name: 'Route overview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Route overview', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Follow vessel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Follow vessel', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Select ONE INNOVATION', exact: true }).click();
  await expect(page.getByTestId('simulation-position')).toHaveAttribute('data-imo', '9939137');
  expect(await distance(page)).toBe(original);
});

test('seeking to the end stops at the destination and restart returns to the initial state', async ({ page }) => {
  await openSimulator(page);
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  const initial = await distance(page);
  const timeline = page.getByRole('slider', { name: 'Simulation timeline' });
  await timeline.focus();
  await timeline.press('End');
  await expect(page.getByTestId('simulation-position')).toHaveAttribute('data-progress', '1');
  const arrived = await distance(page);
  expect(arrived).toBeGreaterThan(initial);
  await page.waitForTimeout(250);
  expect(await distance(page)).toBe(arrived);
  await page.getByRole('button', { name: 'Restart simulation', exact: true }).click();
  await expect.poll(() => distance(page)).toBeLessThan(arrived / 2);
});

test('simulation is labeled separately from received AIS data', async ({ page }) => {
  await openSimulator(page);
  await expect(page.getByText(/simulation/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'AIS tracker', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Select vessel' })).toBeVisible();
  await expect(page.getByText(/^Sample position · demo mode/)).toBeVisible();
  await page.getByRole('button', { name: '3D simulation', exact: true }).click();
  await expect(page.getByTestId('simulation-position')).toBeVisible();
});

test('mobile simulation controls remain visible and there is no page overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSimulator(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play simulation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select ONE APUS', exact: true }).click();
  await expect(page.getByTestId('simulation-position')).toHaveAttribute('data-imo', '9806079');
  await expect(page.getByTestId('voyage-scene')).toHaveAttribute('data-scene-status', 'ready', { timeout: 20_000 });
  // Let the 950 ms camera transfer finish before capturing a different ocean.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: testInfo.outputPath('simulation-mobile.png'), fullPage: true });
});
